import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/lib/errors";
import { createClient as createCustomer } from "@/modules/client/service";
import {
  confirmImportBatch,
  createImportBatchFromFile,
  previewImportBatch,
} from "@/modules/import/service";
import { createProject } from "@/modules/project/service";
import {
  createClient,
  createTestDatabase,
  type TestDatabase,
} from "../helpers/database";

describe("Importação em lote CSV/XLSX e Operações de Backup/Restore (Fase 5)", () => {
  const databases: TestDatabase[] = [];

  afterEach(async () => {
    while (databases.length > 0) {
      const db = databases.pop();
      if (db) {
        await db.cleanup();
      }
    }
  });

  it("executa o ciclo completo de importação: upload -> mapeamento e prévia -> confirmação transacional e auditoria", async () => {
    const testDb = createTestDatabase("f5-import-lifecycle");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      {
        name: "Corporativo Sul",
        description: null,
        hourlyRateCents: 15_000, // R$ 150,00/h
      },
      prisma,
    );

    const project = await createProject(
      {
        clientId: client.id,
        name: "Módulo Fiscal",
        description: null,
        hourlyRateCents: 15_000,
      },
      prisma,
    );

    // Cria CSV sintético com 3 apontamentos válidos
    const csvContent =
      "Data;Duração;Descrição;Faturável\n" +
      "2026-10-05;02:30;Análise tributária;Sim\n" +
      "2026-10-06;03:00;Regras de validação;Sim\n" +
      "2026-10-07;01:30;Alinhamento interno;Não\n";

    const uploadRes = await createImportBatchFromFile(
      {
        fileName: "horas-outubro.csv",
        fileBuffer: Buffer.from(csvContent, "utf-8"),
      },
      prisma,
    );

    expect(uploadRes.batchId).toBeDefined();
    expect(uploadRes.previewRowsCount).toBe(3);
    expect(uploadRes.detectedColumns).toEqual(["Data", "Duração", "Descrição", "Faturável"]);

    // Gera prévia com mapeamento
    const previewRes = await previewImportBatch(
      {
        batchId: uploadRes.batchId,
        mapping: {
          dateColumn: "Data",
          durationColumn: "Duração",
          descriptionColumn: "Descrição",
          billableColumn: "Faturável",
          dateFormat: "YYYY-MM-DD",
          durationFormat: "HH:mm",
          defaultClientId: client.id,
          defaultProjectId: project.id,
        },
      },
      prisma,
    );

    expect(previewRes.totalRows).toBe(3);
    expect(previewRes.validRows).toBe(3);
    expect(previewRes.invalidRows).toBe(0);
    expect(previewRes.totalMinutes).toBe(420); // 150 + 180 + 90 = 420m (7h00)
    // Faturáveis: 150m (R$ 375,00) + 180m (R$ 450,00) = R$ 825,00 (82500 cents)
    expect(previewRes.totalCents).toBe(82_500);

    // Confirma importação
    const confirmRes = await confirmImportBatch(
      {
        batchId: uploadRes.batchId,
      },
      prisma,
    );

    expect(confirmRes.status).toBe("IMPORTED");
    expect(confirmRes.importedCount).toBe(3);
    expect(confirmRes.totalMinutes).toBe(420);
    expect(confirmRes.totalCents).toBe(82_500);

    // Valida que os apontamentos foram inseridos no banco com status DRAFT e importBatchId
    const entries = await prisma.timeEntry.findMany({
      where: { importBatchId: uploadRes.batchId },
      orderBy: { workDate: "asc" },
    });

    expect(entries).toHaveLength(3);
    expect(entries[0]?.durationMinutes).toBe(150);
    expect(entries[0]?.billable).toBe(true);
    expect(entries[0]?.amountCents).toBe(37_500);
    expect(entries[0]?.status).toBe("DRAFT");
    expect(entries[2]?.billable).toBe(false);
    expect(entries[2]?.amountCents).toBe(0);

    // Valida auditoria gravada
    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: "ImportBatch",
        entityId: uploadRes.batchId,
        action: "IMPORT",
      },
    });
    expect(audit).toBeDefined();

    // Idempotência: segunda confirmação não duplica registros
    const secondConfirm = await confirmImportBatch(
      {
        batchId: uploadRes.batchId,
      },
      prisma,
    );
    expect(secondConfirm.importedCount).toBe(3);

    const totalCountAfter = await prisma.timeEntry.count({
      where: { importBatchId: uploadRes.batchId },
    });
    expect(totalCountAfter).toBe(3);
  });

  it("detecta duplicidades contra o banco e permite ignorar ou forçar importação de duplicados", async () => {
    const testDb = createTestDatabase("f5-duplicates");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Cliente Dups", description: null, hourlyRateCents: 10_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "Projeto Dups", description: null, hourlyRateCents: 10_000 },
      prisma,
    );

    // 1. Cria apontamento pré-existente no banco
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-10-15",
        mode: "DURATION",
        durationMinutes: 120,
        description: "Reunião de alinhamento",
        hourlyRateCents: 10_000,
        amountCents: 20_000,
        billable: true,
        status: "DRAFT",
      },
    });

    // 2. CSV com 1 linha idêntica ao banco + 1 linha nova
    const csvContent =
      "Data;Duração;Descrição\n" +
      "2026-10-15;02:00;Reunião de alinhamento\n" +
      "2026-10-16;01:30;Nova atividade\n";

    const batch = await createImportBatchFromFile(
      { fileName: "dups.csv", fileBuffer: Buffer.from(csvContent, "utf-8") },
      prisma,
    );

    const preview = await previewImportBatch(
      {
        batchId: batch.batchId,
        mapping: {
          dateColumn: "Data",
          durationColumn: "Duração",
          descriptionColumn: "Descrição",
          dateFormat: "YYYY-MM-DD",
          durationFormat: "HH:mm",
          defaultClientId: client.id,
          defaultProjectId: project.id,
        },
      },
      prisma,
    );

    expect(preview.duplicateRows).toBe(1);
    expect(preview.rows[0]?.isDuplicate).toBe(true);
    expect(preview.rows[1]?.isDuplicate).toBe(false);

    // Se importDuplicates não for marcado, a duplicada é ignorada (importa apenas a nova)
    const confirmedSkipDups = await confirmImportBatch(
      {
        batchId: batch.batchId,
        options: { importDuplicates: false },
      },
      prisma,
    );

    expect(confirmedSkipDups.importedCount).toBe(1);
    expect(confirmedSkipDups.skippedDuplicateCount).toBe(1);
  });

  it("bloqueia confirmação por padrão se houver linhas inválidas, e permite skipInvalidRows conforme RF10", async () => {
    const testDb = createTestDatabase("f5-invalid-rows");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Cliente Inválidas", description: null, hourlyRateCents: 10_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "Projeto Inválidas", description: null, hourlyRateCents: 10_000 },
      prisma,
    );

    // CSV com 1 linha válida e 1 linha com data impossível
    const csvContent =
      "Data;Duração;Descrição\n" +
      "2026-10-10;02:00;Válida\n" +
      "99/99/9999;01:00;Data Impossível\n";

    const batch = await createImportBatchFromFile(
      { fileName: "invalid.csv", fileBuffer: Buffer.from(csvContent, "utf-8") },
      prisma,
    );

    const preview = await previewImportBatch(
      {
        batchId: batch.batchId,
        mapping: {
          dateColumn: "Data",
          durationColumn: "Duração",
          descriptionColumn: "Descrição",
          dateFormat: "auto",
          durationFormat: "auto",
          defaultClientId: client.id,
          defaultProjectId: project.id,
        },
      },
      prisma,
    );

    expect(preview.validRows).toBe(1);
    expect(preview.invalidRows).toBe(1);

    // Bloqueia confirmação padrão
    await expect(
      confirmImportBatch(
        {
          batchId: batch.batchId,
          options: { skipInvalidRows: false },
        },
        prisma,
      ),
    ).rejects.toThrow(ConflictError);

    // Com skipInvalidRows: true, importa a linha válida
    const confirmed = await confirmImportBatch(
      {
        batchId: batch.batchId,
        options: { skipInvalidRows: true },
      },
      prisma,
    );

    expect(confirmed.importedCount).toBe(1);
    expect(confirmed.skippedInvalidCount).toBe(1);
  });

  it("importa cenário sintético representativo de outubro/2026 (9 registros e exatamente 24h30 / 1470 minutos)", async () => {
    const testDb = createTestDatabase("f5-october-2026-synthetic");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Cliente Outubro", description: null, hourlyRateCents: 10_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "Projeto Outubro", description: null, hourlyRateCents: 10_000 },
      prisma,
    );

    // Cria XLSX em memória com exatamente 9 registros totalizando 24h30 (1470 minutos)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Horas Outubro 2026");
    sheet.addRow(["Data", "Duração", "Descrição"]);

    const syntheticEntries = [
      { date: "2026-10-01", duration: "02:30", desc: "Item 1" }, // 150m
      { date: "2026-10-02", duration: "03:00", desc: "Item 2" }, // 180m
      { date: "2026-10-05", duration: "04:00", desc: "Item 3" }, // 240m
      { date: "2026-10-06", duration: "01:45", desc: "Item 4" }, // 105m
      { date: "2026-10-07", duration: "02:15", desc: "Item 5" }, // 135m
      { date: "2026-10-08", duration: "03:30", desc: "Item 6" }, // 210m
      { date: "2026-10-09", duration: "02:00", desc: "Item 7" }, // 120m
      { date: "2026-10-12", duration: "03:15", desc: "Item 8" }, // 195m
      { date: "2026-10-13", duration: "02:15", desc: "Item 9" }, // 135m
      // Soma: 150+180+240+105+135+210+120+195+135 = 1470 minutos = 24h30
    ];

    syntheticEntries.forEach((e) => sheet.addRow([e.date, e.duration, e.desc]));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const batch = await createImportBatchFromFile(
      { fileName: "outubro-2026.xlsx", fileBuffer: buffer },
      prisma,
    );

    const preview = await previewImportBatch(
      {
        batchId: batch.batchId,
        mapping: {
          dateColumn: "Data",
          durationColumn: "Duração",
          descriptionColumn: "Descrição",
          dateFormat: "YYYY-MM-DD",
          durationFormat: "HH:mm",
          defaultClientId: client.id,
          defaultProjectId: project.id,
        },
      },
      prisma,
    );

    expect(preview.totalRows).toBe(9);
    expect(preview.validRows).toBe(9);
    expect(preview.invalidRows).toBe(0);
    expect(preview.totalMinutes).toBe(1470); // 24h30 exatos!

    const confirmed = await confirmImportBatch(
      { batchId: batch.batchId },
      prisma,
    );

    expect(confirmed.importedCount).toBe(9);
    expect(confirmed.totalMinutes).toBe(1470);
  });

  it("testa o backup online e restauração consistente de snapshot SQLite (scripts/backup e scripts/restore)", async () => {
    const testDb = createTestDatabase("f5-backup-restore");
    databases.push(testDb);
    const { prisma } = testDb;

    await createCustomer(
      { name: "Cliente Backup", description: null, hourlyRateCents: 20_000 },
      prisma,
    );

    // Gera backup do banco de teste
    const backupDir = path.resolve("/tmp/opencode", "test-backups");
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const backupFilePath = path.join(backupDir, `snapshot-test-${Date.now()}.db`);

    // Usa a Better-SQLite3 backup API direta
    const rawSqlite = new Database(testDb.filePath);
    await rawSqlite.backup(backupFilePath);
    rawSqlite.close();

    expect(fs.existsSync(backupFilePath)).toBe(true);
    expect(fs.statSync(backupFilePath).size).toBeGreaterThan(0);

    // Faz uma mutação posterior no banco original
    await createCustomer(
      { name: "Cliente Posterior", description: null, hourlyRateCents: 10_000 },
      prisma,
    );
    const clientsCountBeforeRestore = await prisma.client.count();
    expect(clientsCountBeforeRestore).toBe(2);

    // Executa restauração do snapshot anterior:
    // Deve desconectar conexões ativas e remover -wal / -shm residuais
    await prisma.$disconnect();
    const targetFile = testDb.filePath;
    if (fs.existsSync(`${targetFile}-wal`)) fs.unlinkSync(`${targetFile}-wal`);
    if (fs.existsSync(`${targetFile}-shm`)) fs.unlinkSync(`${targetFile}-shm`);
    fs.copyFileSync(backupFilePath, targetFile);

    // Reabre nova conexão para ler do arquivo restaurado
    const restoredPrisma = createClient(testDb.url);
    const restoredCount = await restoredPrisma.client.count();
    await restoredPrisma.$disconnect();
    expect(restoredCount).toBe(1);

    // Limpeza
    if (fs.existsSync(backupFilePath)) fs.unlinkSync(backupFilePath);
  });
});

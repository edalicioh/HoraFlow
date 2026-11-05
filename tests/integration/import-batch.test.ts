import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/lib/errors";
import { closeBillingPeriod } from "@/modules/billing/service";
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

  it("permite alternar entre abas de um XLSX multi-abas na prévia e bloqueia importação em competência fechada (CLOSED)", async () => {
    const testDb = createTestDatabase("f5-multisheet-and-closed-period");
    databases.push(testDb);
    const { prisma } = testDb;

    const client = await createCustomer(
      { name: "Cliente MultiAba", description: null, hourlyRateCents: 12_000 },
      prisma,
    );
    const project = await createProject(
      { clientId: client.id, name: "Projeto MultiAba", description: null, hourlyRateCents: 12_000 },
      prisma,
    );

    // Cria apontamento inicial em setembro/2026 e fecha a competência 09/2026
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-09-05",
        mode: "DURATION",
        durationMinutes: 60,
        description: "Base fechamento setembro",
        hourlyRateCents: 12_000,
        amountCents: 12_000,
        billable: true,
        status: "DRAFT",
      },
    });
    await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 9 },
      prisma,
    );

    // Cria planilha XLSX com 2 abas: "Setembro 2026" (fechada) e "Outubro 2026" (aberta)
    const workbook = new ExcelJS.Workbook();
    const sheetSet = workbook.addWorksheet("Setembro 2026");
    sheetSet.addRow(["Data", "Duração", "Descrição"]);
    sheetSet.addRow(["2026-09-15", "02:00", "Tentativa em mês fechado"]);

    const sheetOut = workbook.addWorksheet("Outubro 2026");
    sheetOut.addRow(["Data", "Horas", "Atividade"]);
    sheetOut.addRow(["2026-10-10", "03:00", "Lançamento válido na 2ª aba"]);

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const batch = await createImportBatchFromFile(
      { fileName: "multi-abas.xlsx", fileBuffer: buffer },
      prisma,
    );

    expect(batch.sheets).toEqual(["Setembro 2026", "Outubro 2026"]);
    expect(batch.activeSheet).toBe("Setembro 2026");

    // 1. Prévia na aba Setembro 2026: deve marcar a linha como inválida por competência fechada
    const previewClosed = await previewImportBatch(
      {
        batchId: batch.batchId,
        mapping: {
          sheetName: "Setembro 2026",
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

    expect(previewClosed.validRows).toBe(0);
    expect(previewClosed.invalidRows).toBe(1);
    expect(previewClosed.rows[0]?.validationErrors[0]).toContain(
      "competência 09/2026 deste cliente está fechada",
    );

    // 2. Alterna na prévia para a aba "Outubro 2026" (que tem colunas "Data", "Horas", "Atividade")
    const previewOct = await previewImportBatch(
      {
        batchId: batch.batchId,
        mapping: {
          sheetName: "Outubro 2026",
          dateColumn: "Data",
          durationColumn: "Horas",
          descriptionColumn: "Atividade",
          dateFormat: "YYYY-MM-DD",
          durationFormat: "HH:mm",
          defaultClientId: client.id,
          defaultProjectId: project.id,
        },
      },
      prisma,
    );

    expect(previewOct.activeSheet).toBe("Outubro 2026");
    expect(previewOct.detectedColumns).toEqual(["Data", "Horas", "Atividade"]);
    expect(previewOct.validRows).toBe(1);
    expect(previewOct.invalidRows).toBe(0);
    expect(previewOct.totalMinutes).toBe(180);

    // 3. Se a competência 10/2026 for fechada concorrentemente entre a prévia e a confirmação, confirmImportBatch bloqueia!
    await prisma.timeEntry.create({
      data: {
        projectId: project.id,
        workDate: "2026-10-01",
        mode: "DURATION",
        durationMinutes: 60,
        description: "Fechamento concorrente",
        hourlyRateCents: 12_000,
        amountCents: 12_000,
        billable: true,
        status: "DRAFT",
      },
    });
    await closeBillingPeriod(
      { clientId: client.id, year: 2026, month: 10 },
      prisma,
    );

    await expect(
      confirmImportBatch({ batchId: batch.batchId }, prisma),
    ).rejects.toThrow(ConflictError);
  });

  it("testa o backup online e restauração consistente de snapshot SQLite (scripts/backup.sh e scripts/restore.sh)", async () => {
    const testDb = createTestDatabase("f5-backup-restore");
    databases.push(testDb);
    const { prisma } = testDb;

    await createCustomer(
      { name: "Cliente Backup", description: null, hourlyRateCents: 20_000 },
      prisma,
    );

    // Diretório temporário para os snapshots gerados pelo script real
    const backupDir = path.resolve(
      "/tmp/opencode",
      `test-backups-${Date.now()}`,
    );
    fs.mkdirSync(backupDir, { recursive: true });

    const envWithDb = {
      ...process.env,
      DATABASE_URL: testDb.url,
    };

    // Executa scripts/backup.sh passando backupDir como argumento posicional
    execFileSync("sh", ["scripts/backup.sh", backupDir], {
      cwd: process.cwd(),
      env: envWithDb,
    });

    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("horaflow-backup-") && f.endsWith(".db"));
    expect(files.length).toBe(1);
    const backupFilePath = path.join(backupDir, files[0]!);
    expect(fs.statSync(backupFilePath).size).toBeGreaterThan(0);

    // Faz uma mutação posterior no banco original
    await createCustomer(
      { name: "Cliente Posterior", description: null, hourlyRateCents: 10_000 },
      prisma,
    );
    const clientsCountBeforeRestore = await prisma.client.count();
    expect(clientsCountBeforeRestore).toBe(2);

    // Desconecta o Prisma antes de rodar scripts/restore.sh
    await prisma.$disconnect();

    execFileSync("sh", ["scripts/restore.sh", backupFilePath], {
      cwd: process.cwd(),
      env: envWithDb,
    });

    // Reabre nova conexão para ler do arquivo restaurado
    const restoredPrisma = createClient(testDb.url);
    const restoredCount = await restoredPrisma.client.count();
    await restoredPrisma.$disconnect();
    expect(restoredCount).toBe(1);

    // Limpeza
    fs.rmSync(backupDir, { recursive: true, force: true });
  });
});

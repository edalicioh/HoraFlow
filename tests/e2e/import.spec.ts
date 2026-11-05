import { expect, test } from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

test("executa o fluxo completo do assistente de importação CSV com mapeamento, prévia e confirmação transacional", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString().slice(-6);
  const clientName = `Cliente Import ${suffix}`;
  const projectName = `Projeto Import ${suffix}`;

  const dbUrl =
    process.env.E2E_DATABASE_URL ?? "file:/tmp/opencode/horaflow-f0-e2e.db";
  const adapter = new PrismaBetterSqlite3({ url: dbUrl, timeout: 5_000 });
  const prisma = new PrismaClient({ adapter });

  // 1. Cria cliente e projeto de destino diretamente no banco do ambiente E2E
  const client = await prisma.client.create({
    data: {
      name: clientName,
      hourlyRateCents: 10_000, // R$ 100,00/h
    },
  });

  const project = await prisma.project.create({
    data: {
      name: projectName,
      clientId: client.id,
    },
  });

  // 2. Prepara arquivo CSV temporário com apontamentos para setembro/2026
  // 02:30 (150m) + 01:15 (75m) = 225m (03:45). A R$ 100/h = R$ 375,00.
  const tempCsvPath = path.join(os.tmpdir(), `import-e2e-${suffix}.csv`);
  const desc1 = `Implementação do módulo E2E ${suffix}`;
  const desc2 = `Reunião de validação de importação ${suffix}`;
  const csvContent = [
    "data;duracao;descricao",
    `2026-09-10;02:30;${desc1}`,
    `2026-09-11;01:15;${desc2}`,
  ].join("\n");
  fs.writeFileSync(tempCsvPath, csvContent, "utf-8");

  try {
    // 3. Acessa o assistente de importação
    await page.goto("/import");
    await expect(
      page.getByRole("heading", {
        name: "Importar Histórico",
        level: 1,
      }),
    ).toBeVisible();

    // 4. Envia o arquivo CSV (Etapa 1)
    await page.locator('input[type="file"]').setInputFiles(tempCsvPath);
    await page.getByTestId("upload-file-button").click();

    // 5. Verifica carregamento da tela de mapeamento e prévia
    await expect(page).toHaveURL(/\/import\?batchId=/);
    await expect(page.getByTestId("import-mapping-card")).toBeVisible();

    // Ajusta o cliente e projeto no mapeamento
    await page.getByLabel(/Cliente de Destino/).selectOption({
      value: client.id,
    });
    // Seleciona o projeto
    await page.getByLabel(/Projeto de Destino/).selectOption({
      value: project.id,
    });

    // Clica em gerar / atualizar prévia com o cliente e projeto selecionados
    await page.getByTestId("generate-preview-button").click();
    await expect(page).toHaveURL(/\/import\?batchId=/);

    // 6. Verifica a tabela e os indicadores consolidados da prévia
    await expect(page.getByTestId("import-preview-results-card")).toBeVisible();
    await expect(page.getByTestId("preview-total-duration")).toHaveText("03:45");
    await expect(page.getByTestId("preview-total-amount")).toContainText("375,00");

    // 7. Confirma a importação transacional
    await page.getByTestId("confirm-import-button").click();

    // 8. Verifica tela de sucesso com contagem de apontamentos
    await expect(page.getByTestId("import-success-card")).toBeVisible();
    await expect(
      page.getByText(/2 apontamento\(s\) importado\(s\)/),
    ).toBeVisible();

    // 9. Navega para o calendário e confere os apontamentos importados
    await page.goto("/timesheet?year=2026&month=9&date=2026-09-10");
    const entryCard1 = page
      .getByTestId("selected-day-entries")
      .locator('[data-testid^="time-entry-card-"]')
      .filter({ hasText: desc1 });
    await expect(entryCard1).toBeVisible();
    await expect(entryCard1).toContainText("02:30");

    await page.goto("/timesheet?year=2026&month=9&date=2026-09-11");
    const entryCard2 = page
      .getByTestId("selected-day-entries")
      .locator('[data-testid^="time-entry-card-"]')
      .filter({ hasText: desc2 });
    await expect(entryCard2).toBeVisible();
    await expect(entryCard2).toContainText("01:15");

    // 10. Navega para o Dashboard de setembro/2026 e verifica indicadores consolidados
    await page.goto("/dashboard?year=2026&month=9");
    await expect(page.getByTestId("kpi-worked-hours-value")).toBeVisible();
    await expect(page.getByTestId("kpi-accumulated-value-cents")).toBeVisible();
  } finally {
    if (fs.existsSync(tempCsvPath)) {
      fs.unlinkSync(tempCsvPath);
    }
    await prisma.$disconnect();
  }
});

import { expect, test } from "@playwright/test";

test("atualiza o /dashboard após mutações e valida /reports com exportações CSV, XLSX e PDF", async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString().slice(-6);
  const clientName = `Cliente Rel ${suffix}`;
  const projectName = `Projeto Rel ${suffix}`;

  // 1. Cria cliente e projeto dedicados
  await page.goto("/clients");
  await page.getByLabel("Nome do cliente").fill(clientName);
  await page.getByLabel("Tarifa padrão do cliente (R$/h)").fill("150,00");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(
    page.getByText(`Cliente "${clientName}" criado com sucesso.`),
  ).toBeVisible();

  await page.goto("/projects");
  await page
    .getByLabel("Cliente vinculado")
    .selectOption({ label: `${clientName} (R$ 150,00/h)` });
  await page.getByLabel("Nome do projeto").fill(projectName);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(
    page.getByText(`Projeto "${projectName}" criado com sucesso.`),
  ).toBeVisible();

  // 2. Registra horas em uma competência dedicada (08/2026) para verificação determinística no Dashboard
  await page.goto("/timesheet?year=2026&month=8&date=2026-08-14");
  await page
    .getByLabel("Cliente do apontamento")
    .selectOption({ label: clientName });
  await page
    .getByLabel("Projeto do apontamento")
    .selectOption({ label: `${projectName} (R$ 150,00/h · Cliente)` });
  await page.getByLabel("Duração (HH:mm)").fill("04:00"); // R$ 600,00
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Consultoria estratégica de agosto");
  await page.getByRole("button", { name: "Registrar horas" }).click();
  await expect(
    page.getByText("Apontamento de 04:00 registrado em 2026-08-14."),
  ).toBeVisible();

  // 3. Verifica /dashboard para 08/2026 antes do fechamento (tudo em "A faturar (rascunho)")
  await page.goto("/dashboard?year=2026&month=8");
  await expect(page.getByTestId("kpi-worked-hours-value")).toHaveText("04:00");
  await expect(page.getByTestId("kpi-billable-hours-value")).toHaveText(
    "04:00",
  );
  await expect(page.getByTestId("kpi-worked-days-value")).toHaveText("1");
  await expect(page.getByTestId("kpi-accumulated-value-cents")).toContainText(
    "600,00",
  );
  await expect(page.getByTestId("kpi-unbilled-draft-cents")).toContainText(
    "600,00",
  );
  await expect(page.getByTestId("kpi-closed-balance-cents")).toContainText(
    "0,00",
  );
  await expect(page.getByTestId("dashboard-client-distribution")).toContainText(
    clientName,
  );
  await expect(
    page.getByTestId("dashboard-project-distribution"),
  ).toContainText(projectName);

  // 4. Fecha competência 08/2026 e registra pagamento parcial de R$ 250,00
  await page.goto("/billing");
  await page
    .getByLabel("Cliente para fechamento")
    .selectOption({ label: clientName });
  await page.getByLabel("Mês da competência").selectOption("8");
  await page.getByLabel("Ano da competência").fill("2026");
  await page
    .getByRole("button", { name: "Gerar prévia de fechamento" })
    .click();

  await page
    .getByTestId("closing-preview-panel")
    .getByRole("button", { name: "Confirmar fechamento mensal" })
    .click();

  await expect(page.getByTestId("detail-total-cents")).toContainText("600,00");
  await expect(page.getByTestId("detail-balance-cents")).toContainText(
    "600,00",
  );

  const paymentForm = page.getByTestId("create-payment-form");
  await paymentForm.getByLabel("Valor do pagamento (R$)").fill("250,00");
  await paymentForm.getByLabel("Data do pagamento").fill("2026-08-25");
  await paymentForm.getByLabel("Forma de pagamento").selectOption("PIX");
  await paymentForm
    .getByRole("button", { name: "Registrar pagamento" })
    .click();
  await expect(page.getByTestId("detail-paid-cents")).toContainText("250,00");

  // 5. Revalida /dashboard após fechamento e pagamento parcial (sem dupla contagem!)
  await page.goto("/dashboard?year=2026&month=8");
  await expect(page.getByTestId("kpi-accumulated-value-cents")).toContainText(
    "600,00",
  );
  await expect(page.getByTestId("kpi-received-value-cents")).toContainText(
    "250,00",
  );
  await expect(page.getByTestId("kpi-unbilled-draft-cents")).toContainText(
    "0,00",
  );
  await expect(page.getByTestId("kpi-closed-balance-cents")).toContainText(
    "350,00",
  );
  await expect(page.getByTestId("kpi-pending-value-cents")).toContainText(
    "350,00",
  );

  // 6. Navega para /reports a partir do botão do Dashboard
  await page.getByTestId("dashboard-open-reports").click();
  await expect(page.getByTestId("reports-page")).toBeVisible();
  await expect(page.getByTestId("report-totals-row")).toContainText("04:00");
  await expect(page.getByTestId("report-totals-row")).toContainText("600,00");

  // Alterna para Apontamentos Detalhados mantendo o filtro da competência 08/2026
  await page.getByTestId("report-tab-detailed-entries").click();
  await expect(page.getByTestId("report-data-table")).toContainText(clientName);
  await expect(page.getByTestId("report-data-table")).toContainText(
    "Consultoria estratégica de agosto",
  );

  // 7. Valida os links de exportação CSV, XLSX e PDF da consulta ativa
  const csvHref = await page
    .getByTestId("export-csv-link")
    .getAttribute("href");
  const xlsxHref = await page
    .getByTestId("export-xlsx-link")
    .getAttribute("href");
  const pdfHref = await page
    .getByTestId("export-pdf-link")
    .getAttribute("href");

  expect(csvHref).toBeTruthy();
  expect(xlsxHref).toBeTruthy();
  expect(pdfHref).toBeTruthy();

  const csvRes = await request.get(csvHref!);
  expect(csvRes.status()).toBe(200);
  expect(csvRes.headers()["content-type"]).toContain("text/csv");
  expect(csvRes.headers()["content-disposition"]).toContain(".csv");
  const csvText = await csvRes.text();
  expect(csvText).toContain(clientName);
  expect(csvText).toContain("04:00");
  expect(csvText).toContain("600,00");

  const xlsxRes = await request.get(xlsxHref!);
  expect(xlsxRes.status()).toBe(200);
  expect(xlsxRes.headers()["content-type"]).toContain(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  expect(xlsxRes.headers()["content-disposition"]).toContain(".xlsx");
  const xlsxBytes = await xlsxRes.body();
  // Assinatura ZIP/OOXML "PK"
  expect(xlsxBytes[0]).toBe(0x50);
  expect(xlsxBytes[1]).toBe(0x4b);

  const pdfRes = await request.get(pdfHref!);
  expect(pdfRes.status()).toBe(200);
  expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
  expect(pdfRes.headers()["content-disposition"]).toContain(".pdf");
  const pdfBytes = await pdfRes.body();
  expect(pdfBytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
});

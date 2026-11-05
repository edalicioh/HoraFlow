import { expect, test } from "@playwright/test";

test("executa o ciclo completo E2E: fechar -> pagar parcial -> estornar -> reabrir -> refechar", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const suffix = Date.now().toString().slice(-6);
  const clientName = `Cliente Fin ${suffix}`;
  const projectName = `Projeto Fin ${suffix}`;

  // 1. Cria cliente
  await page.goto("/clients");
  await page.getByLabel("Nome do cliente").fill(clientName);
  await page.getByLabel("Tarifa padrão do cliente (R$/h)").fill("100,00");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(
    page.getByText(`Cliente "${clientName}" criado com sucesso.`),
  ).toBeVisible();

  // 2. Cria projeto
  await page.goto("/projects");
  await page
    .getByLabel("Cliente vinculado")
    .selectOption({ label: `${clientName} (R$ 100,00/h)` });
  await page.getByLabel("Nome do projeto").fill(projectName);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(
    page.getByText(`Projeto "${projectName}" criado com sucesso.`),
  ).toBeVisible();

  // 3. Registra apontamento de 05:00 em 2026-10-12 (R$ 500,00)
  await page.goto("/timesheet?year=2026&month=10&date=2026-10-12");
  await page
    .getByLabel("Cliente do apontamento")
    .selectOption({ label: clientName });
  await page
    .getByLabel("Projeto do apontamento")
    .selectOption({ label: `${projectName} (R$ 100,00/h · Cliente)` });
  await page.getByLabel("Duração (HH:mm)").fill("05:00");
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Entrega faturável de outubro");
  await page.getByRole("button", { name: "Registrar horas" }).click();
  await expect(
    page.getByText("Apontamento de 05:00 registrado em 2026-10-12."),
  ).toBeVisible();

  // 4. Vai para /billing, gera prévia e confirma fechamento (Revisão #1)
  await page.goto("/billing");
  await page
    .getByLabel("Cliente para fechamento")
    .selectOption({ label: clientName });
  await page.getByLabel("Mês da competência").selectOption("10");
  await page.getByLabel("Ano da competência").fill("2026");
  await page
    .getByRole("button", { name: "Gerar prévia de fechamento" })
    .click();

  const previewPanel = page.getByTestId("closing-preview-panel");
  await expect(previewPanel).toBeVisible();
  await expect(page.getByTestId("preview-total-duration")).toHaveText("05:00");
  await expect(page.getByTestId("preview-total-amount")).toContainText(
    "500,00",
  );

  await previewPanel
    .getByRole("button", { name: "Confirmar fechamento mensal" })
    .click();

  await expect(page.getByTestId("detail-total-cents")).toContainText("500,00");
  await expect(page.getByTestId("detail-balance-cents")).toContainText(
    "500,00",
  );

  // 5. Registra pagamento parcial de R$ 200,00
  const paymentForm = page.getByTestId("create-payment-form");
  await paymentForm.getByLabel("Valor do pagamento (R$)").fill("200,00");
  await paymentForm.getByLabel("Data do pagamento").fill("2026-10-20");
  await paymentForm.getByLabel("Forma de pagamento").selectOption("PIX");
  await paymentForm
    .getByLabel("Observação do pagamento")
    .fill("1ª parcela PIX");
  await paymentForm
    .getByRole("button", { name: "Registrar pagamento" })
    .click();

  await expect(page.getByTestId("detail-paid-cents")).toContainText("200,00");
  await expect(page.getByTestId("detail-balance-cents")).toContainText(
    "300,00",
  );
  await expect(
    page.getByText("Reabertura bloqueada por pagamentos ativos"),
  ).toBeVisible();

  // 6. Estorna o pagamento parcial
  await page.getByRole("button", { name: "Estornar pagamento" }).click();
  await page
    .getByLabel("Motivo do estorno")
    .fill("Estorno E2E para permitir reabertura");
  await page.getByRole("button", { name: "Confirmar estorno" }).click();

  await expect(page.getByTestId("detail-paid-cents")).toContainText("0,00");
  await expect(page.getByTestId("detail-balance-cents")).toContainText(
    "500,00",
  );
  await expect(page.getByText("Estornado").first()).toBeVisible();

  // 7. Reabre a competência com motivo obrigatório
  await page.getByRole("button", { name: "Reabrir competência" }).click();
  const reopenForm = page.getByTestId("reopen-period-form");
  await reopenForm
    .getByLabel("Motivo da reabertura")
    .fill("Reabertura E2E para revisão da competência");
  await reopenForm
    .getByRole("button", { name: "Confirmar reabertura" })
    .click();

  await expect(page.getByText("Competência reaberta").first()).toBeVisible();
  await expect(page.getByTestId("detail-balance-cents")).toContainText("0,00");

  // 8. Gera nova prévia e refecha na Revisão #2
  await page
    .getByLabel("Cliente para fechamento")
    .selectOption({ label: clientName });
  await page.getByLabel("Mês da competência").selectOption("10");
  await page.getByLabel("Ano da competência").fill("2026");
  await page
    .getByRole("button", { name: "Gerar prévia de fechamento" })
    .click();

  await expect(
    page.getByText("Refechamento (Revisão #2)", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirmar refechamento (Revisão #2)" })
    .click();

  await expect(page.getByText("Revisão #2").first()).toBeVisible();
  const auditList = page.getByTestId("billing-audit-log-list");
  await expect(auditList).toContainText("RECLOSE");
  await expect(auditList).toContainText("REOPEN");
  await expect(auditList).toContainText("VOID");
});

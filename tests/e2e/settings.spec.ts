import { expect, test } from "@playwright/test";

test("salva configurações no servidor e preserva após recarregar", async ({
  page,
}) => {
  await page.goto("/settings");

  const timezone = page.getByLabel("Fuso horário");
  const rate = page.getByLabel("Tarifa global (R$)");

  await timezone.fill("America/Sao_Paulo");
  await rate.fill("150,00");
  await page.getByRole("button", { name: "Salvar configurações" }).click();

  await expect(
    page.getByText(/Configurações salvas/),
  ).toBeVisible();
  await expect(page.getByText("R$ 150,00/h")).toBeVisible();

  await page.reload();
  await expect(timezone).toHaveValue("America/Sao_Paulo");
  await expect(rate).toHaveValue("150,00");
  await expect(page.getByText("R$ 150,00/h")).toBeVisible();
});

test("rejeita valor monetário inválido no servidor", async ({ page }) => {
  await page.goto("/settings");

  await page.getByLabel("Tarifa global (R$)").fill("12.34");
  await page.getByRole("button", { name: "Salvar configurações" }).click();

  await expect(
    page.getByText("Informe um valor em reais válido, como 150,00."),
  ).toBeVisible();
});

test("mantém a configuração após recriar o contêiner Docker", async ({
  page,
}) => {
  test.skip(
    process.env.EXPECTED_SETTINGS_RATE === undefined,
    "Execução específica de persistência Docker.",
  );

  await page.goto("/settings");

  await expect(page.getByLabel("Tarifa global (R$)")).toHaveValue(
    process.env.EXPECTED_SETTINGS_RATE ?? "",
  );
  await expect(page.getByText("BRL", { exact: true }).first()).toBeVisible();
});

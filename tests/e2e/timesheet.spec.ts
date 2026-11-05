import { expect, test } from "@playwright/test";

test("registra horas por duração (inclusive >24h) e por intervalo, valida conflito e atualiza calendário", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-6);
  const clientA = `Cliente Horas A ${suffix}`;
  const clientB = `Cliente Horas B ${suffix}`;
  const projectA = `Projeto Horas A ${suffix}`;
  const projectB = `Projeto Horas B ${suffix}`;

  // 1. Prepara dois clientes e dois projetos
  await page.goto("/clients");
  await page.getByLabel("Nome do cliente").fill(clientA);
  await page.getByLabel("Tarifa padrão do cliente (R$/h)").fill("75,00");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(
    page.getByText(`Cliente "${clientA}" criado com sucesso.`),
  ).toBeVisible();

  await page.getByLabel("Nome do cliente").fill(clientB);
  await page.getByLabel("Tarifa padrão do cliente (R$/h)").fill("100,00");
  await page.getByRole("button", { name: "Criar cliente" }).click();
  await expect(
    page.getByText(`Cliente "${clientB}" criado com sucesso.`),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Projetos" })
    .click();
  await expect(page).toHaveURL(/\/projects$/);

  await page
    .getByLabel("Cliente vinculado")
    .selectOption({ label: `${clientA} (R$ 75,00/h)` });
  await page.getByLabel("Nome do projeto").fill(projectA);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(
    page.getByText(`Projeto "${projectA}" criado com sucesso.`),
  ).toBeVisible();

  await page
    .getByLabel("Cliente vinculado")
    .selectOption({ label: `${clientB} (R$ 100,00/h)` });
  await page.getByLabel("Nome do projeto").fill(projectB);
  await page.getByRole("button", { name: "Criar projeto" }).click();
  await expect(
    page.getByText(`Projeto "${projectB}" criado com sucesso.`),
  ).toBeVisible();

  // 2. Abre o calendário de março de 2026 no dia 2026-03-10
  await page.goto("/timesheet?year=2026&month=3&date=2026-03-10");
  await expect(
    page.getByRole("heading", { name: "Horas e Calendário", level: 1 }),
  ).toBeVisible();

  // Verifica que todos os 31 dias de março/2026 estão no calendário e sábados/domingos estão destacados
  await expect(page.getByTestId("calendar-day-2026-03-01")).toHaveAttribute(
    "data-weekend",
    "true",
  );
  await expect(page.getByTestId("calendar-day-2026-03-31")).toBeVisible();

  // 3. Verifica que trocar de cliente limpa o projeto incompatível
  const clientSelect = page.getByLabel("Cliente do apontamento");
  const projectSelect = page.getByLabel("Projeto do apontamento");

  await clientSelect.selectOption({ label: clientA });
  await projectSelect.selectOption({
    label: `${projectA} (R$ 75,00/h · Cliente)`,
  });
  await expect(projectSelect).not.toHaveValue("");

  await clientSelect.selectOption({ label: clientB });
  await expect(projectSelect).toHaveValue("");

  // Volta para Cliente A / Projeto A e registra 24:30 por Duração manual (>24h)
  await clientSelect.selectOption({ label: clientA });
  await projectSelect.selectOption({
    label: `${projectA} (R$ 75,00/h · Cliente)`,
  });
  await page.getByLabel("Duração (HH:mm)").fill("24:30");
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Implantação intensiva acima de 24h");
  await page.getByRole("button", { name: "Registrar horas" }).click();

  await expect(
    page.getByText("Apontamento de 24:30 registrado em 2026-03-10."),
  ).toBeVisible();
  await expect(
    page.getByTestId("calendar-monthly-total-hours"),
  ).toHaveText("24:30");

  // 4. Registra por Início e término (08:00–13:30 = 05:30) no mesmo dia
  await page.getByRole("button", { name: "Início e término" }).click();
  await clientSelect.selectOption({ label: clientA });
  await projectSelect.selectOption({
    label: `${projectA} (R$ 75,00/h · Cliente)`,
  });
  await page.getByLabel("Hora de início (HH:mm)").fill("08:00");
  await page.getByLabel("Hora de término (HH:mm)").fill("13:30");
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Janela matutina e início da tarde");
  await page.getByRole("button", { name: "Registrar horas" }).click();

  await expect(
    page.getByText("Apontamento de 05:30 registrado em 2026-03-10."),
  ).toBeVisible();

  // Total mensal passa a 30:00 (24:30 + 05:30) e continua 1 dia trabalhado
  await expect(
    page.getByTestId("calendar-monthly-total-hours"),
  ).toHaveText("30:00");
  await expect(
    page.getByTestId("calendar-monthly-worked-days"),
  ).toHaveText("1 dia");

  // 5. Tenta registrar intervalo sobreposto (09:00–10:00 em 2026-03-10) -> exibe alerta de conflito
  await clientSelect.selectOption({ label: clientB });
  await projectSelect.selectOption({
    label: `${projectB} (R$ 100,00/h · Cliente)`,
  });
  await page.getByLabel("Hora de início (HH:mm)").fill("09:00");
  await page.getByLabel("Hora de término (HH:mm)").fill("10:00");
  await page.getByRole("button", { name: "Registrar horas" }).click();

  await expect(
    page.getByText(/Conflito de horário: o período informado se sobrepõe/),
  ).toBeVisible();

  // 6. Exclui logicamente o apontamento de 05:30 com confirmação e verifica recálculo do total para 24:30
  const selectedDayEntries = page.getByTestId("selected-day-entries");
  const intervalEntryCard = selectedDayEntries
    .locator('[data-testid^="time-entry-card-"]')
    .filter({ hasText: "Janela matutina e início da tarde" });

  await intervalEntryCard.getByRole("button", { name: "Excluir" }).click();
  await intervalEntryCard
    .getByRole("button", { name: "Confirmar exclusão" })
    .click();

  await expect(
    page.getByTestId("calendar-monthly-total-hours"),
  ).toHaveText("24:30");
});

import { expect, test } from "@playwright/test";

test("cria cliente e projeto, resolve tarifas, filtra e navega por teclado e mobile", async ({
  page,
}) => {
  const suffix = Date.now().toString().slice(-6);
  const clientName = `Acme E2E ${suffix}`;
  const projectName = `Plataforma Web ${suffix}`;

  // 1. Garante tarifa global conhecida para validar fallback
  await page.goto("/settings");
  await page.getByLabel("Tarifa global (R$)").fill("80,00");
  await page.getByRole("button", { name: "Salvar configurações" }).click();
  await expect(page.getByText(/Configurações salvas/)).toBeVisible();

  // 2. Cria cliente via navegação por teclado nos campos do formulário
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Clientes" })
    .click();
  await expect(page).toHaveURL(/\/clients$/);
  const nameInput = page.getByLabel("Nome do cliente");
  await expect(nameInput).toBeVisible();
  await nameInput.focus();
  await page.keyboard.type(clientName);
  await page.keyboard.press("Tab");
  await page.keyboard.type("100,00");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Contrato principal E2E");
  await page.getByRole("button", { name: "Criar cliente" }).click();

  await expect(
    page.getByText(`Cliente "${clientName}" criado com sucesso.`),
  ).toBeVisible();

  const clientCard = page
    .locator('[data-testid^="client-card-"]')
    .filter({ hasText: clientName });
  await expect(clientCard).toBeVisible();
  await expect(clientCard).toContainText("Origem da tarifa: Cliente");
  await expect(clientCard).toContainText("R$ 100,00/h");

  // 3. Testa abertura da edição por teclado e fechamento com Escape
  const editClientButton = clientCard.getByRole("button", { name: "Editar" });
  await editClientButton.focus();
  await page.keyboard.press("Enter");
  const editRateInput = clientCard.getByLabel(
    "Tarifa padrão do cliente (R$/h)",
  );
  await expect(editRateInput).toBeVisible();
  await editRateInput.focus();
  await page.keyboard.press("Escape");
  await expect(editRateInput).toBeHidden();

  // 4. Navega até a página de projetos no viewport mobile usando o menu mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Abrir menu de navegação").click();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Projetos" })
    .click();
  await expect(page).toHaveURL(/\/projects$/);

  // 5. Cria projeto sem tarifa própria (deve herdar tarifa do cliente: R$ 100,00/h)
  await page
    .getByLabel("Cliente vinculado")
    .selectOption({ label: `${clientName} (R$ 100,00/h)` });
  await page.getByLabel("Nome do projeto").fill(projectName);
  await page
    .getByLabel("Descrição (opcional)")
    .fill("Escopo de desenvolvimento inicial");
  await page.getByRole("button", { name: "Criar projeto" }).click();

  await expect(
    page.getByText(`Projeto "${projectName}" criado com sucesso.`),
  ).toBeVisible();

  const projectCard = page
    .locator('[data-testid^="project-card-"]')
    .filter({ hasText: projectName });
  await expect(projectCard).toBeVisible();
  await expect(projectCard).toContainText("Origem da tarifa: Cliente");
  await expect(projectCard).toContainText("R$ 100,00/h (Cliente)");
  await expect(projectCard).toContainText("Elegível para apontamentos");

  // 6. Edita tarifa própria do projeto para R$ 120,00/h e verifica mudança de origem para Projeto
  await page.setViewportSize({ width: 1280, height: 800 });
  await projectCard.getByRole("button", { name: "Editar" }).click();
  await projectCard
    .getByLabel("Tarifa própria do projeto (R$/h)")
    .fill("120,00");
  await projectCard.getByRole("button", { name: "Salvar alterações" }).click();

  await expect(
    page.getByText(`Projeto "${projectName}" atualizado com sucesso.`),
  ).toBeVisible();
  await expect(projectCard).toContainText("Origem da tarifa: Projeto");
  await expect(projectCard).toContainText("R$ 120,00/h (Projeto)");

  // 7. Filtra projetos por busca e status
  await page
    .getByLabel("Buscar por projeto, cliente ou descrição")
    .fill(suffix);
  await page.getByLabel("Status do projeto").selectOption("active");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(projectCard).toBeVisible();

  await page.getByLabel("Status do projeto").selectOption("inactive");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(projectCard).toBeHidden();

  await page.getByRole("link", { name: "Limpar" }).click();
  await expect(projectCard).toBeVisible();
});

test("bloqueia exclusão com vínculo, desativa/reativa cadastros e exibe detalhe do cliente", async ({
  page,
}) => {
  const suffix = `${Date.now().toString().slice(-5)}b`;
  const clientName = `Beta E2E ${suffix}`;
  const projectName = `App Mobile ${suffix}`;

  await page.goto("/clients");
  await page.getByLabel("Nome do cliente").fill(clientName);
  await page.getByLabel("Tarifa padrão do cliente (R$/h)").fill("95,00");
  await page.getByRole("button", { name: "Criar cliente" }).click();

  const clientCard = page
    .locator('[data-testid^="client-card-"]')
    .filter({ hasText: clientName });
  await expect(clientCard).toBeVisible();

  // Abre detalhe do cliente e cria projeto vinculado diretamente nele
  await clientCard.getByRole("link", { name: "Ver detalhes" }).click();
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]+$/);
  await expect(
    page.getByRole("heading", { name: clientName, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Histórico de horas e fechamentos",
      level: 2,
    }),
  ).toBeVisible();

  await page.getByLabel("Nome do projeto").fill(projectName);
  await page.getByRole("button", { name: "Criar projeto" }).click();

  const detailProjectCard = page
    .locator('[data-testid^="project-card-"]')
    .filter({ hasText: projectName });
  await expect(detailProjectCard).toBeVisible();
  await expect(detailProjectCard).toContainText("Elegível para apontamentos");

  // Tenta excluir cliente que possui projeto vinculado -> bloqueado com orientação de desativar
  await page.getByRole("button", { name: "Excluir cliente" }).click();
  await expect(
    page.getByText(
      /Não é possível excluir um cliente que possui projetos ou histórico vinculado/,
    ),
  ).toBeVisible();

  // Desativa cliente: projeto continua Ativo mas fica inelegível por cliente inativo
  await page.getByRole("button", { name: "Desativar cliente" }).click();
  await expect(detailProjectCard).toContainText("Ativo");
  await expect(detailProjectCard).toContainText("Inelegível: cliente inativo");

  // Reativa cliente: projeto volta a ficar elegível
  await page.getByRole("button", { name: "Reativar cliente" }).click();
  await expect(detailProjectCard).toContainText("Elegível para apontamentos");

  // Desativa e reativa o projeto
  await detailProjectCard
    .getByRole("button", { name: "Desativar projeto" })
    .click();
  await expect(detailProjectCard).toContainText("Inelegível: projeto inativo");

  await detailProjectCard
    .getByRole("button", { name: "Reativar projeto" })
    .click();
  await expect(detailProjectCard).toContainText("Elegível para apontamentos");
});

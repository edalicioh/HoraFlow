import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

test("servidor de desenvolvimento escuta somente em loopback", async () => {
  const listening = execFileSync("ss", ["-ltnp", "sport = :3100"], {
    encoding: "utf8",
  });

  expect(listening).toContain("127.0.0.1:3100");
  expect(listening).not.toMatch(/(?:0\.0\.0\.0|\*|\[::\]):3100/);
});

test("abre o dashboard sem login e navega pelas áreas", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Ainda não há horas registradas")).toBeVisible();

  const desktopNav = page.getByRole("navigation", {
    name: "Navegação principal",
  });

  await desktopNav.getByRole("link", { name: "Configurações" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "Configurações", level: 1 }),
  ).toBeVisible();
});

test("healthcheck responde sem detalhes sensíveis", async ({ request }) => {
  const response = await request.get("/api/health");

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({ status: "ok" });
});

test("menu mobile navega e fecha", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");

  const menuButton = page.getByLabel("Abrir menu de navegação");
  await menuButton.focus();
  await page.keyboard.press("Enter");
  const mobileNav = page.getByRole("navigation", {
    name: "Navegação principal",
  });

  await expect(mobileNav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(mobileNav).toBeHidden();
  await expect(menuButton).toBeFocused();

  await menuButton.click();
  await expect(mobileNav).toBeVisible();
  await mobileNav.getByRole("link", { name: "Faturamento" }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await expect(
    page.getByRole("heading", { name: "Faturamento", level: 1 }),
  ).toBeVisible();
});

test("alterna o tema claro e escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Ativar tema escuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("button", { name: "Ativar tema claro" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

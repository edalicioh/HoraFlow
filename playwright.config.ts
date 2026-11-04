import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const e2eDatabaseUrl =
  process.env.E2E_DATABASE_URL ?? "file:/tmp/opencode/horaflow-f0-e2e.db";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://127.0.0.1:3100/api/health",
        timeout: 180_000,
        reuseExistingServer: false,
        env: {
          DATABASE_URL: e2eDatabaseUrl,
          HORAFLOW_LOCAL_PORT: "3100",
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

import { spawnSync } from "node:child_process";

const [mode, action] = process.argv.slice(2);
const modes = new Set(["development", "production"]);
const actions = new Set(["dev", "start", "migrate", "migrate-dev"]);

if (!modes.has(mode) || !actions.has(action)) {
  console.error(
    "Uso: node scripts/run-local.mjs <development|production> <dev|start|migrate|migrate-dev>",
  );
  process.exit(2);
}

process.env.NODE_ENV = mode;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

try {
  run(process.execPath, ["scripts/prepare-local-db.mjs"]);

  const migrationCommand = action === "migrate-dev" ? "dev" : "deploy";
  run("pnpm", ["exec", "prisma", "migrate", migrationCommand]);

  if (action === "dev" || action === "start") {
    const port = process.env.HORAFLOW_LOCAL_PORT ?? "3000";
    const nextCommand = action === "dev" ? "dev" : "start";
    run("pnpm", [
      "exec",
      "next",
      nextCommand,
      "-H",
      "127.0.0.1",
      "-p",
      port,
    ]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

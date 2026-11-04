import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDatabaseFile } from "./database-url.mjs";

// Este script é deliberadamente isolado do .env: o E2E nunca deve apontar para
// o banco local do usuário. DATABASE_URL exportada ainda tem precedência.
const url = process.env.DATABASE_URL ?? "file:/tmp/opencode/horaflow-f0-e2e.db";

let absolutePath;
try {
  absolutePath = resolveDatabaseFile(url);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });

for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${absolutePath}${suffix}`, { force: true });
}

execFileSync(process.execPath, ["scripts/prepare-local-db.mjs"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: `file:${absolutePath}` },
  stdio: "inherit",
});

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: `file:${absolutePath}` },
  stdio: "inherit",
});

console.log(`Banco E2E preparado em ${absolutePath}`);

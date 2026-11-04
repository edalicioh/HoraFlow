import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = process.env.DATABASE_URL ?? "file:/tmp/opencode/horaflow-f0-e2e.db";

if (!url.startsWith("file:")) {
  console.error("DATABASE_URL deve usar o esquema file: para SQLite.");
  process.exit(1);
}

let filePath = url.slice("file:".length);
if (filePath.startsWith("///")) {
  filePath = filePath.slice(2);
} else if (filePath.startsWith("//")) {
  filePath = filePath.slice(1);
}

const absolutePath = path.resolve(filePath);
fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });

for (const suffix of ["", "-wal", "-shm"]) {
  fs.rmSync(`${absolutePath}${suffix}`, { force: true });
}

execFileSync(process.execPath, ["scripts/prepare-local-db.mjs"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

console.log(`Banco E2E preparado em ${absolutePath}`);

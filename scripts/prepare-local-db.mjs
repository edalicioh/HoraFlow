import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { loadProjectEnv } from "./load-env.mjs";
import { resolveDatabaseFile } from "./database-url.mjs";

loadProjectEnv();

const configuredUrl = process.env.DATABASE_URL ?? "file:./data/horaflow.db";

let absolutePath;
try {
  absolutePath = resolveDatabaseFile(configuredUrl);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const directory = path.dirname(absolutePath);

fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

const database = new Database(absolutePath);
const journalMode = database.pragma("journal_mode = WAL", { simple: true });
database.pragma("busy_timeout = 5000");
database.pragma("foreign_keys = ON");
const foreignKeys = database.pragma("foreign_keys", { simple: true });
const busyTimeout = database.pragma("busy_timeout", { simple: true });
database.close();

try {
  fs.chmodSync(absolutePath, 0o600);
} catch {
  // Em volumes gerenciados, a permissão pode ser controlada pelo host.
}

console.log(
  `SQLite preparado em ${absolutePath} (journal_mode=${journalMode}, foreign_keys=${foreignKeys}, busy_timeout=${busyTimeout})`,
);

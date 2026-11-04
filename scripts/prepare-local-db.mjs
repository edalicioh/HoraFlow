import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const url = process.env.DATABASE_URL ?? "file:./data/horaflow.db";

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
const directory = path.dirname(absolutePath);

fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

const database = new Database(absolutePath);
database.pragma("journal_mode = WAL");
database.pragma("busy_timeout = 5000");
database.pragma("foreign_keys = ON");
database.close();

try {
  fs.chmodSync(absolutePath, 0o600);
} catch {
  // Em volumes gerenciados, a permissão pode ser controlada pelo host.
}

console.log(`SQLite preparado em ${absolutePath}`);

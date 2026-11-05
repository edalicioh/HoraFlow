#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDatabaseUrl } from "./database-url.mjs";
import { loadEnvironment } from "./load-env.mjs";

loadEnvironment("production");

const resolved = resolveDatabaseUrl();
const dbPath = resolved.filePath;

if (!fs.existsSync(dbPath)) {
  console.error(`[backup] Erro: Banco de dados não encontrado em "${dbPath}".`);
  process.exit(1);
}

const backupDir = process.env.HORAFLOW_BACKUP_DIR || path.resolve(process.cwd(), "backups");
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupFileName = `horaflow-backup-${timestamp}.db`;
const backupFilePath = path.join(backupDir, backupFileName);

console.log(`[backup] Iniciando backup online de "${dbPath}" para "${backupFilePath}"...`);

try {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });

  // 1. Verifica integridade antes do snapshot
  const integrity = db.pragma("integrity_check");
  const isOk = Array.isArray(integrity) && integrity[0]?.integrity_check === "ok";
  if (!isOk) {
    console.warn(`[backup] Atenção no integrity_check de origem:`, integrity);
  }

  // 2. Executa snapshot online consistente via backup API do SQLite
  await db.backup(backupFilePath);
  db.close();

  // 3. Ajusta permissões do arquivo gerado (apenas dono pode ler/escrever)
  fs.chmodSync(backupFilePath, 0o600);

  // 4. Valida integridade do snapshot recém-criado
  const backupDb = new Database(backupFilePath, { readonly: true, fileMustExist: true });
  const backupIntegrity = backupDb.pragma("integrity_check");
  backupDb.close();

  const backupOk =
    Array.isArray(backupIntegrity) && backupIntegrity[0]?.integrity_check === "ok";
  if (!backupOk) {
    throw new Error(`Falha de integridade no snapshot gerado: ${JSON.stringify(backupIntegrity)}`);
  }

  const stats = fs.statSync(backupFilePath);
  console.log(`[backup] Backup concluído com sucesso!`);
  console.log(`  Arquivo: ${backupFilePath}`);
  console.log(`  Tamanho: ${(stats.size / 1024).toFixed(2)} KB`);
  console.log(`  Integridade: OK`);
} catch (error) {
  console.error(`[backup] Falha crítica ao gerar backup:`, error);
  if (fs.existsSync(backupFilePath)) {
    try {
      fs.unlinkSync(backupFilePath);
    } catch {}
  }
  process.exit(1);
}

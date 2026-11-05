#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDatabaseUrl } from "./database-url.mjs";
import { loadEnvironment } from "./load-env.mjs";

loadEnvironment("production");

const args = process.argv.slice(2);
const backupSource = args[0];

if (!backupSource) {
  console.error("Uso: node scripts/restore.mjs <caminho-para-o-arquivo-de-backup.db>");
  process.exit(1);
}

const resolvedBackupPath = path.resolve(process.cwd(), backupSource);
if (!fs.existsSync(resolvedBackupPath)) {
  console.error(`[restore] Erro: Arquivo de backup não encontrado em "${resolvedBackupPath}".`);
  process.exit(1);
}

const resolved = resolveDatabaseUrl();
const targetDbPath = resolved.filePath;
const targetDbDir = path.dirname(targetDbPath);

console.log(`[restore] Validando snapshot de backup "${resolvedBackupPath}"...`);

try {
  // 1. Testa integridade do backup antes de tocar no banco ativo
  const backupDb = new Database(resolvedBackupPath, { readonly: true, fileMustExist: true });
  const integrity = backupDb.pragma("integrity_check");
  backupDb.close();

  const isOk = Array.isArray(integrity) && integrity[0]?.integrity_check === "ok";
  if (!isOk) {
    console.error(`[restore] Erro: O arquivo de backup está corrompido ou inválido:`, integrity);
    process.exit(1);
  }

  // 2. Preserva estado atual como salvaguarda
  if (fs.existsSync(targetDbPath)) {
    const backupSafeguard = `${targetDbPath}.pre-restore-${Date.now()}`;
    console.log(`[restore] Salvaguardando banco ativo atual em "${backupSafeguard}"...`);
    fs.copyFileSync(targetDbPath, backupSafeguard);
  }

  // 3. Remove arquivos WAL e SHM órfãos para evitar misturar estados
  const walPath = `${targetDbPath}-wal`;
  const shmPath = `${targetDbPath}-shm`;
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

  // 4. Copia o snapshot restaurado para o arquivo de destino
  if (!fs.existsSync(targetDbDir)) {
    fs.mkdirSync(targetDbDir, { recursive: true, mode: 0o700 });
  }
  fs.copyFileSync(resolvedBackupPath, targetDbPath);
  fs.chmodSync(targetDbPath, 0o600);

  // 5. Validação final pós-restauração
  const restoredDb = new Database(targetDbPath, { readonly: true, fileMustExist: true });
  const postIntegrity = restoredDb.pragma("integrity_check");
  restoredDb.close();

  const postOk = Array.isArray(postIntegrity) && postIntegrity[0]?.integrity_check === "ok";
  if (!postOk) {
    throw new Error(`Integridade pós-restauração inválida: ${JSON.stringify(postIntegrity)}`);
  }

  console.log(`[restore] Restauração concluída com sucesso em "${targetDbPath}"!`);
  console.log(`  Integridade verificada: OK`);
  console.log(`  Arquivos WAL/SHM sincronizados: OK`);
} catch (error) {
  console.error(`[restore] Falha durante a restauração:`, error);
  process.exit(1);
}

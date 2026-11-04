import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

/**
 * Carrega os mesmos arquivos de ambiente que o Next.js usa, sem sobrescrever
 * variáveis já exportadas no processo. A ordem segue a documentação do Next:
 * .env.<NODE_ENV>.local, .env.local (exceto em testes), .env.<NODE_ENV> e .env.
 */
export function loadProjectEnv({
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV,
} = {}) {
  const files = [];

  if (nodeEnv) {
    files.push(`.env.${nodeEnv}.local`);
  }
  if (nodeEnv !== "test") {
    files.push(".env.local");
  }
  if (nodeEnv) {
    files.push(`.env.${nodeEnv}`);
  }
  files.push(".env");

  const loaded = [];

  for (const file of files) {
    const filePath = path.join(cwd, file);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const result = config({ path: filePath, override: false, quiet: true });
    if (result.error) {
      throw result.error;
    }
    loaded.push(file);
  }

  return loaded;
}

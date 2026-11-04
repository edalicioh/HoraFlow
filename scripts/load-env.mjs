import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

const NODE_ENV_VALUES = new Set(["development", "production", "test"]);

/**
 * Use Next.js's own dotenv selection, precedence, and $VARIABLE expansion.
 * Commands that have a distinct mode set NODE_ENV before calling this helper;
 * direct non-Next commands follow Next's default of production.
 */
export function loadProjectEnv({
  cwd = process.cwd(),
  nodeEnv = process.env.NODE_ENV ?? "production",
} = {}) {
  if (!NODE_ENV_VALUES.has(nodeEnv)) {
    throw new Error(`NODE_ENV inválido: ${nodeEnv}`);
  }

  process.env.NODE_ENV = nodeEnv;
  const { loadedEnvFiles } = loadEnvConfig(cwd, nodeEnv === "development");
  return loadedEnvFiles.map(({ path }) => path);
}

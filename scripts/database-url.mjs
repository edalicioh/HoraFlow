import path from "node:path";

function parseFileUrl(value, cwd) {
  if (typeof value !== "string" || !value.startsWith("file:")) {
    throw new Error("DATABASE_URL deve usar o esquema file: para SQLite.");
  }

  let rawPath = value.slice("file:".length);

  if (rawPath.startsWith("//")) {
    const withoutSlashes = rawPath.slice(2);
    const slashIndex = withoutSlashes.indexOf("/");

    if (slashIndex === -1) {
      throw new Error("DATABASE_URL file: deve apontar para um arquivo.");
    }

    const host = withoutSlashes.slice(0, slashIndex);
    if (host !== "" && host !== "localhost") {
      throw new Error("DATABASE_URL file: não aceita host remoto.");
    }

    rawPath = withoutSlashes.slice(slashIndex);
  }

  if (rawPath.includes("?") || rawPath.includes("#")) {
    throw new Error("DATABASE_URL file: não aceita query string ou fragmento.");
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error("DATABASE_URL file: contém escape de URL inválido.");
  }

  if (!decodedPath || decodedPath === ":memory:") {
    throw new Error("DATABASE_URL file: deve apontar para um arquivo em disco.");
  }

  return path.isAbsolute(decodedPath)
    ? path.normalize(decodedPath)
    : path.resolve(cwd, decodedPath);
}

export function resolveDatabaseFile(
  value,
  { cwd = process.cwd() } = {},
) {
  return parseFileUrl(value, cwd);
}

export function resolveDatabaseUrl(value, options) {
  return `file:${resolveDatabaseFile(value, options)}`;
}

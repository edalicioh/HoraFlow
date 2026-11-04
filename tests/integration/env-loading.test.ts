import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const testRoot = "/tmp/opencode";
let temporaryProject: string;

beforeAll(() => {
  mkdirSync(testRoot, { recursive: true, mode: 0o700 });
  temporaryProject = mkdtempSync(
    path.join(testRoot, "horaflow-f0-env-source-"),
  );
});

afterAll(() => {
  rmSync(temporaryProject, { recursive: true, force: true });
});

function environmentWithoutDatabaseUrl(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.DATABASE_URL;
  return environment;
}

describe("resolução de DATABASE_URL", () => {
  it("usa .env como única fonte, prepara só o banco esperado e o Prisma o encontra", () => {
    const relativeDatabasePath = "private/nested/horaflow-env.db";
    const expectedDatabasePath = path.join(
      temporaryProject,
      relativeDatabasePath,
    );
    const projectDatabasePath = path.join(projectRoot, "data", "horaflow.db");
    const projectDatabaseBefore = existsSync(projectDatabasePath)
      ? statSync(projectDatabasePath)
      : null;

    writeFileSync(
      path.join(temporaryProject, ".env"),
      `DATABASE_URL="file:./${relativeDatabasePath}"\n`,
    );

    const prepareOutput = execFileSync(
      process.execPath,
      [path.join(projectRoot, "scripts/prepare-local-db.mjs")],
      {
        cwd: temporaryProject,
        env: environmentWithoutDatabaseUrl(),
        encoding: "utf8",
      },
    );

    expect(prepareOutput).toContain(expectedDatabasePath);
    expect(prepareOutput).toContain("journal_mode=wal");
    expect(prepareOutput).toContain("foreign_keys=1");
    expect(prepareOutput).toContain("busy_timeout=5000");
    expect(existsSync(expectedDatabasePath)).toBe(true);
    expect(existsSync(path.join(temporaryProject, "data", "horaflow.db"))).toBe(
      false,
    );

    const fileMode = statSync(expectedDatabasePath).mode & 0o777;
    expect(fileMode).toBe(0o600);
    expect(statSync(path.dirname(expectedDatabasePath)).mode & 0o777).toBe(0o700);

    const database = new Database(expectedDatabasePath, { readonly: true });
    try {
      const journal = database.pragma("journal_mode", { simple: true });
      expect(journal).toBe("wal");
    } finally {
      database.close();
    }

    execFileSync(
      path.join(projectRoot, "node_modules", ".bin", "prisma"),
      [
        "migrate",
        "deploy",
        "--config",
        path.join(projectRoot, "prisma.config.ts"),
        "--schema",
        path.join(projectRoot, "prisma", "schema.prisma"),
      ],
      {
        cwd: temporaryProject,
        env: environmentWithoutDatabaseUrl(),
        stdio: "pipe",
      },
    );

    const migrated = new Database(expectedDatabasePath, { readonly: true });
    try {
      const settingsTable = migrated
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Settings'",
        )
        .get();
      expect(settingsTable).toEqual({ name: "Settings" });
    } finally {
      migrated.close();
    }

    const databaseFiles = readdirSync(temporaryProject, {
      recursive: true,
    }).filter((entry) => String(entry).endsWith(".db"));
    expect(databaseFiles).toEqual([relativeDatabasePath]);

    if (projectDatabaseBefore) {
      const projectDatabaseAfter = statSync(projectDatabasePath);
      expect(projectDatabaseAfter.mtimeMs).toBe(projectDatabaseBefore.mtimeMs);
      expect(projectDatabaseAfter.size).toBe(projectDatabaseBefore.size);
    } else {
      expect(existsSync(projectDatabasePath)).toBe(false);
    }
  });
});

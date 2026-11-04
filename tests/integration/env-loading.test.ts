import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
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
  const environment = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  delete environment.DATABASE_URL;
  delete environment.NODE_ENV;
  return environment as NodeJS.ProcessEnv;
}

function createRuntimeFixture(name: string, production: boolean): string {
  const fixture = mkdtempSync(path.join(testRoot, `horaflow-f0-${name}-`));
  for (const directory of ["scripts", "prisma"]) {
    cpSync(path.join(projectRoot, directory), path.join(fixture, directory), {
      recursive: true,
    });
  }
  for (const file of ["package.json", "prisma.config.ts", "next.config.ts", "postcss.config.mjs"]) {
    cpSync(path.join(projectRoot, file), path.join(fixture, file));
  }
  symlinkSync(path.join(projectRoot, "node_modules"), path.join(fixture, "node_modules"), "dir");
  symlinkSync(path.join(projectRoot, "src"), path.join(fixture, "src"), "dir");
  symlinkSync(path.join(projectRoot, "public"), path.join(fixture, "public"), "dir");
  if (production) {
    cpSync(path.join(projectRoot, ".next"), path.join(fixture, ".next"), {
      recursive: true,
    });
  }
  return fixture;
}

async function waitForServer(child: ChildProcess, port: number): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor HoraFlow terminou prematuramente (code ${child.exitCode}).`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/settings`);
      if (response.status === 200) return;
    } catch {
      // O servidor pode ainda estar migrando ou compilando o bundle de dev.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Servidor HoraFlow não respondeu na porta ${port}.`);
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  if (process.platform !== "win32" && child.pid) {
    process.kill(-child.pid, "SIGTERM");
  } else {
    child.kill("SIGTERM");
  }
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, "SIGKILL");
      } else {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
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

  it("usa .env.development no runner equivalente ao pipeline do script pnpm dev", () => {
    const fixture = createRuntimeFixture("runtime-development", false);
    const expectedPath = path.join(fixture, "private", "development", "horaflow.db");
    writeFileSync(
      path.join(fixture, ".env"),
      "DB_DIRECTORY=./private/base\nDATABASE_URL=file:$DB_DIRECTORY/base.db\n",
    );
    writeFileSync(
      path.join(fixture, ".env.development"),
      "DB_DIRECTORY=./private/development\nDATABASE_URL=file:$DB_DIRECTORY/horaflow.db\n",
    );

    try {
      execFileSync(
        "pnpm",
        ["exec", "node", "scripts/run-local.mjs", "development", "migrate"],
        { cwd: fixture, env: environmentWithoutDatabaseUrl(), stdio: "pipe" },
      );
      expect(existsSync(expectedPath)).toBe(true);
      expect(existsSync(path.join(fixture, "private", "base", "base.db"))).toBe(false);
      const database = new Database(expectedPath, { readonly: true });
      try {
        expect(
          database.prepare("SELECT count(*) AS count FROM _prisma_migrations").get(),
        ).toEqual({ count: 2 });
      } finally {
        database.close();
      }
      expect(
        readdirSync(path.join(fixture, "private"), { recursive: true }).filter(
          (entry) => String(entry).endsWith(".db"),
        ),
      ).toEqual(["development/horaflow.db"]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it(
    "usa .env.production na preparação, migration e runtime do script pnpm start",
    async () => {
      const mode = "production";
      const command = "start";
      const port = 3314;
      const fixture = createRuntimeFixture(`runtime-${mode}`, mode === "production");
      const privateDir = path.join(fixture, "private", mode);
      const expectedPath = path.join(privateDir, "horaflow.db");
      const envFile = ".env.production";

      writeFileSync(
        path.join(fixture, ".env"),
        "DB_DIRECTORY=./private/base\nDATABASE_URL=file:$DB_DIRECTORY/base.db\n",
      );
      writeFileSync(
        path.join(fixture, envFile),
        `DB_DIRECTORY=./private/${mode}\nDATABASE_URL=file:$DB_DIRECTORY/horaflow.db\n`,
      );

      const environment = environmentWithoutDatabaseUrl();
      environment.HORAFLOW_LOCAL_PORT = String(port);
      environment.NEXT_TELEMETRY_DISABLED = "1";
      environment.HORAFLOW_TRUSTED_HOSTS = "";
      const server = spawn("pnpm", [command], {
        cwd: fixture,
        env: environment,
        detached: process.platform !== "win32",
        stdio: "ignore",
      });

      try {
        await waitForServer(server, port);
        expect(existsSync(expectedPath)).toBe(true);
        expect(existsSync(path.join(fixture, "private", "base", "base.db"))).toBe(false);

        const database = new Database(expectedPath, { readonly: true });
        try {
          expect(
            database
              .prepare("SELECT count(*) AS count FROM _prisma_migrations")
              .get(),
          ).toEqual({ count: 2 });
          expect(
            database
              .prepare('SELECT id FROM "Settings"')
              .get(),
          ).toEqual({ id: "singleton" });
        } finally {
          database.close();
        }

        const databaseFiles = readdirSync(path.join(fixture, "private"), {
          recursive: true,
        }).filter((entry) => String(entry).endsWith(".db"));
        expect(databaseFiles).toEqual([`${mode}/horaflow.db`]);
      } finally {
        await stopServer(server);
        rmSync(fixture, { recursive: true, force: true });
      }
    },
    150_000,
  );

  it("preserva DATABASE_URL exportada sobre arquivos dotenv no runner real", () => {
    const fixture = createRuntimeFixture("runtime-exported", false);
    const expectedPath = path.join(fixture, "private", "exported.db");
    writeFileSync(
      path.join(fixture, ".env"),
      "DATABASE_URL=file:./private/from-env.db\n",
    );

    try {
      execFileSync("pnpm", ["exec", "node", "scripts/run-local.mjs", "production", "migrate"], {
        cwd: fixture,
        env: {
          ...environmentWithoutDatabaseUrl(),
          DATABASE_URL: "file:./private/exported.db",
        },
        stdio: "pipe",
      });
      expect(existsSync(expectedPath)).toBe(true);
      expect(existsSync(path.join(fixture, "private", "from-env.db"))).toBe(false);
      expect(
        readdirSync(path.join(fixture, "private")).filter((file) => file.endsWith(".db")),
      ).toEqual(["exported.db"]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  }, 120_000);
});

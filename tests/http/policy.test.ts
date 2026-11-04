import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../helpers/database";
import { createClient } from "../helpers/database";
import type { PrismaClient } from "@/generated/prisma/client";

const projectRoot = process.cwd();
const port = 3101;
const host = `127.0.0.1:${port}`;
const baseUrl = `http://${host}`;

let database: TestDatabase;
let prisma: PrismaClient;
let server: ChildProcess;
let actionId: string;
let serverLogs = "";

type HttpResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

function request({
  method = "GET",
  requestPath = "/",
  requestHost = host,
  headers = {},
  body,
}: {
  method?: string;
  requestPath?: string;
  requestHost?: string;
  headers?: Record<string, string>;
  body?: Buffer | string;
}): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: requestPath,
        headers: {
          Host: requestHost,
          Connection: "close",
          ...headers,
          ...(body === undefined
            ? {}
            : { "Content-Length": Buffer.byteLength(body) }),
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: responseBody,
          });
        });
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

function settingsActionPayload({
  timezone,
  rate,
}: {
  timezone: string;
  rate: string;
}) {
  const boundary = `----HoraFlowHttpPolicy${Date.now()}`;
  const fields: Array<[string, string]> = [
    ["_1_$ACTION_REF_1", ""],
    [
      "_1_$ACTION_1:0",
      JSON.stringify({ id: actionId, bound: "$@1" }),
    ],
    ["_1_$ACTION_1:1", JSON.stringify([{ status: "idle" }])],
    ["_1_$ACTION_KEY", "khttpPolicy"],
    ["_1_timezone", timezone],
    ["_1_defaultHourlyRate", rate],
    ["0", JSON.stringify([{ status: "idle" }, "$K1"])],
  ];

  const body = `${fields
    .map(
      ([name, value]) =>
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
    .join("")}--${boundary}--\r\n`;

  return {
    body,
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function actionRequest({
  requestHost,
  origin,
  forwardedHost,
  forwarded,
  timezone = "Europe/Lisbon",
  rate = "999,00",
}: {
  requestHost?: string;
  origin?: string | null;
  forwardedHost?: string;
  forwarded?: string;
  timezone?: string;
  rate?: string;
}) {
  const { body, contentType } = settingsActionPayload({ timezone, rate });
  const headers: Record<string, string> = {
    Accept: "text/x-component",
    "Content-Type": contentType,
    "Next-Action": actionId,
  };

  if (origin !== null) {
    headers.Origin = origin ?? baseUrl;
  }
  if (forwardedHost !== undefined) {
    headers["X-Forwarded-Host"] = forwardedHost;
  }
  if (forwarded !== undefined) {
    headers.Forwarded = forwarded;
  }

  return request({
    method: "POST",
    requestPath: "/settings",
    requestHost,
    headers,
    body,
  });
}

async function readPersistedSettings() {
  const settings = await prisma.settings.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  const auditCount = await prisma.auditLog.count({
    where: { entity: "Settings", entityId: "singleton" },
  });

  return {
    timezone: settings.timezone,
    rate: settings.defaultHourlyRateCents,
    auditCount,
  };
}

beforeAll(async () => {
  const buildOutput = execFileSync("pnpm", ["build"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 300_000,
  });

  if (!buildOutput.includes("Compiled successfully")) {
    throw new Error("Build de produção não concluiu com sucesso.");
  }

  const manifest = JSON.parse(
    readFileSync(
      path.join(projectRoot, ".next", "server", "server-reference-manifest.json"),
      "utf8",
    ),
  ) as {
    node?: Record<string, { exportedName?: string }>;
  };

  const actionEntry = Object.entries(manifest.node ?? {}).find(
    ([, value]) => value.exportedName === "updateSettingsAction",
  );

  if (!actionEntry) {
    throw new Error("Server Action de configurações não encontrada no build.");
  }
  actionId = actionEntry[0];

  database = createTestDatabase("http-policy");
  prisma = createClient(database.url);

  server = spawn(
    "pnpm",
    ["start"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        DATABASE_URL: database.url,
        HORAFLOW_LOCAL_PORT: String(port),
        HORAFLOW_TRUSTED_HOSTS: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  server.stdout?.on("data", (chunk) => {
    serverLogs += String(chunk);
  });
  server.stderr?.on("data", (chunk) => {
    serverLogs += String(chunk);
  });

  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Servidor encerrou antes de responder:\n${serverLogs}`);
    }

    try {
      const response = await request({ requestPath: "/api/health" });
      if (response.status === 200) {
        const settingsPage = await request({ requestPath: "/settings" });
        if (settingsPage.status !== 200) {
          throw new Error("Settings não foi inicializada pelo servidor de produção.");
        }
        await prisma.settings.update({
          where: { id: "singleton" },
          data: { timezone: "America/Sao_Paulo", defaultHourlyRateCents: 12_345 },
        });
        return;
      }
    } catch {
      // Servidor ainda inicializando.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Servidor não respondeu em ${baseUrl}:\n${serverLogs}`);
}, 300_000);

afterAll(async () => {
  if (server && server.exitCode === null) {
    if (process.platform !== "win32" && server.pid) {
      process.kill(-server.pid, "SIGTERM");
    } else {
      server.kill("SIGTERM");
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (process.platform !== "win32" && server.pid) {
          process.kill(-server.pid, "SIGKILL");
        } else {
          server.kill("SIGKILL");
        }
        resolve();
      }, 5_000);
      server.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  await prisma?.$disconnect();
  await database?.cleanup();
});

describe("política HTTP de hosts e origens", () => {
  it("escuta apenas em loopback e aceita acesso local legítimo", async () => {
    const listening = execFileSync("ss", ["-ltnp", `sport = :${port}`], {
      encoding: "utf8",
    });

    expect(listening).toContain(host);
    expect(listening).not.toMatch(/(?:0\.0\.0\.0|\*|\[::\]):3101/);

    const health = await request({ requestPath: "/api/health" });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({ status: "ok" });

    const settings = await request({ requestPath: "/settings" });
    expect(settings.status).toBe(200);
    expect(settings.body).toContain("Configurações");

    const matchingForwarded = await request({
      requestPath: "/api/health",
      headers: { "X-Forwarded-Host": host },
    });
    expect(matchingForwarded.status).toBe(200);
  });

  it("rejeita host desconhecido, forwarded e origens inválidas sem alterar Settings ou auditoria", async () => {
    const before = await readPersistedSettings();

    const unknownHostRead = await request({
      requestPath: "/settings",
      requestHost: "evil.example:3101",
    });
    expect(unknownHostRead.status).toBe(403);

    const unknownHostHealth = await request({
      requestPath: "/api/health",
      requestHost: "evil.example:3101",
    });
    expect(unknownHostHealth.status).toBe(403);

    const unknownHostWithSameOrigin = await actionRequest({
      requestHost: "evil.example:3101",
      origin: "http://evil.example:3101",
    });
    expect(unknownHostWithSameOrigin.status).toBe(403);

    const unknownHostWithTrustedForwarded = await actionRequest({
      requestHost: "evil.example:3101",
      origin: "http://evil.example:3101",
      forwardedHost: host,
    });
    expect(unknownHostWithTrustedForwarded.status).toBe(403);

    const divergentOrigin = await actionRequest({
      origin: "http://evil.example:3101",
    });
    expect(divergentOrigin.status).toBe(403);

    const missingOrigin = await actionRequest({ origin: null });
    expect(missingOrigin.status).toBe(403);

    const nullOrigin = await actionRequest({ origin: "null" });
    expect(nullOrigin.status).toBe(403);

    const malformedOrigin = await actionRequest({
      origin: "not a url",
    });
    expect(malformedOrigin.status).toBe(403);

    const forwardedHostMismatch = await request({
      requestPath: "/api/health",
      headers: { "X-Forwarded-Host": "evil.example:3101" },
    });
    expect(forwardedHostMismatch.status).toBe(403);

    const forwardedHeaderMismatch = await actionRequest({
      forwarded: "for=203.0.113.10;host=evil.example:3101",
    });
    expect(forwardedHeaderMismatch.status).toBe(403);

    expect(await readPersistedSettings()).toEqual(before);
  });

  it("aceita mutação local legítima com Origin confiável", async () => {
    const before = await readPersistedSettings();

    const response = await actionRequest({
      origin: "http://127.0.0.1:3101",
      timezone: "Europe/Lisbon",
      rate: "999,00",
    });

    expect(response.status).toBe(200);

    const after = await readPersistedSettings();
    expect(after.timezone).toBe("Europe/Lisbon");
    expect(after.rate).toBe(99_900);
    expect(after.auditCount).toBe(before.auditCount + 1);
  });
});

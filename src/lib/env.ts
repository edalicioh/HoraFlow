import "server-only";
import { z } from "zod";
import { resolveDatabaseUrl } from "../../scripts/database-url.mjs";

const environmentSchema = z.object({
  DATABASE_URL: z
    .string()
    .trim()
    .min(1, "DATABASE_URL é obrigatória.")
    .refine(
      (value) => value.startsWith("file:"),
      "DATABASE_URL deve usar o esquema file: para SQLite.",
    ),
});

export function getDatabaseUrl(): string {
  const configured = environmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? "file:./data/horaflow.db",
  }).DATABASE_URL;

  return resolveDatabaseUrl(configured);
}

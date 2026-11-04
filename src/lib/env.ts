import "server-only";
import { z } from "zod";

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
  return environmentSchema.parse({
    DATABASE_URL: process.env.DATABASE_URL ?? "file:./data/horaflow.db",
  }).DATABASE_URL;
}

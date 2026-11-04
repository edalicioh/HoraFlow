-- Reforça no schema que Settings é um singleton. Prisma não modela CHECK,
-- então a tabela é reconstruída para adicionar a restrição sem perder dados.
CREATE TABLE "Settings_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "defaultHourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_id_singleton" CHECK ("id" = 'singleton'),
    CONSTRAINT "Settings_currency_brl" CHECK ("currency" = 'BRL'),
    CONSTRAINT "Settings_defaultHourlyRateCents_nonnegative" CHECK ("defaultHourlyRateCents" >= 0)
);

INSERT INTO "Settings_new" (
    "id",
    "timezone",
    "currency",
    "defaultHourlyRateCents",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "timezone",
    "currency",
    "defaultHourlyRateCents",
    "createdAt",
    "updatedAt"
FROM "Settings";

DROP TABLE "Settings";

ALTER TABLE "Settings_new" RENAME TO "Settings";

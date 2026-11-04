-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hourlyRateCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_name_not_blank" CHECK (length(trim("name")) > 0),
    CONSTRAINT "Client_hourlyRateCents_nonnegative" CHECK ("hourlyRateCents" IS NULL OR "hourlyRateCents" >= 0)
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "hourlyRateCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_name_not_blank" CHECK (length(trim("name")) > 0),
    CONSTRAINT "Project_hourlyRateCents_nonnegative" CHECK ("hourlyRateCents" IS NULL OR "hourlyRateCents" >= 0)
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "startAt" DATETIME,
    "endAt" DATETIME,
    "durationMinutes" INTEGER NOT NULL,
    "description" TEXT,
    "hourlyRateCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deletedAt" DATETIME,
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_mode_valid" CHECK ("mode" IN ('DURATION', 'INTERVAL')),
    CONSTRAINT "TimeEntry_status_valid" CHECK ("status" IN ('DRAFT', 'BILLED', 'APPROVED')),
    CONSTRAINT "TimeEntry_workDate_format" CHECK (length("workDate") = 10 AND "workDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT "TimeEntry_duration_positive" CHECK ("durationMinutes" > 0),
    CONSTRAINT "TimeEntry_hourlyRateCents_nonnegative" CHECK ("hourlyRateCents" >= 0),
    CONSTRAINT "TimeEntry_amountCents_nonnegative" CHECK ("amountCents" >= 0),
    CONSTRAINT "TimeEntry_mode_fields" CHECK (
        ("mode" = 'DURATION' AND "startAt" IS NULL AND "endAt" IS NULL)
        OR ("mode" = 'INTERVAL' AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL)
    ),
    CONSTRAINT "TimeEntry_interval_order" CHECK ("startAt" IS NULL OR "endAt" > "startAt")
);

-- CreateTable
CREATE TABLE "BillingPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "clientNameSnapshot" TEXT,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "closedAt" DATETIME,
    "reopenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BillingPeriod_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillingPeriod_status_valid" CHECK ("status" IN ('OPEN', 'CLOSED', 'REOPENED')),
    CONSTRAINT "BillingPeriod_month_valid" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "BillingPeriod_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "BillingPeriod_totals_nonnegative" CHECK ("totalMinutes" >= 0 AND "totalCents" >= 0)
);

-- CreateTable
CREATE TABLE "BillingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billingPeriodId" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "releasedAt" DATETIME,
    "clientName" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "description" TEXT,
    "workDate" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingItem_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "BillingPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillingItem_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillingItem_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "BillingItem_duration_positive" CHECK ("durationMinutes" > 0),
    CONSTRAINT "BillingItem_money_nonnegative" CHECK ("hourlyRateCents" >= 0 AND "amountCents" >= 0),
    CONSTRAINT "BillingItem_workDate_format" CHECK (length("workDate") = 10 AND "workDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "billingPeriodId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL,
    "method" TEXT,
    "note" TEXT,
    "voidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "BillingPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "Payment_amount_positive" CHECK ("amountCents" > 0)
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "defaultHourlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_currency_brl" CHECK ("currency" = 'BRL'),
    CONSTRAINT "Settings_defaultHourlyRateCents_nonnegative" CHECK ("defaultHourlyRateCents" >= 0)
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "origin" TEXT NOT NULL DEFAULT 'local',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT,
    "fileHash" TEXT,
    "mapping" JSONB,
    "errors" JSONB,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "importedRows" INTEGER NOT NULL DEFAULT 0,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatch_status_valid" CHECK ("status" IN ('PENDING', 'PREVIEWED', 'IMPORTED', 'FAILED')),
    CONSTRAINT "ImportBatch_counts_nonnegative" CHECK (
        "totalRows" >= 0 AND "validRows" >= 0 AND "invalidRows" >= 0 AND "importedRows" >= 0
    ),
    CONSTRAINT "ImportBatch_totals_nonnegative" CHECK ("totalMinutes" >= 0 AND "totalCents" >= 0)
);

-- CreateIndex
CREATE INDEX "Client_active_idx" ON "Client"("active");

-- CreateIndex
CREATE INDEX "Client_name_idx" ON "Client"("name");

-- CreateIndex
CREATE INDEX "Project_clientId_active_idx" ON "Project"("clientId", "active");

-- CreateIndex
CREATE INDEX "Project_name_idx" ON "Project"("name");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_workDate_idx" ON "TimeEntry"("projectId", "workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_workDate_idx" ON "TimeEntry"("workDate");

-- CreateIndex
CREATE INDEX "TimeEntry_status_idx" ON "TimeEntry"("status");

-- CreateIndex
CREATE INDEX "TimeEntry_deletedAt_idx" ON "TimeEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "TimeEntry_importBatchId_idx" ON "TimeEntry"("importBatchId");

-- CreateIndex
CREATE INDEX "BillingPeriod_status_idx" ON "BillingPeriod"("status");

-- CreateIndex
CREATE INDEX "BillingPeriod_year_month_idx" ON "BillingPeriod"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "BillingPeriod_clientId_year_month_key" ON "BillingPeriod"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "BillingItem_billingPeriodId_releasedAt_idx" ON "BillingItem"("billingPeriodId", "releasedAt");

-- CreateIndex
CREATE INDEX "BillingItem_timeEntryId_idx" ON "BillingItem"("timeEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingItem_billingPeriodId_timeEntryId_revision_key" ON "BillingItem"("billingPeriodId", "timeEntryId", "revision");

-- CreateIndex
CREATE INDEX "Payment_billingPeriodId_revision_idx" ON "Payment"("billingPeriodId", "revision");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_voidedAt_idx" ON "Payment"("voidedAt");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_status_idx" ON "ImportBatch"("status");

-- CreateIndex
CREATE INDEX "ImportBatch_fileHash_idx" ON "ImportBatch"("fileHash");

-- Unicidade parcial aprovada em 2026-11-04: apenas um item ativo por apontamento.
-- Itens liberados por reabertura permanecem preservados com releasedAt preenchido.
CREATE UNIQUE INDEX "BillingItem_timeEntryId_active_key"
ON "BillingItem"("timeEntryId")
WHERE "releasedAt" IS NULL;


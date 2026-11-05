export type AuditEntity =
  | "Settings"
  | "Client"
  | "Project"
  | "TimeEntry"
  | "BillingPeriod"
  | "Payment"
  | "ImportBatch";

export type AuditRecordInput = {
  entity: AuditEntity;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  origin?: string;
};

export type AuditLogSummary = {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  origin: string;
  createdAt: string;
};

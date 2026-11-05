import { describe, expect, it } from "vitest";
import { sanitizeAuditPayload } from "@/modules/audit/service";
import {
  computeBillingOverviewTotals,
  computePreviewSignature,
  derivePaymentStatus,
} from "@/modules/billing/service";
import type { BillingPeriodSummary } from "@/modules/billing/types";
import { resolvePaymentAmountCents } from "@/modules/payment/schema";
import { resolvePaymentUtcInstant } from "@/modules/payment/service";

describe("Regras unitárias de faturamento, pagamentos e auditoria (Fase 3)", () => {
  it("deriva o status de pagamento sem permitir que competências reabertas contem como dívida", () => {
    expect(derivePaymentStatus("OPEN", 50_000, 0)).toBe("NOT_APPLICABLE");
    expect(derivePaymentStatus("REOPENED", 50_000, 0)).toBe("NOT_APPLICABLE");
    expect(derivePaymentStatus("REOPENED", 50_000, 25_000)).toBe(
      "NOT_APPLICABLE",
    );

    expect(derivePaymentStatus("CLOSED", 50_000, 0)).toBe("UNPAID");
    expect(derivePaymentStatus("CLOSED", 50_000, 20_000)).toBe("PARTIAL");
    expect(derivePaymentStatus("CLOSED", 50_000, 50_000)).toBe("PAID");
    expect(derivePaymentStatus("CLOSED", 0, 0)).toBe("PAID");
  });

  it("gera assinatura determinística de prévia sensível a mudanças em qualquer item", () => {
    const entryBase = {
      id: "22222222-2222-4222-8222-222222222222",
      workDate: "2026-10-05",
      durationMinutes: 330,
      hourlyRateCents: 7500,
      amountCents: 41250,
      projectName: "Portal",
      description: "Entrega",
    };

    const base = {
      clientId: "11111111-1111-4111-8111-111111111111",
      year: 2026,
      month: 10,
      nextRevision: 1,
      entries: [entryBase],
    };

    const sig1 = computePreviewSignature(base);
    const sig2 = computePreviewSignature(base);
    expect(sig1).toBe(sig2);

    const sigChangedAmount = computePreviewSignature({
      ...base,
      entries: [{ ...entryBase, amountCents: 41251 }],
    });
    expect(sigChangedAmount).not.toBe(sig1);

    const sigChangedRevision = computePreviewSignature({
      ...base,
      nextRevision: 2,
    });
    expect(sigChangedRevision).not.toBe(sig1);
  });

  it("consolida totais gerais ignorando competências reabertas como dívida fechada atual", () => {
    const sampleBase: BillingPeriodSummary = {
      id: "p1",
      clientId: "c1",
      clientName: "Acme",
      clientNameSnapshot: "Acme",
      displayClientName: "Acme",
      year: 2026,
      month: 10,
      competenceLabel: "10/2026",
      revision: 1,
      status: "CLOSED",
      totalMinutes: 600,
      totalCents: 100_000,
      paidCents: 40_000,
      balanceCents: 60_000,
      paymentStatus: "PARTIAL",
      activeItemCount: 2,
      releasedItemCount: 0,
      activePaymentCount: 1,
      voidedPaymentCount: 0,
      canReopen: false,
      reopenBlockedReason: "Bloqueado",
      closedAt: "2026-10-31T18:00:00.000Z",
      reopenedAt: null,
      createdAt: "2026-10-31T18:00:00.000Z",
      updatedAt: "2026-10-31T18:00:00.000Z",
    };

    const reopened: BillingPeriodSummary = {
      ...sampleBase,
      id: "p2",
      month: 9,
      competenceLabel: "09/2026",
      status: "REOPENED",
      paidCents: 0,
      balanceCents: 0,
      paymentStatus: "NOT_APPLICABLE",
    };

    const totals = computeBillingOverviewTotals([sampleBase, reopened]);
    expect(totals).toEqual({
      closedCount: 1,
      reopenedCount: 1,
      totalClosedMinutes: 600,
      totalClosedCents: 100_000,
      totalPaidCents: 40_000,
      totalOpenBalanceCents: 60_000,
    });
  });

  it("valida valores de pagamento positivos e rejeita zero ou negativos", () => {
    expect(resolvePaymentAmountCents({ amountBRL: "150,75" })).toBe(15_075);
    expect(resolvePaymentAmountCents({ amountCents: 500 })).toBe(500);

    expect(() => resolvePaymentAmountCents({ amountBRL: "0,00" })).toThrow();
    expect(() => resolvePaymentAmountCents({ amountCents: 0 })).toThrow();
    expect(() => resolvePaymentAmountCents({ amountCents: -100 })).toThrow();
  });

  it("converte data civil de pagamento preservando o dia civil estável em UTC", () => {
    const instantSp = resolvePaymentUtcInstant(
      "2026-10-31",
      "America/Sao_Paulo",
    );
    expect(instantSp.toISOString()).toBe("2026-10-31T15:00:00.000Z");
    expect(instantSp.toISOString().slice(0, 10)).toBe("2026-10-31");

    const instantAuckland = resolvePaymentUtcInstant(
      "2026-10-31",
      "Pacific/Auckland",
    );
    expect(instantAuckland.toISOString().slice(0, 10)).toBe("2026-10-31");
  });

  it("remove chaves sensíveis ou stack traces ao sanitizar payloads de auditoria", () => {
    const sanitized = sanitizeAuditPayload({
      id: "123",
      amountCents: 5000,
      password: "secret",
      token: "jwt",
      stack: "Error at ...",
      createdAt: new Date("2026-10-31T12:00:00.000Z"),
    }) as Record<string, unknown>;

    expect(sanitized).toEqual({
      id: "123",
      amountCents: 5000,
      createdAt: "2026-10-31T12:00:00.000Z",
    });
  });
});

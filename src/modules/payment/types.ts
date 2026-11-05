import type { Payment } from "@/generated/prisma/client";
import type { PaymentSummary } from "@/modules/billing/types";

export type { PaymentSummary };

export type CreatePaymentInput = {
  billingPeriodId: string;
  amountCents?: number;
  amountBRL?: string;
  paidDate?: string;
  paidAt?: Date;
  method: string;
  note?: string | null;
  operationId?: string | null;
  origin?: string;
};

export type VoidPaymentInput = {
  paymentId: string;
  reason: string;
  origin?: string;
};

export type PaymentRecord = Payment;

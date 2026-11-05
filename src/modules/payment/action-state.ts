import type { BillingActionState } from "@/modules/billing/action-state";

export type PaymentActionState = BillingActionState;

export const initialPaymentActionState: PaymentActionState = {
  status: "idle",
};

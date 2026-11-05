import type { FieldErrors } from "@/lib/errors";

export type BillingActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  recordId?: string;
};

export const initialBillingActionState: BillingActionState = {
  status: "idle",
};

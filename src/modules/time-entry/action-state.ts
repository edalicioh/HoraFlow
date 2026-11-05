import type { FieldErrors } from "@/lib/errors";

export type TimeEntryActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
};

export const initialTimeEntryActionState: TimeEntryActionState = {
  status: "idle",
};

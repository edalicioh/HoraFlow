import type { FieldErrors } from "@/lib/errors";

export type ClientActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
};

export const initialClientActionState: ClientActionState = {
  status: "idle",
};

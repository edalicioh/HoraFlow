import type { FieldErrors } from "@/lib/errors";

export type ProjectActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
};

export const initialProjectActionState: ProjectActionState = {
  status: "idle",
};

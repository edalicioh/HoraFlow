export type ImportActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  batchId?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialImportActionState: ImportActionState = {
  status: "idle",
};

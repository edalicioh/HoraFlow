export type SettingsActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialSettingsActionState: SettingsActionState = {
  status: "idle",
};

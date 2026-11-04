import { describe, expect, it } from "vitest";
import {
  isValidTimeZone,
  settingsFormSchema,
  settingsUpdateSchema,
} from "@/modules/settings/schema";

describe("settingsUpdateSchema", () => {
  it("aceita fuso IANA e tarifa inteira não negativa", () => {
    const parsed = settingsUpdateSchema.parse({
      timezone: "America/Sao_Paulo",
      defaultHourlyRateCents: 15_000,
    });

    expect(parsed).toEqual({
      timezone: "America/Sao_Paulo",
      defaultHourlyRateCents: 15_000,
    });
  });

  it("rejeita fuso inválido", () => {
    expect(isValidTimeZone("America/Sao_Paulo")).toBe(true);
    expect(isValidTimeZone("Fuso/Inventado")).toBe(false);

    const parsed = settingsUpdateSchema.safeParse({
      timezone: "Fuso/Inventado",
      defaultHourlyRateCents: 0,
    });

    expect(parsed.success).toBe(false);
  });

  it("rejeita tarifa negativa ou fracionária", () => {
    expect(
      settingsUpdateSchema.safeParse({
        timezone: "America/Sao_Paulo",
        defaultHourlyRateCents: -1,
      }).success,
    ).toBe(false);

    expect(
      settingsUpdateSchema.safeParse({
        timezone: "America/Sao_Paulo",
        defaultHourlyRateCents: 10.5,
      }).success,
    ).toBe(false);
  });
});

describe("settingsFormSchema", () => {
  it("converte o valor digitado em centavos", () => {
    const parsed = settingsFormSchema.parse({
      timezone: "America/Sao_Paulo",
      defaultHourlyRate: "1.250,75",
    });

    expect(parsed).toEqual({
      timezone: "America/Sao_Paulo",
      defaultHourlyRate: 125_075,
    });
  });

  it("rejeita valor monetário inválido", () => {
    const parsed = settingsFormSchema.safeParse({
      timezone: "America/Sao_Paulo",
      defaultHourlyRate: "12.34",
    });

    expect(parsed.success).toBe(false);
  });
});

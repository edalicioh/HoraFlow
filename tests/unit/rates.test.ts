import { describe, expect, it } from "vitest";
import { MAX_CENTS } from "@/lib/money";
import {
  formatRateSourceLabel,
  resolveHourlyRate,
  resolveHourlyRateWithSource,
} from "@/lib/rates";
import {
  clientFormSchema,
  clientWriteSchema,
  MAX_CLIENT_DESCRIPTION_LENGTH,
  MAX_CLIENT_NAME_LENGTH,
} from "@/modules/client/schema";
import {
  MAX_PROJECT_DESCRIPTION_LENGTH,
  MAX_PROJECT_NAME_LENGTH,
  projectFormSchema,
  projectWriteSchema,
} from "@/modules/project/schema";

const VALID_CLIENT_ID = "550e8400-e29b-41d4-a716-446655440000";

describe("resolveHourlyRate e resolveHourlyRateWithSource", () => {
  it("prioriza a tarifa do projeto quando projeto, cliente e global estão definidos", () => {
    const input = {
      projectRateCents: 12_000,
      clientRateCents: 10_000,
      defaultRateCents: 8_000,
    };

    expect(resolveHourlyRate(input)).toBe(12_000);
    expect(resolveHourlyRateWithSource(input)).toEqual({
      rateCents: 12_000,
      source: "project",
    });
  });

  it("usa a tarifa do cliente quando a tarifa do projeto é null", () => {
    const input = {
      projectRateCents: null,
      clientRateCents: 10_000,
      defaultRateCents: 8_000,
    };

    expect(resolveHourlyRate(input)).toBe(10_000);
    expect(resolveHourlyRateWithSource(input)).toEqual({
      rateCents: 10_000,
      source: "client",
    });
  });

  it("usa a tarifa global quando projeto e cliente são null", () => {
    const input = {
      projectRateCents: null,
      clientRateCents: null,
      defaultRateCents: 8_000,
    };

    expect(resolveHourlyRate(input)).toBe(8_000);
    expect(resolveHourlyRateWithSource(input)).toEqual({
      rateCents: 8_000,
      source: "global",
    });
  });

  it("mantém zero na tarifa do projeto sem acionar fallback para cliente ou global", () => {
    const input = {
      projectRateCents: 0,
      clientRateCents: 10_000,
      defaultRateCents: 8_000,
    };

    expect(resolveHourlyRate(input)).toBe(0);
    expect(resolveHourlyRateWithSource(input)).toEqual({
      rateCents: 0,
      source: "project",
    });
  });

  it("mantém zero na tarifa do cliente sem acionar fallback para global", () => {
    const input = {
      projectRateCents: null,
      clientRateCents: 0,
      defaultRateCents: 8_000,
    };

    expect(resolveHourlyRate(input)).toBe(0);
    expect(resolveHourlyRateWithSource(input)).toEqual({
      rateCents: 0,
      source: "client",
    });
  });

  it.each([
    [{ projectRateCents: -1, clientRateCents: 10_000, defaultRateCents: 8_000 }],
    [{ projectRateCents: 10.5, clientRateCents: 10_000, defaultRateCents: 8_000 }],
    [{ projectRateCents: null, clientRateCents: -50, defaultRateCents: 8_000 }],
    [{ projectRateCents: null, clientRateCents: null, defaultRateCents: -1 }],
    [
      {
        projectRateCents: MAX_CENTS + 1,
        clientRateCents: null,
        defaultRateCents: 8_000,
      },
    ],
  ])("rejeita tarifas inválidas no resolvedor (%o)", (input) => {
    expect(() => resolveHourlyRate(input)).toThrow();
  });

  it("formata os rótulos de origem da tarifa em pt-BR", () => {
    expect(formatRateSourceLabel("project")).toBe("Projeto");
    expect(formatRateSourceLabel("client")).toBe("Cliente");
    expect(formatRateSourceLabel("global")).toBe("Global");
  });
});

describe("schemas de validação de clientes e projetos", () => {
  it("normaliza trim, descrição vazia como null e preserva tarifa zero", () => {
    const parsedClient = clientWriteSchema.parse({
      name: "  Acme Corp  ",
      description: "   ",
      hourlyRateCents: 0,
    });

    expect(parsedClient).toEqual({
      name: "Acme Corp",
      description: null,
      hourlyRateCents: 0,
    });

    const parsedForm = clientFormSchema.parse({
      name: "  Beta Ltda ",
      description: "",
      hourlyRate: "0,00",
    });

    expect(parsedForm).toEqual({
      name: "Beta Ltda",
      description: null,
      hourlyRate: 0,
    });

    const parsedEmptyRate = clientFormSchema.parse({
      name: "Gamma",
      description: "Contrato mensal",
      hourlyRate: "   ",
    });

    expect(parsedEmptyRate).toEqual({
      name: "Gamma",
      description: "Contrato mensal",
      hourlyRate: null,
    });
  });

  it("respeita limites máximos documentados e rejeita excesso", () => {
    expect(
      clientWriteSchema.safeParse({
        name: "A".repeat(MAX_CLIENT_NAME_LENGTH),
        description: "B".repeat(MAX_CLIENT_DESCRIPTION_LENGTH),
        hourlyRateCents: MAX_CENTS,
      }).success,
    ).toBe(true);

    expect(
      clientWriteSchema.safeParse({
        name: "A".repeat(MAX_CLIENT_NAME_LENGTH + 1),
        description: null,
        hourlyRateCents: null,
      }).success,
    ).toBe(false);

    expect(
      clientWriteSchema.safeParse({
        name: "Cliente válido",
        description: "B".repeat(MAX_CLIENT_DESCRIPTION_LENGTH + 1),
        hourlyRateCents: null,
      }).success,
    ).toBe(false);

    expect(
      projectWriteSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        name: "P".repeat(MAX_PROJECT_NAME_LENGTH),
        description: "D".repeat(MAX_PROJECT_DESCRIPTION_LENGTH),
        hourlyRateCents: 12_000,
      }).success,
    ).toBe(true);

    expect(
      projectWriteSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        name: "P".repeat(MAX_PROJECT_NAME_LENGTH + 1),
      }).success,
    ).toBe(false);

    expect(
      projectWriteSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        name: "Projeto",
        description: "D".repeat(MAX_PROJECT_DESCRIPTION_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("rejeita nomes em branco, tarifas negativas/fracionárias e clientId inválido", () => {
    expect(
      clientWriteSchema.safeParse({
        name: "   ",
        hourlyRateCents: 10_000,
      }).success,
    ).toBe(false);

    expect(
      clientWriteSchema.safeParse({
        name: "Cliente",
        hourlyRateCents: -1,
      }).success,
    ).toBe(false);

    expect(
      clientWriteSchema.safeParse({
        name: "Cliente",
        hourlyRateCents: 100.5,
      }).success,
    ).toBe(false);

    expect(
      projectFormSchema.safeParse({
        clientId: "nao-e-uuid",
        name: "Projeto X",
        hourlyRate: "100,00",
      }).success,
    ).toBe(false);

    expect(
      projectFormSchema.safeParse({
        clientId: VALID_CLIENT_ID,
        name: "Projeto X",
        hourlyRate: "12.34",
      }).success,
    ).toBe(false);
  });
});

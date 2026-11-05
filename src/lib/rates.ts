import { ValidationError } from "@/lib/errors";
import { MAX_CENTS } from "@/lib/money";

export type RateSource = "project" | "client" | "global";

export type ResolveHourlyRateInput = {
  projectRateCents?: number | null;
  clientRateCents?: number | null;
  defaultRateCents: number;
};

export type ResolvedHourlyRate = {
  rateCents: number;
  source: RateSource;
};

function assertValidRateCents(
  value: number,
  field: "projectRateCents" | "clientRateCents" | "defaultRateCents",
): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_CENTS) {
    throw new ValidationError(
      "A tarifa deve ser um número inteiro não negativo em centavos.",
      {
        [field]: [
          "Informe uma tarifa inteira não negativa dentro do limite permitido.",
        ],
      },
    );
  }
}

/**
 * Resolve a tarifa horária efetiva e sua origem para um novo apontamento,
 * seguindo a prioridade `projectRateCents ?? clientRateCents ?? defaultRateCents`.
 *
 * Importante:
 * - Zero (`0`) é uma tarifa definida e NÃO aciona fallback para cliente/global.
 * - Apenas `null` ou `undefined` acionam fallback.
 * - Este resolvedor fornece o snapshot inicial para novos apontamentos e
 *   nunca recalcula apontamentos ou demonstrativos históricos.
 */
export function resolveHourlyRateWithSource(
  input: ResolveHourlyRateInput,
): ResolvedHourlyRate {
  const { projectRateCents, clientRateCents, defaultRateCents } = input;

  assertValidRateCents(defaultRateCents, "defaultRateCents");

  if (projectRateCents !== null && projectRateCents !== undefined) {
    assertValidRateCents(projectRateCents, "projectRateCents");
  }

  if (clientRateCents !== null && clientRateCents !== undefined) {
    assertValidRateCents(clientRateCents, "clientRateCents");
  }

  if (projectRateCents !== null && projectRateCents !== undefined) {
    return {
      rateCents: projectRateCents,
      source: "project",
    };
  }

  if (clientRateCents !== null && clientRateCents !== undefined) {
    return {
      rateCents: clientRateCents,
      source: "client",
    };
  }

  return {
    rateCents: defaultRateCents,
    source: "global",
  };
}

/**
 * Resolve apenas o valor em centavos/hora para um novo apontamento,
 * preservando a regra `projectRateCents ?? clientRateCents ?? defaultRateCents`.
 */
export function resolveHourlyRate(input: ResolveHourlyRateInput): number {
  return resolveHourlyRateWithSource(input).rateCents;
}

export function formatRateSourceLabel(source: RateSource): string {
  switch (source) {
    case "project":
      return "Projeto";
    case "client":
      return "Cliente";
    case "global":
      return "Global";
  }
}

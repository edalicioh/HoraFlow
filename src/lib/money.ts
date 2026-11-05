export const MAX_CENTS = 2_147_483_647;

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const decimalFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCentsAsBRL(cents: number): string {
  return brlFormatter.format(cents / 100);
}

export function formatCentsAsInput(cents: number): string {
  return decimalFormatter.format(cents / 100);
}

/**
 * Converte um valor monetário digitado em pt-BR para centavos inteiros.
 * Aceita "1.234,56", "1234,56", "1234" e "0,5". Rejeita negativos,
 * mais de duas casas decimais e separadores ambíguos, como "12.34".
 */
export function parseBRLToCents(input: string): number | null {
  const normalized = input
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/^R\$\s*/i, "")
    .replace(/\s+/g, "");

  if (normalized.length === 0 || normalized.startsWith("-")) {
    return null;
  }

  const match =
    /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(normalized);

  if (!match) {
    return null;
  }

  const [wholePart, decimalPart = ""] = normalized.split(",");
  const wholeDigits = wholePart?.replace(/\./g, "") ?? "";
  const cents = Number(wholeDigits) * 100 + Number(decimalPart.padEnd(2, "0"));

  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) {
    return null;
  }

  return cents;
}

export type OptionalCentsParseResult =
  | { valid: true; cents: number | null }
  | { valid: false };

/**
 * Converte um valor monetário opcional digitado em pt-BR para centavos inteiros.
 * String vazia (ou apenas espaços) resulta em `{ valid: true, cents: null }`.
 * Zero explícito ("0", "0,00", "R$ 0,00") resulta em `{ valid: true, cents: 0 }`.
 */
export function parseOptionalBRLToCents(
  input: string | null | undefined,
): OptionalCentsParseResult {
  if (input === null || input === undefined) {
    return { valid: true, cents: null };
  }

  const trimmed = input.replace(/\u00a0/g, " ").trim();
  if (trimmed.length === 0) {
    return { valid: true, cents: null };
  }

  const parsed = parseBRLToCents(trimmed);
  if (parsed === null) {
    return { valid: false };
  }

  return { valid: true, cents: parsed };
}

import { ValidationError } from "@/lib/errors";

/**
 * Limite técnico amplo (10.000 horas = 600.000 minutos) para proteger aritmética
 * inteira e banco de dados sem impor teto arbitrário de 24h por apontamento.
 */
export const MAX_DURATION_MINUTES = 600_000;

const STRICT_DURATION_REGEX = /^(\d{2,}):([0-5]\d)$/;

/**
 * Converte uma string de duração estrita `HH:mm` (horas com 2 ou mais dígitos,
 * minutos entre 00 e 59, total > 0) para minutos inteiros.
 * Exemplos válidos: "05:30" -> 330, "24:30" -> 1470, "100:00" -> 6000.
 * Rejeita "00:00", negativos, minuto "60", horas com 1 dígito, decimais e vazio.
 */
export function parseDurationToMinutes(input: string): number | null {
  const normalized = input.trim();
  const match = STRICT_DURATION_REGEX.exec(normalized);

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isSafeInteger(hours) || !Number.isSafeInteger(minutes)) {
    return null;
  }

  const totalMinutes = hours * 60 + minutes;

  if (
    !Number.isSafeInteger(totalMinutes) ||
    totalMinutes <= 0 ||
    totalMinutes > MAX_DURATION_MINUTES
  ) {
    return null;
  }

  return totalMinutes;
}

/**
 * Formata minutos inteiros como duração `HH:mm` sem reduzir horas módulo 24.
 * Exemplos: 0 -> "00:00", 330 -> "05:30", 1470 -> "24:30", 6000 -> "100:00".
 */
export function formatMinutesAsDuration(totalMinutes: number): string {
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes < 0) {
    throw new ValidationError(
      "O total de minutos para formatação deve ser um inteiro não negativo.",
    );
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

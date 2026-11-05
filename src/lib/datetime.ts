import { MAX_DURATION_MINUTES } from "@/lib/duration";
import { ValidationError } from "@/lib/errors";
import { isValidTimeZone } from "@/modules/settings/schema";

const CIVIL_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

const MONTH_NAMES_PT_BR = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new ValidationError("Ano inválido.");
  }

  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      throw new ValidationError("Mês inválido.");
  }
}

export function parseCivilDate(value: string): CivilDateParts | null {
  const match = CIVIL_DATE_REGEX.exec(value.trim());
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1900 || year > 9999 || month < 1 || month > 12) {
    return null;
  }

  const maxDay = getDaysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    return null;
  }

  return { year, month, day };
}

export function isValidCivilDate(value: string): boolean {
  return parseCivilDate(value) !== null;
}

export function formatCivilDate(
  year: number,
  month: number,
  day: number,
): string {
  const formatted = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!isValidCivilDate(formatted)) {
    throw new ValidationError("Data civil inválida.");
  }
  return formatted;
}

export function formatCivilDatePtBR(civilDate: string): string {
  const parsed = parseCivilDate(civilDate);
  if (!parsed) {
    return civilDate;
  }
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${String(parsed.year).padStart(4, "0")}`;
}

export function formatYearMonthLabelPtBR(year: number, month: number): string {
  const monthName = MONTH_NAMES_PT_BR[month - 1] ?? "";
  return `${monthName} de ${year}`;
}

export function getAdjacentYearMonth(
  year: number,
  month: number,
  deltaMonths: number,
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

export function getDayOfWeekFromCivilDate(civilDate: string): number {
  const parsed = parseCivilDate(civilDate);
  if (!parsed) {
    throw new ValidationError("Data civil inválida.");
  }
  return new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day),
  ).getUTCDay();
}

export function isWeekendCivilDate(civilDate: string): boolean {
  const dayOfWeek = getDayOfWeekFromCivilDate(civilDate);
  return dayOfWeek === 0 || dayOfWeek === 6;
}

export function addDaysToCivilDate(
  civilDate: string,
  deltaDays: number,
): string {
  const parsed = parseCivilDate(civilDate);
  if (!parsed) {
    throw new ValidationError("Data civil inválida.");
  }

  const utc = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day + deltaDays),
  );
  return formatCivilDate(
    utc.getUTCFullYear(),
    utc.getUTCMonth() + 1,
    utc.getUTCDate(),
  );
}

export function isValidLocalTimeHHMM(value: string): boolean {
  return LOCAL_TIME_REGEX.test(value.trim());
}

type ZonedWallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function extractWallClockInTimeZone(
  utcMs: number,
  timeZone: string,
): ZonedWallClock {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(new Date(utcMs));
  const map: Record<string, number> = {};

  for (const part of parts) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      map[part.type] = Number(part.value);
    }
  }

  return {
    year: map.year ?? 0,
    month: map.month ?? 0,
    day: map.day ?? 0,
    hour: map.hour === 24 ? 0 : (map.hour ?? 0),
    minute: map.minute ?? 0,
    second: map.second ?? 0,
  };
}

function getTimeZoneOffsetMsAt(utcMs: number, timeZone: string): number {
  const wall = extractWallClockInTimeZone(utcMs, timeZone);
  const wallAsUtcMs = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
    0,
  );
  return wallAsUtcMs - Math.floor(utcMs / 1000) * 1000;
}

export function getTodayCivilDateInTimeZone(
  timeZone: string,
  now: Date = new Date(),
): string {
  if (!isValidTimeZone(timeZone)) {
    throw new ValidationError("Fuso horário IANA inválido.");
  }
  const wall = extractWallClockInTimeZone(now.getTime(), timeZone);
  return formatCivilDate(wall.year, wall.month, wall.day);
}

export function formatInstantInTimeZone(
  instant: Date,
  timeZone: string,
): {
  date: string;
  time: string;
  dateTimePtBR: string;
} {
  if (!isValidTimeZone(timeZone)) {
    throw new ValidationError("Fuso horário IANA inválido.");
  }

  const wall = extractWallClockInTimeZone(instant.getTime(), timeZone);
  const date = formatCivilDate(wall.year, wall.month, wall.day);
  const time = `${String(wall.hour).padStart(2, "0")}:${String(wall.minute).padStart(2, "0")}`;

  return {
    date,
    time,
    dateTimePtBR: `${formatCivilDatePtBR(date)} ${time}`,
  };
}

/**
 * Converte uma data civil (`YYYY-MM-DD`) e um horário local em minutos (`HH:mm`)
 * para um instante UTC (`Date`) usando o fuso IANA configurado.
 *
 * Regras de segurança:
 * - Rejeita datas civis impossíveis (ex.: 2026-02-29) e horários com segundos/subminutos.
 * - Detecta horários locais inexistentes (salto de horário de verão/offset) e
 *   horários locais ambíguos (repetição na volta de horário de verão/offset),
 *   lançando `ValidationError` explícito em vez de escolher silenciosamente.
 */
export function localDateTimeToUtc(
  civilDate: string,
  timeHHMM: string,
  timeZone: string,
  fieldPrefix = "start",
): Date {
  const dateParts = parseCivilDate(civilDate);
  if (!dateParts) {
    throw new ValidationError("Informe uma data civil válida (AAAA-MM-DD).", {
      [`${fieldPrefix}Date`]: ["Informe uma data válida no calendário."],
    });
  }

  const timeMatch = LOCAL_TIME_REGEX.exec(timeHHMM.trim());
  if (!timeMatch) {
    throw new ValidationError(
      "Informe um horário válido no formato HH:mm (sem segundos).",
      {
        [`${fieldPrefix}Time`]: [
          "Informe um horário válido entre 00:00 e 23:59.",
        ],
      },
    );
  }

  if (!isValidTimeZone(timeZone)) {
    throw new ValidationError("Fuso horário IANA inválido.", {
      timezone: ["O fuso horário configurado não é válido."],
    });
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  const targetLocalAsUtcMs = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    0,
    0,
  );

  // Amostra offsets em torno do horário alvo (-36h a +36h) para capturar qualquer
  // transição de horário de verão / mudança de offset na vizinhança.
  const sampleDeltaHours = [
    -36, -24, -12, -6, -3, -2, -1, 0, 1, 2, 3, 6, 12, 24, 36,
  ];
  const candidateOffsets = new Set<number>();

  for (const deltaHours of sampleDeltaHours) {
    const sampleUtcMs = targetLocalAsUtcMs + deltaHours * 3_600_000;
    candidateOffsets.add(getTimeZoneOffsetMsAt(sampleUtcMs, timeZone));
  }

  const matchingUtcInstants = new Set<number>();

  for (const offsetMs of candidateOffsets) {
    const candidateUtcMs = targetLocalAsUtcMs - offsetMs;
    const wall = extractWallClockInTimeZone(candidateUtcMs, timeZone);

    if (
      wall.year === dateParts.year &&
      wall.month === dateParts.month &&
      wall.day === dateParts.day &&
      wall.hour === hour &&
      wall.minute === minute &&
      wall.second === 0
    ) {
      matchingUtcInstants.add(candidateUtcMs);
    }
  }

  if (matchingUtcInstants.size === 0) {
    throw new ValidationError(
      `O horário local ${civilDate} ${timeHHMM} não existe no fuso ${timeZone} devido a uma mudança de offset/horário de verão. Ajuste o horário informado.`,
      {
        [`${fieldPrefix}Time`]: [
          `Horário inexistente em ${timeZone} (transição de fuso/horário de verão).`,
        ],
      },
    );
  }

  if (matchingUtcInstants.size > 1) {
    throw new ValidationError(
      `O horário local ${civilDate} ${timeHHMM} é ambíguo no fuso ${timeZone} devido a uma mudança de offset/horário de verão. Use o modo de duração manual ou ajuste o intervalo.`,
      {
        [`${fieldPrefix}Time`]: [
          `Horário ambíguo em ${timeZone} (transição de fuso/horário de verão).`,
        ],
      },
    );
  }

  const [exactUtcMs] = matchingUtcInstants;
  return new Date(exactUtcMs as number);
}

export type ResolvedIntervalWindow = {
  workDate: string;
  startAt: Date;
  endAt: Date;
  durationMinutes: number;
};

/**
 * Resolve e valida um intervalo de início e término locais no fuso configurado.
 *
 * Políticas aplicadas:
 * - Não infere dia seguinte silenciosamente quando término <= início.
 * - Não impõe limite de 24h (suporta intervalos multi-dia até MAX_DURATION_MINUTES).
 * - Atribui toda a duração ao `workDate` da data civil de início (decisão de 2026-11-05).
 */
export function resolveIntervalWindow({
  startDate,
  startTime,
  endDate,
  endTime,
  timeZone,
}: {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  timeZone: string;
}): ResolvedIntervalWindow {
  const startAt = localDateTimeToUtc(startDate, startTime, timeZone, "start");
  const endAt = localDateTimeToUtc(endDate, endTime, timeZone, "end");

  const diffMs = endAt.getTime() - startAt.getTime();

  if (diffMs <= 0) {
    throw new ValidationError(
      "O término deve ser posterior ao início. Para períodos que cruzam a meia-noite, informe a data final correspondente ao dia seguinte.",
      {
        endTime: [
          "O término deve ser posterior ao início (verifique a data e hora de término).",
        ],
      },
    );
  }

  if (diffMs % 60_000 !== 0) {
    throw new ValidationError(
      "O intervalo deve resultar em um número inteiro de minutos.",
      {
        endTime: ["Segundos ou frações de minuto não são permitidos."],
      },
    );
  }

  const durationMinutes = diffMs / 60_000;

  if (durationMinutes > MAX_DURATION_MINUTES) {
    throw new ValidationError(
      "A duração calculada para o intervalo excede o limite máximo permitido.",
      {
        endDate: ["O intervalo informado excede o limite máximo permitido."],
      },
    );
  }

  return {
    workDate: startDate.trim(),
    startAt,
    endAt,
    durationMinutes,
  };
}

/**
 * Compara dois intervalos semiabertos `[aStart, aEnd)` e `[bStart, bEnd)`.
 * Intervalos adjacentes (`aEnd === bStart` ou `bEnd === aStart`) NÃO conflitam.
 */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

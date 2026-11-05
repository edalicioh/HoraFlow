import { describe, expect, it } from "vitest";
import {
  addDaysToCivilDate,
  formatCivilDatePtBR,
  formatInstantInTimeZone,
  getDaysInMonth,
  isValidCivilDate,
  isWeekendCivilDate,
  localDateTimeToUtc,
  resolveIntervalWindow,
} from "@/lib/datetime";

describe("datas civis, fusos e intervalos (datetime)", () => {
  it("valida anos bissextos e rejeita datas civis impossíveis", () => {
    expect(isValidCivilDate("2024-02-29")).toBe(true);
    expect(isValidCivilDate("2026-02-28")).toBe(true);
    expect(isValidCivilDate("2026-02-29")).toBe(false);
    expect(isValidCivilDate("2026-04-31")).toBe(false);
    expect(isValidCivilDate("2026-13-01")).toBe(false);
    expect(isValidCivilDate("2026-00-10")).toBe(false);
    expect(getDaysInMonth(2024, 2)).toBe(29);
    expect(getDaysInMonth(2026, 2)).toBe(28);
  });

  it("identifica fins de semana e soma dias em datas civis estáveis", () => {
    // 2026-10-03 é sábado, 2026-10-04 é domingo, 2026-10-05 é segunda
    expect(isWeekendCivilDate("2026-10-03")).toBe(true);
    expect(isWeekendCivilDate("2026-10-04")).toBe(true);
    expect(isWeekendCivilDate("2026-10-05")).toBe(false);
    expect(addDaysToCivilDate("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToCivilDate("2024-02-28", 1)).toBe("2024-02-29");
    expect(formatCivilDatePtBR("2026-10-15")).toBe("15/10/2026");
  });

  it("calcula 08:00–13:30 como 330 minutos no fuso America/Sao_Paulo", () => {
    const resolved = resolveIntervalWindow({
      startDate: "2026-10-15",
      startTime: "08:00",
      endDate: "2026-10-15",
      endTime: "13:30",
      timeZone: "America/Sao_Paulo",
    });

    expect(resolved.workDate).toBe("2026-10-15");
    expect(resolved.durationMinutes).toBe(330);
    expect(resolved.startAt.toISOString()).toBe("2026-10-15T11:00:00.000Z");
    expect(resolved.endAt.toISOString()).toBe("2026-10-15T16:30:00.000Z");

    expect(
      formatInstantInTimeZone(resolved.startAt, "America/Sao_Paulo"),
    ).toEqual({
      date: "2026-10-15",
      time: "08:00",
      dateTimePtBR: "15/10/2026 08:00",
    });
  });

  it("permite atravessar meia-noite, virada de mês/ano e durações acima de 24h atribuindo ao workDate de início", () => {
    const crossMonth = resolveIntervalWindow({
      startDate: "2026-10-31",
      startTime: "22:00",
      endDate: "2026-11-01",
      endTime: "02:30",
      timeZone: "America/Sao_Paulo",
    });
    expect(crossMonth.workDate).toBe("2026-10-31");
    expect(crossMonth.durationMinutes).toBe(270);

    const crossYearOver24h = resolveIntervalWindow({
      startDate: "2026-12-31",
      startTime: "10:00",
      endDate: "2027-01-01",
      endTime: "14:30",
      timeZone: "America/Sao_Paulo",
    });
    expect(crossYearOver24h.workDate).toBe("2026-12-31");
    expect(crossYearOver24h.durationMinutes).toBe(1_710); // 28h30
  });

  it("rejeita início igual ao término, término anterior (sem inferir dia seguinte) e segundos em horários", () => {
    expect(() =>
      resolveIntervalWindow({
        startDate: "2026-10-15",
        startTime: "08:00",
        endDate: "2026-10-15",
        endTime: "08:00",
        timeZone: "America/Sao_Paulo",
      }),
    ).toThrow();

    expect(() =>
      resolveIntervalWindow({
        startDate: "2026-10-15",
        startTime: "22:00",
        endDate: "2026-10-15",
        endTime: "02:00",
        timeZone: "America/Sao_Paulo",
      }),
    ).toThrow();

    expect(() =>
      localDateTimeToUtc(
        "2026-10-15",
        "08:00:30",
        "America/Sao_Paulo",
      ),
    ).toThrow();
  });

  it("rejeita explicitamente horários locais inexistentes ou ambíguos em transições de horário de verão", () => {
    // Em America/New_York: 2026-03-08 às 02:00 o relógio salta para 03:00 (02:30 não existe)
    expect(() =>
      localDateTimeToUtc("2026-03-08", "02:30", "America/New_York"),
    ).toThrow(/não existe no fuso/);

    // Em America/New_York: 2026-11-01 às 02:00 o relógio volta para 01:00 (01:30 ocorre duas vezes)
    expect(() =>
      localDateTimeToUtc("2026-11-01", "01:30", "America/New_York"),
    ).toThrow(/é ambíguo no fuso/);
  });
});

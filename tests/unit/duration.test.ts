import { describe, expect, it } from "vitest";
import {
  formatMinutesAsDuration,
  MAX_DURATION_MINUTES,
  parseDurationToMinutes,
} from "@/lib/duration";

describe("parseDurationToMinutes e formatMinutesAsDuration", () => {
  it.each([
    ["05:30", 330],
    ["24:30", 1_470],
    ["100:00", 6_000],
    ["00:01", 1],
    [" 08:15 ", 495],
  ])("converte duração válida %s para %i minutos", (input, expected) => {
    expect(parseDurationToMinutes(input)).toBe(expected);
  });

  it.each([
    "00:00",
    "-01:00",
    "01:60",
    "5:30",
    "1.5",
    "1,5",
    "",
    "   ",
    "12:5",
    "abc:def",
    "20000:00",
  ])("rejeita duração inválida %s", (input) => {
    expect(parseDurationToMinutes(input)).toBeNull();
  });

  it("aceita exatamente o limite máximo documentado e rejeita acima dele", () => {
    const maxFormatted = formatMinutesAsDuration(MAX_DURATION_MINUTES);
    expect(parseDurationToMinutes(maxFormatted)).toBe(MAX_DURATION_MINUTES);
    expect(
      parseDurationToMinutes(formatMinutesAsDuration(MAX_DURATION_MINUTES + 1)),
    ).toBeNull();
  });

  it.each([
    [0, "00:00"],
    [330, "05:30"],
    [1_470, "24:30"],
    [6_000, "100:00"],
  ])(
    "formata %i minutos como %s sem reduzir horas módulo 24",
    (minutes, expected) => {
      expect(formatMinutesAsDuration(minutes)).toBe(expected);
    },
  );

  it("rejeita minutos negativos ou fracionários na formatação", () => {
    expect(() => formatMinutesAsDuration(-1)).toThrow();
    expect(() => formatMinutesAsDuration(10.5)).toThrow();
  });
});

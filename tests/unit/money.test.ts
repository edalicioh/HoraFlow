import { describe, expect, it } from "vitest";
import {
  formatCentsAsBRL,
  formatCentsAsInput,
  MAX_CENTS,
  parseBRLToCents,
  parseOptionalBRLToCents,
} from "@/lib/money";

describe("parseBRLToCents", () => {
  it.each([
    ["1.234,56", 123_456],
    ["1234,56", 123_456],
    ["1234", 123_400],
    ["0,5", 50],
    ["0,05", 5],
    ["R$ 150,00", 15_000],
    [" 150,00 ", 15_000],
    ["0", 0],
  ])("converte %s para %i centavos", (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "-1,00",
    "1,234",
    "12.34",
    "abc",
    "1.23,45",
    "1,2,3",
    "R$",
  ])("rejeita o valor inválido %s", (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });

  it("rejeita valor acima do limite inteiro do Prisma", () => {
    expect(parseBRLToCents("999999999999,99")).toBeNull();
    expect(parseBRLToCents(formatCentsAsInput(MAX_CENTS))).toBe(MAX_CENTS);
  });
});

describe("formatação monetária", () => {
  it("formata centavos em BRL", () => {
    expect(formatCentsAsBRL(15_000)).toContain("150,00");
    expect(formatCentsAsBRL(0)).toContain("0,00");
  });

  it("formata centavos para o campo de edição", () => {
    expect(formatCentsAsInput(123_456)).toBe("1.234,56");
  });
});

describe("parseOptionalBRLToCents", () => {
  it.each([null, undefined, "", "   ", "\u00a0"])(
    "retorna cents=null para entrada vazia (%s)",
    (input) => {
      expect(parseOptionalBRLToCents(input)).toEqual({
        valid: true,
        cents: null,
      });
    },
  );

  it.each([
    ["0", 0],
    ["0,00", 0],
    ["R$ 0,00", 0],
    ["120,00", 12_000],
    ["1.500,50", 150_050],
  ])("preserva valor válido opcional %s -> %i centavos", (input, cents) => {
    expect(parseOptionalBRLToCents(input)).toEqual({
      valid: true,
      cents,
    });
  });

  it.each(["-10,00", "12.34", "abc", "10,999", "999999999999,99"])(
    "sinaliza invalidade para %s",
    (input) => {
      expect(parseOptionalBRLToCents(input)).toEqual({ valid: false });
    },
  );
});

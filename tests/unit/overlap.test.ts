import { describe, expect, it } from "vitest";
import { intervalsOverlap } from "@/lib/datetime";
import { computeTimeEntryTotals } from "@/modules/time-entry/service";

describe("intervalsOverlap", () => {
  const t = (iso: string) => new Date(iso);

  it("detecta conflito em intervalos iguais, contidos e parcialmente sobrepostos", () => {
    const baseStart = t("2026-10-15T11:00:00.000Z"); // 08:00 BRT
    const baseEnd = t("2026-10-15T13:00:00.000Z"); // 10:00 BRT

    // Igual
    expect(intervalsOverlap(baseStart, baseEnd, baseStart, baseEnd)).toBe(true);

    // Contido dentro
    expect(
      intervalsOverlap(
        baseStart,
        baseEnd,
        t("2026-10-15T11:30:00.000Z"),
        t("2026-10-15T12:30:00.000Z"),
      ),
    ).toBe(true);

    // Contendo por fora
    expect(
      intervalsOverlap(
        baseStart,
        baseEnd,
        t("2026-10-15T10:30:00.000Z"),
        t("2026-10-15T13:30:00.000Z"),
      ),
    ).toBe(true);

    // Cruzado no início
    expect(
      intervalsOverlap(
        baseStart,
        baseEnd,
        t("2026-10-15T10:00:00.000Z"),
        t("2026-10-15T11:01:00.000Z"),
      ),
    ).toBe(true);

    // Cruzado no fim
    expect(
      intervalsOverlap(
        baseStart,
        baseEnd,
        t("2026-10-15T12:59:00.000Z"),
        t("2026-10-15T14:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("permite intervalos adjacentes (08:00–09:00 e 09:00–10:00) e disjuntos", () => {
    const firstStart = t("2026-10-15T11:00:00.000Z"); // 08:00
    const firstEnd = t("2026-10-15T12:00:00.000Z"); // 09:00
    const secondStart = t("2026-10-15T12:00:00.000Z"); // 09:00
    const secondEnd = t("2026-10-15T13:00:00.000Z"); // 10:00

    expect(intervalsOverlap(firstStart, firstEnd, secondStart, secondEnd)).toBe(
      false,
    );
    expect(intervalsOverlap(secondStart, secondEnd, firstStart, firstEnd)).toBe(
      false,
    );
  });
});

describe("computeTimeEntryTotals", () => {
  it("soma minutos faturáveis e não faturáveis, conta dias trabalhados distintos e não cobra não faturáveis", () => {
    const totals = computeTimeEntryTotals([
      {
        workDate: "2026-10-10",
        durationMinutes: 180,
        amountCents: 22_500,
        billable: true,
      },
      {
        workDate: "2026-10-10",
        durationMinutes: 150,
        amountCents: 0,
        billable: false,
      },
      {
        workDate: "2026-10-11",
        durationMinutes: 1_470, // 24:30
        amountCents: 183_750,
        billable: true,
      },
    ]);

    expect(totals).toEqual({
      totalMinutes: 1_800, // 30:00
      billableMinutes: 1_650,
      nonBillableMinutes: 150,
      totalCents: 206_250,
      workedDaysCount: 2,
      entryCount: 3,
    });
  });
});

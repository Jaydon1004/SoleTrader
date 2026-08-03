import { describe, expect, it } from "vitest";
import { ageDebtors, buildProfitLossRows } from "@/lib/report-calculations";

describe("report calculations", () => {
  const months = Array.from({ length: 12 }, (_, index) => ({
    key: `month-${index + 1}`,
    label: `Month ${index + 1}`,
    income: 100 + index,
    expenses: 25,
  }));

  it("rolls tax-year months into quarters and an annual total", () => {
    const quarters = buildProfitLossRows(months, "quarterly");
    expect(quarters).toHaveLength(4);
    expect(quarters[0]).toMatchObject({
      label: "Quarter 1",
      income: 303,
      expenses: 75,
      profit: 228,
    });

    const annual = buildProfitLossRows(months, "annual");
    expect(annual).toEqual([
      {
        key: "annual",
        label: "Full tax year",
        income: 1266,
        expenses: 300,
        profit: 966,
      },
    ]);
  });

  it("places invoice balances on exact ageing boundaries", () => {
    const totals = ageDebtors(
      [
        { dueDate: "2026-04-06", balance: 10 },
        { dueDate: "2026-04-05", balance: 20 },
        { dueDate: "2026-03-07", balance: 30 },
        { dueDate: "2026-03-06", balance: 40 },
        { dueDate: "2026-02-05", balance: 50 },
        { dueDate: "2026-02-04", balance: 60 },
        { dueDate: "2026-01-06", balance: 70 },
        { dueDate: "2026-01-05", balance: 80 },
      ],
      "2026-04-06",
    );

    expect(totals).toEqual({
      current: 10,
      days1To30: 50,
      days31To60: 90,
      days61To90: 130,
      days90Plus: 80,
      total: 360,
    });
  });
});

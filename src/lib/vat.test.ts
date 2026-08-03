import { describe, expect, it } from "vitest";
import {
  applyVatAdjustments,
  calculateReturn,
  vatPeriods,
  type VatAdjustment,
  type VatPeriod,
} from "@/lib/queries/vat";
import type { TaxYearConfig, UserProfile, VatSettings } from "@/types/database";

describe("VAT periods", () => {
  it("assigns each VAT quarter to one tax-year view by its end date", () => {
    const config = {
      year_start: "2025-04-06",
      year_end: "2026-04-05",
      vat_payment_deadline_days: 37,
    } as TaxYearConfig;
    const settings = { quarter_start_month: 3 } as VatSettings;

    const periods = vatPeriods(config, settings);

    expect(periods).toHaveLength(4);
    expect(periods.map((period) => period.end)).toEqual([
      "2025-05-31",
      "2025-08-31",
      "2025-11-30",
      "2026-02-28",
    ]);
    expect(
      periods.every(
        (period) =>
          period.end >= config.year_start && period.end <= config.year_end,
      ),
    ).toBe(true);
  });
});

describe("VAT adjustments", () => {
  it("applies signed deltas in the target period and derives boxes 3 and 5", () => {
    const period = {
      start: "2026-07-01",
      end: "2026-09-30",
      label: "Quarter",
      deadline: "2026-11-06",
    };
    const adjustment = {
      adjustment_date: "2026-07-15",
      box1: 5,
      box2: -1,
      box4: 2,
      box6: 25,
      box7: -10,
      box8: 0,
      box9: 0,
    } as VatAdjustment;
    const outside = { ...adjustment, adjustment_date: "2026-10-01", box1: 100 };

    expect(
      applyVatAdjustments(
        period,
        { box1: 20, box2: 3, box4: 8, box6: 100, box7: 40, box8: 0, box9: 0 },
        [adjustment, outside],
      ),
    ).toEqual({
      box1: 25,
      box2: 2,
      box3: 27,
      box4: 10,
      box5: 17,
      box6: 125,
      box7: 30,
      box8: 0,
      box9: 0,
    });
  });
});

describe("self-billed invoice VAT", () => {
  const period = {
    start: "2026-07-01",
    end: "2026-09-30",
    label: "Quarter",
    deadline: "2026-11-06",
  } as VatPeriod;
  const config = { vat_standard_rate_percent: 20 } as TaxYearConfig;
  const invoice = {
    id: 42,
    issue_date: "2026-07-01",
    subtotal: 1000,
    vat_amount: 200,
    total: 1200,
    vat_ec_supply: 0,
  };

  it("reports the original customer self-bill on standard VAT accounting", () => {
    const result = calculateReturn(
      period,
      { vat_scheme: "standard", vat_flat_rate_percent: 0 } as UserProfile,
      config,
      [invoice],
      [],
      [],
      [],
    );
    expect(result).toMatchObject({ box1: 200, box5: 200, box6: 1000 });
  });

  it("uses total cash-plus-CIS settlement under cash accounting", () => {
    const payment = {
      ...invoice,
      payment_date: "2026-07-15",
      payment_amount: 1200,
    };
    const result = calculateReturn(
      period,
      {
        vat_scheme: "cash_accounting",
        vat_flat_rate_percent: 0,
      } as UserProfile,
      config,
      [],
      [payment],
      [],
      [],
    );
    expect(result).toMatchObject({ box1: 200, box5: 200, box6: 1000 });
  });

  it("applies the flat rate to the full customer-issued gross value", () => {
    const result = calculateReturn(
      period,
      { vat_scheme: "flat_rate", vat_flat_rate_percent: 12.5 } as UserProfile,
      config,
      [invoice],
      [],
      [],
      [],
    );
    expect(result).toMatchObject({ box1: 150, box5: 150, box6: 1200 });
  });
});

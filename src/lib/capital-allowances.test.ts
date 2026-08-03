import { describe, expect, it } from "vitest";
import { calculateCapitalAllowanceSchedules } from "@/lib/capital-allowances";
import type { CapitalAsset, TaxYearConfig } from "@/types/database";

function config(taxYear: string, start: string, end: string): TaxYearConfig {
  return {
    tax_year: taxYear,
    year_start: start,
    year_end: end,
    aia_limit: 1000,
    main_pool_wda_percent: 18,
    special_rate_wda_percent: 6,
  } as TaxYearConfig;
}

function asset(
  values: Partial<CapitalAsset> &
    Pick<CapitalAsset, "id" | "name" | "purchase_date" | "purchase_price">,
): CapitalAsset {
  return {
    asset_type: "equipment",
    description: "",
    business_percent: 100,
    pool_type: "main",
    claim_method: "aia",
    disposal_date: null,
    disposal_proceeds: 0,
    notes: "",
    deleted_at: null,
    created_at: "",
    updated_at: "",
    ...values,
  };
}

describe("capital allowance schedules", () => {
  it("applies AIA first and sends excess cost to the configured pools", () => {
    const schedules = calculateCapitalAllowanceSchedules(
      [
        asset({
          id: 1,
          name: "Machine",
          purchase_date: "2024-06-01",
          purchase_price: 2000,
        }),
        asset({
          id: 2,
          name: "Integral feature",
          purchase_date: "2024-07-01",
          purchase_price: 1000,
          pool_type: "special",
          claim_method: "wda",
        }),
      ],
      [config("2024/25", "2024-04-06", "2025-04-05")],
    );

    expect(schedules[0]).toMatchObject({
      aiaClaim: 1000,
      aiaRemaining: 0,
      totalAllowance: 1240,
    });
    expect(schedules[0].mainPool).toMatchObject({
      additions: 1000,
      writingDownAllowance: 180,
      closingValue: 820,
    });
    expect(schedules[0].specialPool).toMatchObject({
      additions: 1000,
      writingDownAllowance: 60,
      closingValue: 940,
    });
  });

  it("rolls pools forward and reports excess disposal value as a balancing charge", () => {
    const schedules = calculateCapitalAllowanceSchedules(
      [
        asset({
          id: 1,
          name: "Machine",
          purchase_date: "2024-06-01",
          purchase_price: 2000,
          disposal_date: "2025-08-01",
          disposal_proceeds: 1500,
        }),
      ],
      [
        config("2024/25", "2024-04-06", "2025-04-05"),
        config("2025/26", "2025-04-06", "2026-04-05"),
      ],
    );

    expect(schedules[1].mainPool).toMatchObject({
      openingValue: 820,
      disposals: 1500,
      balancingCharge: 680,
      closingValue: 0,
    });
    expect(schedules[1]).toMatchObject({
      totalAllowance: 0,
      balancingCharge: 680,
      netAllowance: -680,
    });
  });
});

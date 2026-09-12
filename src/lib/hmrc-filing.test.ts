import { describe, expect, it } from "vitest";
import {
  buildHmrcBusinessCalculation,
  buildSa103Schedule,
  emptyHmrcFilingDetails,
} from "@/lib/hmrc-filing";
import { defaultTaxCalculatorInput } from "@/lib/queries/tax-calculator";
import type { AdvancedTaxData } from "@/lib/queries/advanced-tax";
import type { DashboardData } from "@/lib/queries/dashboard";

const dashboard = {
  income: 60_000,
  expenses: 20_000,
  profit: 40_000,
  accountingBasis: "cash",
  profile: {
    trading_name: "A & B Joinery",
    business_description: "Joinery",
    address_line_1: "1 High Street",
    postcode: "AB1 2CD",
  },
  config: {
    tax_year: "2025/26",
    year_start: "2025-04-06",
    year_end: "2026-04-05",
    vat_registration_threshold: 90_000,
    home_office_25_50_hours: 10,
    home_office_51_100_hours: 18,
    home_office_101_plus_hours: 26,
  },
} as DashboardData;

const advancedTax = {
  cisReceived: 1_200,
  schedule: {
    totalAllowance: 5_000,
    balancingCharge: 500,
    aiaClaim: 4_000,
    mainPool: { writingDownAllowance: 800 },
    specialPool: { writingDownAllowance: 200 },
  },
} as AdvancedTaxData;

describe("HMRC filing calculation", () => {
  it("reconciles bookkeeping profit through tax adjustments", () => {
    const filing = {
      ...emptyHmrcFilingDetails("2025/26"),
      disallowable_expenses: 1_000,
      goods_own_use: 300,
      non_taxable_business_income: 200,
      other_business_income: 400,
      loss_brought_forward: 2_000,
    };
    const taxInput = {
      ...defaultTaxCalculatorInput("2025/26"),
      home_office_method: "flat_rate" as const,
      home_office_hours_per_month: 60,
      home_office_months: 12,
    };
    const result = buildHmrcBusinessCalculation({
      dashboard,
      taxInput,
      advancedTax,
      filing,
    });

    expect(result.bookkeepingProfit).toBe(40_000);
    expect(result.homeOfficeDeduction).toBe(216);
    expect(result.additionsToProfit).toBe(1_800);
    expect(result.deductionsFromProfit).toBe(5_200);
    expect(result.netProfit).toBe(40_184);
    expect(result.profitForTaxPurposes).toBe(36_784);
    expect(result.totalTaxableProfit).toBe(34_784);
    expect(result.cisDeductions).toBe(1_200);
    expect(result.annualInvestmentAllowance).toBe(4_000);
    expect(result.mainPoolAllowance).toBe(800);
    expect(result.specialPoolAllowance).toBe(200);
  });

  it("maps simple 2025/26 records to the official SA103S boxes", () => {
    const filing = emptyHmrcFilingDetails("2025/26");
    const calculation = buildHmrcBusinessCalculation({
      dashboard,
      taxInput: defaultTaxCalculatorInput("2025/26"),
      advancedTax,
      filing,
    });
    const schedule = buildSa103Schedule({ dashboard, filing, calculation });

    expect(schedule.form).toBe("SA103S");
    expect(schedule.verified).toBe(true);
    expect(schedule.boxes.find((row) => row.box === "9")?.value).toBe(60_000);
    expect(schedule.boxes.find((row) => row.box === "38")?.value).toBe(1_200);
  });

  it("applies opening-to-closing stock movement only on accrual basis", () => {
    const filing = {
      ...emptyHmrcFilingDetails("2025/26"),
      opening_stock: 4_000,
    };
    const accrualDashboard = {
      ...dashboard,
      accountingBasis: "accrual",
    } as DashboardData;
    const result = buildHmrcBusinessCalculation({
      dashboard: accrualDashboard,
      taxInput: defaultTaxCalculatorInput("2025/26"),
      advancedTax: {
        ...advancedTax,
        schedule: {
          ...advancedTax.schedule,
          totalAllowance: 0,
          balancingCharge: 0,
        },
      },
      filing,
      closingStock: 7_500,
    });

    expect(result.stockMovementAdjustment).toBe(3_500);
    expect(result.netProfit).toBe(43_500);
  });

  it("selects SA103F for complex cases and blocks unverified form years", () => {
    const filing = {
      ...emptyHmrcFilingDetails("2026/27"),
      special_arrangements: 1,
    };
    const futureDashboard = {
      ...dashboard,
      config: { ...dashboard.config, tax_year: "2026/27" },
    } as DashboardData;
    const calculation = buildHmrcBusinessCalculation({
      dashboard: futureDashboard,
      taxInput: defaultTaxCalculatorInput("2026/27"),
      advancedTax,
      filing,
    });
    const schedule = buildSa103Schedule({
      dashboard: futureDashboard,
      filing,
      calculation,
    });

    expect(schedule.form).toBe("SA103F");
    expect(schedule.verified).toBe(false);
    expect(schedule.reviewItems).toContain(
      "Official 2026/27 SA103 form mapping is not yet verified.",
    );
  });
});

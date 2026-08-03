import { expect, it } from "vitest";
import { calculateFullTaxEstimate } from "@/lib/tax-estimate";
import type {
  TaxCalculatorInput,
  TaxYearConfig,
  UserProfile,
} from "@/types/database";

const config = {
  year_start: "2025-04-06",
  year_end: "2026-04-05",
  personal_allowance: 12570,
  blind_persons_allowance: 3070,
  pa_taper_start: 100000,
  pa_taper_rate: 0.5,
  basic_rate_upper: 50270,
  higher_rate_upper: 125140,
  basic_rate_percent: 20,
  higher_rate_percent: 40,
  additional_rate_percent: 45,
  dividend_basic_rate: 8.75,
  dividend_higher_rate: 33.75,
  dividend_additional_rate: 39.35,
  dividend_allowance: 500,
  savings_allowance_basic: 1000,
  savings_allowance_higher: 500,
  savings_allowance_additional: 0,
  marriage_allowance_percent: 10,
  pension_basic_rate_relief: 20,
  class2_small_profits_threshold: 12570,
  class2_weekly_rate: 3.45,
  class4_lower_threshold: 12570,
  class4_upper_threshold: 50270,
  class4_main_rate_percent: 6,
  class4_upper_rate_percent: 2,
  poa_threshold: 1000,
  poa_source_deducted_percent: 80,
  poa_rate_percent: 50,
  poa_first_deadline: "01-31",
  poa_second_deadline: "07-31",
} as TaxYearConfig;

const input = {
  employment_income: 0,
  employment_tax_paid: 500,
  rental_income: 0,
  savings_interest: 0,
  dividend_income: 0,
  pension_contributions: 0,
  gift_aid_donations: 0,
  marriage_allowance_claimed: 0,
  blind_person_allowance_claimed: 0,
  home_office_method: "none",
  home_office_hours_per_month: 0,
  home_office_months: 0,
  home_office_actual_cost: 0,
  other_tax_deducted: 100,
  prior_year_tax_bill: 0,
  prior_year_tax_deducted: 0,
} as TaxCalculatorInput;

it("integrates capital allowances, balancing charges, and CIS received", () => {
  const profile = { student_loan_plan: "none" } as UserProfile;
  const baseline = calculateFullTaxEstimate(40000, input, config, profile, 200);
  const adjusted = calculateFullTaxEstimate(
    40000,
    input,
    config,
    profile,
    200,
    {
      capitalAllowances: 10000,
      balancingCharges: 1000,
      cisDeductionsReceived: 300,
    },
  );

  expect(adjusted.adjustedBusinessProfit).toBe(31000);
  expect(adjusted.capitalAllowances).toBe(10000);
  expect(adjusted.balancingCharges).toBe(1000);
  expect(adjusted.taxDeducted).toBe(1100);
  expect(adjusted.totalLiability).toBeLessThan(baseline.totalLiability);
});

it("does not charge compulsory Class 2 NI from 2024/25 onward", () => {
  const profile = { student_loan_plan: "none" } as UserProfile;

  const estimate = calculateFullTaxEstimate(40000, input, config, profile);

  expect(estimate.class2Ni).toBe(0);
});

it("preserves compulsory Class 2 NI for historical tax years", () => {
  const profile = { student_loan_plan: "none" } as UserProfile;
  const historicalConfig = {
    ...config,
    year_start: "2023-04-06",
    year_end: "2024-04-05",
  };

  const estimate = calculateFullTaxEstimate(
    40000,
    input,
    historicalConfig,
    profile,
  );

  expect(estimate.class2Ni).toBe(179.4);
});

it("applies the starting rate for savings before the personal savings allowance", () => {
  const estimate = calculateFullTaxEstimate(
    12570,
    { ...input, savings_interest: 5000 },
    config,
    { student_loan_plan: "none" } as UserProfile,
  );

  expect(estimate.savingsTax.tax).toBe(0);
  expect(estimate.incomeTax).toBe(0);
});

it("does not subtract future payments on account from the balancing payment", () => {
  const estimate = calculateFullTaxEstimate(
    50000,
    {
      ...input,
      employment_tax_paid: 0,
      other_tax_deducted: 0,
      prior_year_tax_bill: 8000,
      prior_year_tax_deducted: 0,
    },
    config,
    { student_loan_plan: "none" } as UserProfile,
    8000,
  );

  expect(estimate.paymentOnAccount.required).toBe(true);
  expect(estimate.paymentOnAccount.balancingPayment).toBe(estimate.amountDue);
  expect(estimate.paymentOnAccount.firstDeadline).toBe("2027-01-31");
  expect(estimate.paymentOnAccount.balancingDeadline).toBe("2027-01-31");
});

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, query } from "@/lib/database";
import type { AdvancedTaxData } from "@/lib/queries/advanced-tax";
import type { DashboardData } from "@/lib/queries/dashboard";
import { homeOfficeDeduction } from "@/lib/tax-estimate";
import type { TaxCalculatorInput } from "@/types/database";

export interface HmrcFilingDetails {
  tax_year: string;
  opening_stock: number;
  business_started: number;
  start_date: string;
  business_ceased: number;
  cessation_date: string;
  business_details_changed: number;
  multiple_businesses: number;
  special_arrangements: number;
  provisional_figures: number;
  goods_own_use: number;
  other_business_income: number;
  non_taxable_business_income: number;
  disallowable_expenses: number;
  basis_period_adjustment: number;
  accounting_practice_adjustment: number;
  averaging_adjustment: number;
  transition_profit: number;
  transition_profit_loss_relief: number;
  loss_brought_forward: number;
  current_loss_other_income: number;
  current_loss_carry_back: number;
  loss_carry_forward: number;
  other_tax_taken_off: number;
  class2_voluntary: number;
  class4_exempt: number;
  other_information: string;
  unsupported_circumstances_confirmed: number;
  reviewed: number;
  updated_at?: string;
}

export interface HmrcBusinessCalculation {
  bookkeepingIncome: number;
  bookkeepingExpenses: number;
  bookkeepingProfit: number;
  stockMovementAdjustment: number;
  netProfit: number;
  netLoss: number;
  homeOfficeDeduction: number;
  capitalAllowances: number;
  annualInvestmentAllowance: number;
  mainPoolAllowance: number;
  specialPoolAllowance: number;
  balancingCharges: number;
  additionsToProfit: number;
  deductionsFromProfit: number;
  profitForTaxPurposes: number;
  lossForTaxPurposes: number;
  adjustedProfit: number;
  adjustedLoss: number;
  lossBroughtForwardUsed: number;
  totalTaxableProfit: number;
  cisDeductions: number;
}

export interface Sa103Box {
  box: string;
  label: string;
  value: string | number;
  source: string;
  status: "derived" | "declared" | "review";
}

export interface Sa103Schedule {
  form: "SA103S" | "SA103F";
  formVersion: string;
  verified: boolean;
  reason: string;
  boxes: Sa103Box[];
  reviewItems: string[];
}

const roundMoney = (value: number) => Number(value.toFixed(2));

export function emptyHmrcFilingDetails(taxYear: string): HmrcFilingDetails {
  return {
    tax_year: taxYear,
    opening_stock: 0,
    business_started: 0,
    start_date: "",
    business_ceased: 0,
    cessation_date: "",
    business_details_changed: 0,
    multiple_businesses: 0,
    special_arrangements: 0,
    provisional_figures: 0,
    goods_own_use: 0,
    other_business_income: 0,
    non_taxable_business_income: 0,
    disallowable_expenses: 0,
    basis_period_adjustment: 0,
    accounting_practice_adjustment: 0,
    averaging_adjustment: 0,
    transition_profit: 0,
    transition_profit_loss_relief: 0,
    loss_brought_forward: 0,
    current_loss_other_income: 0,
    current_loss_carry_back: 0,
    loss_carry_forward: 0,
    other_tax_taken_off: 0,
    class2_voluntary: 0,
    class4_exempt: 0,
    other_information: "",
    unsupported_circumstances_confirmed: 0,
    reviewed: 0,
  };
}

export function buildHmrcBusinessCalculation(input: {
  dashboard: DashboardData;
  taxInput: TaxCalculatorInput;
  advancedTax: AdvancedTaxData;
  filing: HmrcFilingDetails;
  closingStock?: number;
}): HmrcBusinessCalculation {
  const { dashboard, taxInput, advancedTax, filing } = input;
  const bookkeepingProfit = roundMoney(dashboard.income - dashboard.expenses);
  const stockMovementAdjustment =
    dashboard.accountingBasis === "accrual"
      ? Math.max(0, input.closingStock ?? 0) - filing.opening_stock
      : 0;
  const homeOffice = Math.min(
    Math.max(0, bookkeepingProfit),
    homeOfficeDeduction(taxInput, dashboard.config),
  );
  const additions =
    filing.disallowable_expenses +
    advancedTax.schedule.balancingCharge +
    filing.goods_own_use;
  const deductions =
    advancedTax.schedule.totalAllowance + filing.non_taxable_business_income;
  const accountsResult =
    bookkeepingProfit +
    stockMovementAdjustment +
    filing.other_business_income -
    homeOffice;
  const taxPurposeResult = accountsResult + additions - deductions;
  const adjustedResult =
    taxPurposeResult +
    filing.basis_period_adjustment +
    filing.accounting_practice_adjustment +
    filing.averaging_adjustment;
  const beforeLossRelief =
    Math.max(0, adjustedResult) +
    filing.transition_profit -
    filing.transition_profit_loss_relief;
  const lossBroughtForwardUsed = Math.min(
    Math.max(0, beforeLossRelief),
    filing.loss_brought_forward,
  );
  return {
    bookkeepingIncome: roundMoney(dashboard.income),
    bookkeepingExpenses: roundMoney(dashboard.expenses),
    bookkeepingProfit,
    stockMovementAdjustment: roundMoney(stockMovementAdjustment),
    netProfit: roundMoney(Math.max(0, accountsResult)),
    netLoss: roundMoney(Math.max(0, -accountsResult)),
    homeOfficeDeduction: roundMoney(homeOffice),
    capitalAllowances: roundMoney(advancedTax.schedule.totalAllowance),
    annualInvestmentAllowance: roundMoney(advancedTax.schedule.aiaClaim),
    mainPoolAllowance: roundMoney(
      advancedTax.schedule.mainPool.writingDownAllowance,
    ),
    specialPoolAllowance: roundMoney(
      advancedTax.schedule.specialPool.writingDownAllowance,
    ),
    balancingCharges: roundMoney(advancedTax.schedule.balancingCharge),
    additionsToProfit: roundMoney(additions),
    deductionsFromProfit: roundMoney(deductions),
    profitForTaxPurposes: roundMoney(Math.max(0, taxPurposeResult)),
    lossForTaxPurposes: roundMoney(Math.max(0, -taxPurposeResult)),
    adjustedProfit: roundMoney(Math.max(0, adjustedResult)),
    adjustedLoss: roundMoney(Math.max(0, -adjustedResult)),
    lossBroughtForwardUsed: roundMoney(lossBroughtForwardUsed),
    totalTaxableProfit: roundMoney(
      Math.max(0, beforeLossRelief - lossBroughtForwardUsed),
    ),
    cisDeductions: roundMoney(advancedTax.cisReceived),
  };
}

export function buildSa103Schedule(input: {
  dashboard: DashboardData;
  filing: HmrcFilingDetails;
  calculation: HmrcBusinessCalculation;
}): Sa103Schedule {
  const { dashboard, filing, calculation } = input;
  const verified = dashboard.config.tax_year === "2025/26";
  const complex =
    dashboard.income >= dashboard.config.vat_registration_threshold ||
    filing.multiple_businesses === 1 ||
    filing.special_arrangements === 1 ||
    filing.basis_period_adjustment !== 0 ||
    filing.accounting_practice_adjustment !== 0 ||
    filing.averaging_adjustment !== 0 ||
    filing.transition_profit > 0;
  const form = complex ? "SA103F" : "SA103S";
  const box = (
    number: string,
    label: string,
    value: string | number,
    source: string,
    status: Sa103Box["status"] = "derived",
  ): Sa103Box => ({ box: number, label, value, source, status });
  const boxes =
    form === "SA103S"
      ? [
          box(
            "1",
            "Description of business",
            dashboard.profile.business_description,
            "Business profile",
            "declared",
          ),
          box(
            "2",
            "Business postcode",
            dashboard.profile.postcode,
            "Business profile",
            "declared",
          ),
          box(
            "3",
            "Business details changed",
            filing.business_details_changed ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "5Q",
            "Business started after 5 April 2025",
            filing.business_started ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "5",
            "Business start date",
            filing.start_date,
            "HMRC declarations",
            "declared",
          ),
          box(
            "6Q",
            "Business ceased during the year",
            filing.business_ceased ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "6",
            "Cessation date",
            filing.cessation_date,
            "HMRC declarations",
            "declared",
          ),
          box(
            "7",
            "Accounts made up to",
            dashboard.config.year_end,
            "Tax-year configuration",
          ),
          box(
            "8",
            "Traditional accounting used",
            dashboard.accountingBasis === "accrual" ? "Yes" : "No",
            "Business profile",
          ),
          box(
            "9",
            "Turnover",
            calculation.bookkeepingIncome,
            "Recognised sales and direct income",
          ),
          box(
            "10",
            "Other business income",
            filing.other_business_income,
            "HMRC declarations",
            "declared",
          ),
          box(
            "20",
            "Total allowable expenses",
            calculation.bookkeepingExpenses + calculation.homeOfficeDeduction,
            "Allowable expense ledger plus use-of-home claim",
          ),
          box(
            "21",
            "Net profit",
            calculation.netProfit,
            "Income less bookkeeping expenses",
          ),
          box(
            "22",
            "Net loss",
            calculation.netLoss,
            "Bookkeeping expenses less income",
          ),
          box(
            "23",
            "Annual Investment Allowance",
            calculation.annualInvestmentAllowance,
            "Capital allowance asset schedule",
          ),
          box(
            "25",
            "Other capital allowances",
            calculation.mainPoolAllowance + calculation.specialPoolAllowance,
            "18% and 6% pool schedules",
          ),
          box(
            "26",
            "Total balancing charges",
            calculation.balancingCharges,
            "Capital allowance asset schedule",
          ),
          box(
            "27",
            "Goods and services for own use",
            filing.goods_own_use,
            "HMRC declarations",
            "declared",
          ),
          box(
            "28",
            "Net business profit for tax purposes",
            calculation.profitForTaxPurposes,
            "Canonical profit reconciliation",
          ),
          box(
            "29",
            "Loss brought forward used",
            calculation.lossBroughtForwardUsed,
            "HMRC declarations",
            "declared",
          ),
          box(
            "31",
            "Total taxable profits",
            calculation.totalTaxableProfit,
            "Canonical profit reconciliation",
          ),
          box(
            "32",
            "Net business loss for tax purposes",
            calculation.lossForTaxPurposes,
            "Canonical profit reconciliation",
          ),
          box(
            "33",
            "Current loss set against other income",
            filing.current_loss_other_income,
            "HMRC declarations",
            "declared",
          ),
          box(
            "34",
            "Current loss carried back",
            filing.current_loss_carry_back,
            "HMRC declarations",
            "declared",
          ),
          box(
            "35",
            "Total loss carried forward",
            filing.loss_carry_forward,
            "HMRC declarations",
            "declared",
          ),
          box(
            "36",
            "Voluntary Class 2 NICs",
            filing.class2_voluntary ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "37",
            "Exempt from Class 4 NICs",
            filing.class4_exempt ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "38",
            "CIS deductions taken",
            calculation.cisDeductions,
            "CIS transaction ledger",
          ),
        ]
      : [
          box(
            "1",
            "Business name",
            dashboard.profile.trading_name,
            "Business profile",
            "declared",
          ),
          box(
            "2",
            "Description of business",
            dashboard.profile.business_description,
            "Business profile",
            "declared",
          ),
          box(
            "3",
            "Business address",
            dashboard.profile.address_line_1,
            "Business profile",
            "declared",
          ),
          box(
            "4",
            "Business postcode",
            dashboard.profile.postcode,
            "Business profile",
            "declared",
          ),
          box(
            "5",
            "Business details changed",
            filing.business_details_changed ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "6Q",
            "Business started after 5 April 2025",
            filing.business_started ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "6",
            "Business start date",
            filing.start_date,
            "HMRC declarations",
            "declared",
          ),
          box(
            "7Q",
            "Business ceased during the year",
            filing.business_ceased ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "7",
            "Cessation date",
            filing.cessation_date,
            "HMRC declarations",
            "declared",
          ),
          box(
            "8",
            "Accounts start",
            dashboard.config.year_start,
            "Tax-year configuration",
          ),
          box(
            "9",
            "Accounts made up to",
            dashboard.config.year_end,
            "Tax-year configuration",
          ),
          box(
            "10",
            "Traditional accounting used",
            dashboard.accountingBasis === "accrual" ? "Yes" : "No",
            "Business profile",
          ),
          box(
            "13",
            "Special arrangements apply",
            filing.special_arrangements ? "Yes" : "No",
            "HMRC declarations",
            "declared",
          ),
          box(
            "15",
            "Turnover",
            calculation.bookkeepingIncome,
            "Recognised sales and direct income",
          ),
          box(
            "16",
            "Other business income",
            filing.other_business_income,
            "HMRC declarations",
            "declared",
          ),
          box(
            "31",
            "Total expenses working total",
            calculation.bookkeepingExpenses + calculation.homeOfficeDeduction,
            "Allowable expense reconciliation",
            "review",
          ),
          box(
            "46",
            "Total disallowable expenses",
            filing.disallowable_expenses,
            "HMRC declarations",
            "declared",
          ),
          box(
            "47",
            "Net profit",
            calculation.netProfit,
            "Income less bookkeeping expenses",
          ),
          box(
            "48",
            "Net loss",
            calculation.netLoss,
            "Bookkeeping expenses less income",
          ),
          box(
            "49",
            "Annual Investment Allowance",
            calculation.annualInvestmentAllowance,
            "Capital allowance asset schedule",
          ),
          box(
            "50",
            "Capital allowances at 18%",
            calculation.mainPoolAllowance,
            "Main-pool schedule",
          ),
          box(
            "51",
            "Capital allowances at 6%",
            calculation.specialPoolAllowance,
            "Special-rate-pool schedule",
          ),
          box(
            "57",
            "Total capital allowances",
            calculation.capitalAllowances,
            "Capital allowance asset schedule",
          ),
          box(
            "59",
            "Balancing charges",
            calculation.balancingCharges,
            "Capital allowance asset schedule",
          ),
          box(
            "60",
            "Goods and services for own use",
            filing.goods_own_use,
            "HMRC declarations",
            "declared",
          ),
          box(
            "61",
            "Total additions to net profit",
            calculation.additionsToProfit,
            "Canonical profit reconciliation",
          ),
          box(
            "62",
            "Non-taxable business income",
            filing.non_taxable_business_income,
            "HMRC declarations",
            "declared",
          ),
          box(
            "63",
            "Total deductions from net profit",
            calculation.deductionsFromProfit,
            "Canonical profit reconciliation",
          ),
          box(
            "64",
            "Net business profit for tax purposes",
            calculation.profitForTaxPurposes,
            "Canonical profit reconciliation",
          ),
          box(
            "65",
            "Net business loss for tax purposes",
            calculation.lossForTaxPurposes,
            "Canonical profit reconciliation",
          ),
          box(
            "68",
            "Basis period adjustment",
            filing.basis_period_adjustment,
            "HMRC declarations",
            "declared",
          ),
          box(
            "71",
            "Change of accounting practice adjustment",
            filing.accounting_practice_adjustment,
            "HMRC declarations",
            "declared",
          ),
          box(
            "72",
            "Averaging adjustment",
            filing.averaging_adjustment,
            "HMRC declarations",
            "declared",
          ),
          box(
            "73",
            "Adjusted profit",
            calculation.adjustedProfit,
            "Canonical profit reconciliation",
          ),
          box(
            "73.3",
            "Transition profit arising",
            filing.transition_profit,
            "HMRC declarations",
            "declared",
          ),
          box(
            "73.4",
            "Loss against transition profit",
            filing.transition_profit_loss_relief,
            "HMRC declarations",
            "declared",
          ),
          box(
            "74",
            "Loss brought forward used",
            calculation.lossBroughtForwardUsed,
            "HMRC declarations",
            "declared",
          ),
          box(
            "76",
            "Total taxable profits",
            calculation.totalTaxableProfit,
            "Canonical profit reconciliation",
          ),
          box(
            "77",
            "Adjusted loss",
            calculation.adjustedLoss,
            "Canonical profit reconciliation",
          ),
          box(
            "78",
            "Current loss set against other income",
            filing.current_loss_other_income,
            "HMRC declarations",
            "declared",
          ),
          box(
            "79",
            "Current loss carried back",
            filing.current_loss_carry_back,
            "HMRC declarations",
            "declared",
          ),
          box(
            "80",
            "Total loss carried forward",
            filing.loss_carry_forward,
            "HMRC declarations",
            "declared",
          ),
          box(
            "81",
            "CIS deductions taken",
            calculation.cisDeductions,
            "CIS transaction ledger",
          ),
          box(
            "82",
            "Other tax taken off trading income",
            filing.other_tax_taken_off,
            "HMRC declarations",
            "declared",
          ),
          box(
            "103",
            "Other information",
            filing.other_information,
            "HMRC declarations",
            "declared",
          ),
        ];
  const reviewItems = [
    ...(!verified
      ? [
          `Official ${dashboard.config.tax_year} SA103 form mapping is not yet verified.`,
        ]
      : []),
    ...(form === "SA103F" &&
    dashboard.income >= dashboard.config.vat_registration_threshold
      ? [
          "Reconcile detailed accounts expense boxes 17 to 30 and disallowable columns 32 to 45 before filing.",
        ]
      : []),
    ...(filing.multiple_businesses
      ? [
          "Prepare a separate self-employment schedule for each business (HS220).",
        ]
      : []),
    ...(filing.special_arrangements
      ? ["Special arrangements require form-specific professional review."]
      : []),
    ...(filing.provisional_figures
      ? ["Figures are provisional and the submitted return may need amendment."]
      : []),
    ...((filing.business_details_changed ||
      filing.provisional_figures ||
      filing.special_arrangements) &&
    !filing.other_information.trim()
      ? [
          "Add an explanation for changed details, provisional figures or special arrangements.",
        ]
      : []),
    ...(filing.current_loss_other_income > 0 ||
    filing.current_loss_carry_back > 0 ||
    filing.loss_carry_forward > 0 ||
    filing.loss_brought_forward > 0
      ? [
          "Confirm the loss-relief election and limits against HMRC helpsheet HS227 before filing.",
        ]
      : []),
  ];
  return {
    form,
    formVersion: verified ? "2026 (tax year 2025/26)" : "Unverified",
    verified,
    reason: complex
      ? "Full pages selected because turnover or declared circumstances require detailed reporting."
      : "Short pages appear suitable because turnover is below the threshold and no complex circumstances are recorded.",
    boxes,
    reviewItems,
  };
}

export async function loadHmrcFilingDetails(taxYear: string) {
  const rows = await query<HmrcFilingDetails>(
    "SELECT * FROM hmrc_filing_details WHERE tax_year = ?",
    [taxYear],
  );
  return rows[0] ?? emptyHmrcFilingDetails(taxYear);
}

export async function saveHmrcFilingDetails(details: HmrcFilingDetails) {
  const defaults = emptyHmrcFilingDetails(details.tax_year);
  const fields = Object.keys(defaults).filter(
    (field) => field !== "tax_year",
  ) as Array<Exclude<keyof HmrcFilingDetails, "tax_year" | "updated_at">>;
  await execute(
    `INSERT INTO hmrc_filing_details (tax_year, ${fields.join(", ")})
     VALUES (?, ${fields.map(() => "?").join(", ")})
     ON CONFLICT(tax_year) DO UPDATE SET
       ${fields.map((field) => `${field} = excluded.${field}`).join(", ")},
       updated_at = datetime('now')`,
    [details.tax_year, ...fields.map((field) => details[field])],
  );
}

export function useHmrcFilingDetails(taxYear: string) {
  return useQuery({
    queryKey: ["hmrc-filing-details", taxYear],
    queryFn: () => loadHmrcFilingDetails(taxYear),
    enabled: !!taxYear,
  });
}

export function useSaveHmrcFilingDetails() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveHmrcFilingDetails,
    onSuccess: (_, details) =>
      client.invalidateQueries({
        queryKey: ["hmrc-filing-details", details.tax_year],
      }),
  });
}

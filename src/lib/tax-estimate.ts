import type {
  TaxCalculatorInput,
  TaxYearConfig,
  UserProfile,
} from "@/types/database";

export interface TaxEstimate {
  adjustedPersonalAllowance: number;
  taxableProfit: number;
  incomeTax: number;
  class2Ni: number;
  class4Ni: number;
  total: number;
}

export interface TaxBandResult {
  basic: number;
  higher: number;
  additional: number;
  tax: number;
}

export interface PaymentOnAccount {
  required: boolean;
  firstPayment: number;
  firstDeadline: string;
  secondPayment: number;
  secondDeadline: string;
  balancingPayment: number;
  balancingDeadline: string;
}

export interface FullTaxEstimate extends TaxEstimate {
  businessProfit: number;
  homeOfficeDeduction: number;
  capitalAllowances: number;
  balancingCharges: number;
  adjustedBusinessProfit: number;
  totalIncome: number;
  adjustedNetIncome: number;
  blindPersonsAllowance: number;
  personalAllowanceTaper: number;
  marriageAllowanceReduction: number;
  basicRateExtension: number;
  nonSavingsTax: TaxBandResult;
  savingsTax: TaxBandResult;
  dividendTax: TaxBandResult;
  savingsAllowance: number;
  dividendAllowance: number;
  studentLoan: number;
  totalLiability: number;
  taxDeducted: number;
  amountDue: number;
  monthlySetAside: number;
  paymentOnAccount: PaymentOnAccount;
}

export interface AdvancedTaxAdjustments {
  capitalAllowances?: number;
  balancingCharges?: number;
  cisDeductionsReceived?: number;
}

const round = (value: number) => Number(Math.max(0, value).toFixed(2));

function emptyBand(): TaxBandResult {
  return { basic: 0, higher: 0, additional: 0, tax: 0 };
}

function taxAcrossBands(
  amount: number,
  startingPoint: number,
  basicLimit: number,
  additionalLimit: number,
  rates: [number, number, number],
): TaxBandResult {
  if (amount <= 0) return emptyBand();
  const basic = Math.min(amount, Math.max(0, basicLimit - startingPoint));
  const afterBasic = amount - basic;
  const higherStart = Math.max(startingPoint, basicLimit);
  const higher = Math.min(
    afterBasic,
    Math.max(0, additionalLimit - higherStart),
  );
  const additional = Math.max(0, afterBasic - higher);
  return {
    basic: round(basic),
    higher: round(higher),
    additional: round(additional),
    tax: round(
      (basic * rates[0]) / 100 +
        (higher * rates[1]) / 100 +
        (additional * rates[2]) / 100,
    ),
  };
}

export function homeOfficeDeduction(
  input: TaxCalculatorInput,
  config: TaxYearConfig,
) {
  if (input.home_office_method === "actual")
    return input.home_office_actual_cost;
  if (input.home_office_method !== "flat_rate") return 0;
  const hours = input.home_office_hours_per_month;
  const monthlyRate =
    hours >= 101
      ? config.home_office_101_plus_hours
      : hours >= 51
        ? config.home_office_51_100_hours
        : hours >= 25
          ? config.home_office_25_50_hours
          : 0;
  return monthlyRate * input.home_office_months;
}

function studentLoanEstimate(
  earnedIncome: number,
  unearnedIncome: number,
  profile: UserProfile,
  config: TaxYearConfig,
) {
  const plans = {
    plan_1: [
      config.student_loan_plan1_threshold,
      config.student_loan_plan1_rate,
    ],
    plan_2: [
      config.student_loan_plan2_threshold,
      config.student_loan_plan2_rate,
    ],
    plan_4: [
      config.student_loan_plan4_threshold,
      config.student_loan_plan4_rate,
    ],
    postgrad: [
      config.student_loan_postgrad_threshold,
      config.student_loan_postgrad_rate,
    ],
  } as const;
  if (profile.student_loan_plan === "none") return 0;
  const [threshold, rate] = plans[profile.student_loan_plan];
  const repaymentIncome =
    earnedIncome + (unearnedIncome > 2000 ? unearnedIncome : 0);
  return round((Math.max(0, repaymentIncome - threshold) * rate) / 100);
}

function paymentDeadline(year: number, monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calculatePaymentOnAccount(
  input: TaxCalculatorInput,
  config: TaxYearConfig,
  amountDue: number,
): PaymentOnAccount {
  const sourceDeductedPercent =
    input.prior_year_tax_bill > 0
      ? (input.prior_year_tax_deducted / input.prior_year_tax_bill) * 100
      : 100;
  const required =
    input.prior_year_tax_bill > config.poa_threshold &&
    sourceDeductedPercent < config.poa_source_deducted_percent;
  const instalment = required
    ? (input.prior_year_tax_bill * config.poa_rate_percent) / 100
    : 0;
  const endYear = new Date(`${config.year_end}T00:00:00`).getFullYear();
  const returnYear = endYear + 1;
  return {
    required,
    firstPayment: round(instalment),
    firstDeadline: paymentDeadline(returnYear, config.poa_first_deadline),
    secondPayment: round(instalment),
    secondDeadline: paymentDeadline(returnYear, config.poa_second_deadline),
    balancingPayment: round(amountDue),
    balancingDeadline: paymentDeadline(returnYear, config.poa_first_deadline),
  };
}

export function calculateFullTaxEstimate(
  businessProfit: number,
  input: TaxCalculatorInput,
  config: TaxYearConfig,
  profile: UserProfile,
  openingTaxPaid = 0,
  adjustments: AdvancedTaxAdjustments = {},
): FullTaxEstimate {
  const homeOffice = Math.min(
    Math.max(0, businessProfit),
    homeOfficeDeduction(input, config),
  );
  const capitalAllowances = Math.max(0, adjustments.capitalAllowances ?? 0);
  const balancingCharges = Math.max(0, adjustments.balancingCharges ?? 0);
  const adjustedBusinessProfit = Math.max(
    0,
    businessProfit - homeOffice - capitalAllowances + balancingCharges,
  );
  const nonSavingsIncome =
    adjustedBusinessProfit + input.employment_income + input.rental_income;
  const totalIncome =
    nonSavingsIncome + input.savings_interest + input.dividend_income;
  const giftAidGross =
    input.gift_aid_donations /
    Math.max(0.01, 1 - config.pension_basic_rate_relief / 100);
  const adjustedNetIncome = Math.max(
    0,
    totalIncome - input.pension_contributions - giftAidGross,
  );
  const blindPersonsAllowance = input.blind_person_allowance_claimed
    ? config.blind_persons_allowance
    : 0;
  const personalAllowanceTaper =
    adjustedNetIncome > config.pa_taper_start
      ? (adjustedNetIncome - config.pa_taper_start) * config.pa_taper_rate
      : 0;
  const adjustedPersonalAllowance = Math.max(
    blindPersonsAllowance,
    config.personal_allowance + blindPersonsAllowance - personalAllowanceTaper,
  );

  let allowanceRemaining = adjustedPersonalAllowance;
  const nonSavingsAfterAllowance = Math.max(
    0,
    nonSavingsIncome - allowanceRemaining,
  );
  allowanceRemaining = Math.max(0, allowanceRemaining - nonSavingsIncome);
  const savingsAfterAllowance = Math.max(
    0,
    input.savings_interest - allowanceRemaining,
  );
  allowanceRemaining = Math.max(0, allowanceRemaining - input.savings_interest);
  const dividendsAfterAllowance = Math.max(
    0,
    input.dividend_income - allowanceRemaining,
  );
  const taxableProfit =
    nonSavingsAfterAllowance + savingsAfterAllowance + dividendsAfterAllowance;

  const basicRateExtension = input.pension_contributions + giftAidGross;
  const basicLimit =
    Math.max(0, config.basic_rate_upper - config.personal_allowance) +
    basicRateExtension;
  const additionalLimit = Math.max(
    basicLimit,
    config.higher_rate_upper - adjustedPersonalAllowance + basicRateExtension,
  );
  const standardRates: [number, number, number] = [
    config.basic_rate_percent,
    config.higher_rate_percent,
    config.additional_rate_percent,
  ];
  const nonSavingsTax = taxAcrossBands(
    nonSavingsAfterAllowance,
    0,
    basicLimit,
    additionalLimit,
    standardRates,
  );
  let bandPosition = nonSavingsAfterAllowance;

  const projectedTaxableIncome = taxableProfit;
  const savingsAllowance =
    projectedTaxableIncome <= basicLimit
      ? config.savings_allowance_basic
      : projectedTaxableIncome <= additionalLimit
        ? config.savings_allowance_higher
        : config.savings_allowance_additional;
  const startingRateForSavings = Math.min(
    savingsAfterAllowance,
    Math.max(0, 5000 - nonSavingsAfterAllowance),
  );
  const savingsAfterStartingRate =
    savingsAfterAllowance - startingRateForSavings;
  const savingsExempt = Math.min(savingsAfterStartingRate, savingsAllowance);
  bandPosition += startingRateForSavings + savingsExempt;
  const savingsTax = taxAcrossBands(
    savingsAfterStartingRate - savingsExempt,
    bandPosition,
    basicLimit,
    additionalLimit,
    standardRates,
  );
  bandPosition += savingsAfterStartingRate - savingsExempt;

  const dividendAllowance = Math.min(
    dividendsAfterAllowance,
    config.dividend_allowance,
  );
  bandPosition += dividendAllowance;
  const dividendTax = taxAcrossBands(
    dividendsAfterAllowance - dividendAllowance,
    bandPosition,
    basicLimit,
    additionalLimit,
    [
      config.dividend_basic_rate,
      config.dividend_higher_rate,
      config.dividend_additional_rate,
    ],
  );

  const incomeTaxBeforeMarriage =
    nonSavingsTax.tax + savingsTax.tax + dividendTax.tax;
  const marriageAllowanceReduction = input.marriage_allowance_claimed
    ? Math.min(
        incomeTaxBeforeMarriage,
        (((config.personal_allowance * config.marriage_allowance_percent) /
          100) *
          config.basic_rate_percent) /
          100,
      )
    : 0;
  const incomeTax = round(incomeTaxBeforeMarriage - marriageAllowanceReduction);

  const compulsoryClass2Applies = config.year_start < "2024-04-06";
  const class2Ni =
    compulsoryClass2Applies &&
    adjustedBusinessProfit >= config.class2_small_profits_threshold
      ? round(config.class2_weekly_rate * 52)
      : 0;
  const class4MainProfit = Math.min(
    Math.max(0, adjustedBusinessProfit - config.class4_lower_threshold),
    Math.max(0, config.class4_upper_threshold - config.class4_lower_threshold),
  );
  const class4UpperProfit = Math.max(
    0,
    adjustedBusinessProfit - config.class4_upper_threshold,
  );
  const class4Ni = round(
    (class4MainProfit * config.class4_main_rate_percent) / 100 +
      (class4UpperProfit * config.class4_upper_rate_percent) / 100,
  );
  const studentLoan = studentLoanEstimate(
    adjustedBusinessProfit + input.employment_income,
    input.rental_income + input.savings_interest + input.dividend_income,
    profile,
    config,
  );
  const totalLiability = round(incomeTax + class2Ni + class4Ni + studentLoan);
  const taxDeducted = round(
    input.employment_tax_paid +
      input.other_tax_deducted +
      openingTaxPaid +
      Math.max(0, adjustments.cisDeductionsReceived ?? 0),
  );
  const amountDue = round(totalLiability - taxDeducted);
  const paymentOnAccount = calculatePaymentOnAccount(input, config, amountDue);

  return {
    businessProfit: round(businessProfit),
    homeOfficeDeduction: round(homeOffice),
    capitalAllowances: round(capitalAllowances),
    balancingCharges: round(balancingCharges),
    adjustedBusinessProfit: round(adjustedBusinessProfit),
    totalIncome: round(totalIncome),
    adjustedNetIncome: round(adjustedNetIncome),
    adjustedPersonalAllowance: round(adjustedPersonalAllowance),
    blindPersonsAllowance: round(blindPersonsAllowance),
    personalAllowanceTaper: round(personalAllowanceTaper),
    marriageAllowanceReduction: round(marriageAllowanceReduction),
    basicRateExtension: round(basicRateExtension),
    taxableProfit: round(taxableProfit),
    nonSavingsTax,
    savingsTax,
    dividendTax,
    savingsAllowance: round(savingsAllowance),
    dividendAllowance: round(dividendAllowance),
    incomeTax,
    class2Ni,
    class4Ni,
    studentLoan,
    totalLiability,
    taxDeducted,
    amountDue,
    total: totalLiability,
    monthlySetAside: round(amountDue / 12),
    paymentOnAccount,
  };
}

export function calculateTaxEstimate(
  profit: number,
  config: TaxYearConfig,
): TaxEstimate {
  const profile = { student_loan_plan: "none" } as UserProfile;
  const input = {
    marriage_allowance_claimed: 0,
    blind_person_allowance_claimed: 0,
    employment_income: 0,
    employment_tax_paid: 0,
    rental_income: 0,
    savings_interest: 0,
    dividend_income: 0,
    pension_contributions: 0,
    gift_aid_donations: 0,
    home_office_method: "none",
    home_office_hours_per_month: 0,
    home_office_months: 0,
    home_office_actual_cost: 0,
    prior_year_tax_bill: 0,
    prior_year_tax_deducted: 0,
    other_tax_deducted: 0,
  } as TaxCalculatorInput;
  const estimate = calculateFullTaxEstimate(profit, input, config, profile);
  return {
    adjustedPersonalAllowance: estimate.adjustedPersonalAllowance,
    taxableProfit: estimate.taxableProfit,
    incomeTax: estimate.incomeTax,
    class2Ni: estimate.class2Ni,
    class4Ni: estimate.class4Ni,
    total: estimate.incomeTax + estimate.class2Ni + estimate.class4Ni,
  };
}

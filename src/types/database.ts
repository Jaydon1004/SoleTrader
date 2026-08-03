// Core database types matching the SQLite schema exactly

export interface UserProfile {
  id: number;
  first_name: string;
  last_name: string;
  utr: string;
  ni_number: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  county: string;
  postcode: string;
  phone: string;
  email: string;
  trading_name: string;
  business_description: string;
  accounting_basis: "cash" | "accrual";
  vat_status: "unregistered" | "voluntary" | "compulsory";
  vat_number: string;
  vat_scheme: "standard" | "flat_rate" | "cash_accounting";
  vat_flat_rate_percent: number | null;
  cis_status: "none" | "registered" | "unregistered" | "gross";
  student_loan_plan: "none" | "plan_1" | "plan_2" | "plan_4" | "postgrad";
  onboarding_complete: number;
  created_at: string;
  updated_at: string;
}

export interface TaxYearConfig {
  id: number;
  tax_year: string;
  year_start: string;
  year_end: string;
  personal_allowance: number;
  basic_rate_percent: number;
  basic_rate_upper: number;
  higher_rate_percent: number;
  higher_rate_upper: number;
  additional_rate_percent: number;
  pa_taper_start: number;
  pa_taper_rate: number;
  blind_persons_allowance: number;
  marriage_allowance_percent: number;
  class2_weekly_rate: number;
  class2_small_profits_threshold: number;
  class4_lower_threshold: number;
  class4_upper_threshold: number;
  class4_main_rate_percent: number;
  class4_upper_rate_percent: number;
  vat_registration_threshold: number;
  vat_deregistration_threshold: number;
  vat_standard_rate_percent: number;
  vat_reduced_rate_percent: number;
  vat_payment_deadline_days: number;
  mileage_car_first_tier_rate: number;
  mileage_car_first_tier_limit: number;
  mileage_car_second_tier_rate: number;
  mileage_motorcycle_rate: number;
  mileage_bicycle_rate: number;
  mileage_passenger_rate: number;
  aia_limit: number;
  main_pool_wda_percent: number;
  special_rate_wda_percent: number;
  first_year_allowance_percent: number;
  poa_threshold: number;
  poa_source_deducted_percent: number;
  poa_rate_percent: number;
  poa_first_deadline: string;
  poa_second_deadline: string;
  sa_registration_deadline: string;
  paper_return_deadline: string;
  online_return_deadline: string;
  late_filing_penalty: number;
  late_payment_interest_rate: number;
  boe_base_rate: number;
  student_loan_plan1_threshold: number;
  student_loan_plan1_rate: number;
  student_loan_plan2_threshold: number;
  student_loan_plan2_rate: number;
  student_loan_plan4_threshold: number;
  student_loan_plan4_rate: number;
  student_loan_postgrad_threshold: number;
  student_loan_postgrad_rate: number;
  pension_annual_allowance: number;
  pension_mpaa: number;
  pension_basic_rate_relief: number;
  home_office_25_50_hours: number;
  home_office_51_100_hours: number;
  home_office_101_plus_hours: number;
  trading_allowance: number;
  property_allowance: number;
  savings_allowance_basic: number;
  savings_allowance_higher: number;
  savings_allowance_additional: number;
  dividend_allowance: number;
  dividend_basic_rate: number;
  dividend_higher_rate: number;
  dividend_additional_rate: number;
  cis_standard_rate: number;
  cis_unregistered_rate: number;
  created_at: string;
  updated_at: string;
}

export interface TaxCalculatorInput {
  tax_year: string;
  marriage_allowance_claimed: number;
  blind_person_allowance_claimed: number;
  employment_income: number;
  employment_tax_paid: number;
  rental_income: number;
  savings_interest: number;
  dividend_income: number;
  pension_contributions: number;
  gift_aid_donations: number;
  home_office_method: "none" | "flat_rate" | "actual";
  home_office_hours_per_month: number;
  home_office_months: number;
  home_office_actual_cost: number;
  prior_year_tax_bill: number;
  prior_year_tax_deducted: number;
  other_tax_deducted: number;
  created_at: string;
  updated_at: string;
}

export interface VatSettings {
  id: number;
  quarter_start_month: number;
  mtd_enabled: number;
  reminders_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface CapitalAsset {
  id: number;
  name: string;
  asset_type:
    | "equipment"
    | "plant"
    | "machinery"
    | "vehicle"
    | "integral_feature"
    | "other";
  description: string;
  purchase_date: string;
  purchase_price: number;
  business_percent: number;
  pool_type: "main" | "special";
  claim_method: "aia" | "wda";
  disposal_date: string | null;
  disposal_proceeds: number;
  notes: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CisTransaction {
  id: number;
  direction: "received" | "made";
  date: string;
  party_name: string;
  party_utr: string;
  gross_amount: number;
  materials_amount: number;
  deduction_rate: number;
  deduction_amount: number;
  notes: string;
  tax_year: string;
  invoice_id: number | null;
  invoice_payment_id: number | null;
  source_document_id: number | null;
  bank_transaction_id: number | null;
  invoice_reference: string;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceSettings {
  id: number;
  logo_path: string;
  bank_name: string;
  account_name: string;
  sort_code: string;
  account_number: string;
  payment_terms_days: number;
  number_prefix: string;
  number_next: number;
  footer_text: string;
  default_vat_rate: number | null;
  created_at: string;
  updated_at: string;
}

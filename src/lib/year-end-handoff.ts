import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, query } from "@/lib/database";

export interface YearEndHandoffDetails {
  tax_year: string;
  stock_value: number;
  cash_on_hand: number;
  loans_balance: number;
  hire_purchase_balance: number;
  capital_introduced: number;
  drawings: number;
  private_use_notes: string;
  home_office_notes: string;
  other_year_end_notes: string;
  employment_details: string;
  pension_details: string;
  interest_details: string;
  dividend_details: string;
  benefit_details: string;
  student_loan_details: string;
  payments_on_account_details: string;
  questionnaire_complete: number;
  personal_tax_complete: number;
  approved: number;
  approved_by: string;
  approved_at: string | null;
  declaration: string;
  updated_at?: string;
}

export interface BankYearEndConfirmation {
  tax_year: string;
  bank_account_id: number;
  account_name: string;
  account_type: string;
  statement_start: string;
  statement_end: string;
  closing_balance: number;
  confirmed_complete: number;
  notes: string;
  updated_at: string | null;
}

export interface YearEndHandoffData {
  details: YearEndHandoffDetails;
  bankConfirmations: BankYearEndConfirmation[];
}

export function emptyYearEndHandoff(taxYear: string): YearEndHandoffDetails {
  return {
    tax_year: taxYear,
    stock_value: 0,
    cash_on_hand: 0,
    loans_balance: 0,
    hire_purchase_balance: 0,
    capital_introduced: 0,
    drawings: 0,
    private_use_notes: "",
    home_office_notes: "",
    other_year_end_notes: "",
    employment_details: "",
    pension_details: "",
    interest_details: "",
    dividend_details: "",
    benefit_details: "",
    student_loan_details: "",
    payments_on_account_details: "",
    questionnaire_complete: 0,
    personal_tax_complete: 0,
    approved: 0,
    approved_by: "",
    approved_at: null,
    declaration: "",
  };
}

export async function loadYearEndHandoff(
  taxYear: string,
): Promise<YearEndHandoffData> {
  const [detailsRows, bankConfirmations] = await Promise.all([
    query<YearEndHandoffDetails>(
      "SELECT * FROM year_end_handoff_details WHERE tax_year = ?",
      [taxYear],
    ),
    query<BankYearEndConfirmation>(
      `SELECT ? AS tax_year, a.id AS bank_account_id, a.name AS account_name,
        a.account_type, COALESCE(c.statement_start, '') AS statement_start,
        COALESCE(c.statement_end, '') AS statement_end,
        COALESCE(c.closing_balance, 0) AS closing_balance,
        COALESCE(c.confirmed_complete, 0) AS confirmed_complete,
        COALESCE(c.notes, '') AS notes, c.updated_at
       FROM bank_accounts a LEFT JOIN bank_year_end_confirmations c
         ON c.bank_account_id = a.id AND c.tax_year = ?
       WHERE a.archived = 0 ORDER BY a.name`,
      [taxYear, taxYear],
    ),
  ]);
  return {
    details: detailsRows[0] ?? emptyYearEndHandoff(taxYear),
    bankConfirmations,
  };
}

export async function saveYearEndHandoff(details: YearEndHandoffDetails) {
  await execute(
    `INSERT INTO year_end_handoff_details (
      tax_year, stock_value, cash_on_hand, loans_balance, hire_purchase_balance,
      capital_introduced, drawings, private_use_notes, home_office_notes,
      other_year_end_notes, employment_details, pension_details, interest_details,
      dividend_details, benefit_details, student_loan_details,
      payments_on_account_details, questionnaire_complete, personal_tax_complete,
      approved, approved_by, approved_at, declaration
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tax_year) DO UPDATE SET
      stock_value = excluded.stock_value, cash_on_hand = excluded.cash_on_hand,
      loans_balance = excluded.loans_balance,
      hire_purchase_balance = excluded.hire_purchase_balance,
      capital_introduced = excluded.capital_introduced, drawings = excluded.drawings,
      private_use_notes = excluded.private_use_notes,
      home_office_notes = excluded.home_office_notes,
      other_year_end_notes = excluded.other_year_end_notes,
      employment_details = excluded.employment_details,
      pension_details = excluded.pension_details,
      interest_details = excluded.interest_details,
      dividend_details = excluded.dividend_details,
      benefit_details = excluded.benefit_details,
      student_loan_details = excluded.student_loan_details,
      payments_on_account_details = excluded.payments_on_account_details,
      questionnaire_complete = excluded.questionnaire_complete,
      personal_tax_complete = excluded.personal_tax_complete,
      approved = excluded.approved, approved_by = excluded.approved_by,
      approved_at = excluded.approved_at, declaration = excluded.declaration,
      updated_at = datetime('now')`,
    [
      details.tax_year,
      details.stock_value,
      details.cash_on_hand,
      details.loans_balance,
      details.hire_purchase_balance,
      details.capital_introduced,
      details.drawings,
      details.private_use_notes,
      details.home_office_notes,
      details.other_year_end_notes,
      details.employment_details,
      details.pension_details,
      details.interest_details,
      details.dividend_details,
      details.benefit_details,
      details.student_loan_details,
      details.payments_on_account_details,
      details.questionnaire_complete,
      details.personal_tax_complete,
      details.approved,
      details.approved_by,
      details.approved_at,
      details.declaration,
    ],
  );
}

export async function saveBankYearEndConfirmation(
  confirmation: BankYearEndConfirmation,
) {
  await execute(
    `INSERT INTO bank_year_end_confirmations (
      tax_year, bank_account_id, statement_start, statement_end,
      closing_balance, confirmed_complete, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tax_year, bank_account_id) DO UPDATE SET
      statement_start = excluded.statement_start,
      statement_end = excluded.statement_end,
      closing_balance = excluded.closing_balance,
      confirmed_complete = excluded.confirmed_complete,
      notes = excluded.notes, updated_at = datetime('now')`,
    [
      confirmation.tax_year,
      confirmation.bank_account_id,
      confirmation.statement_start,
      confirmation.statement_end,
      confirmation.closing_balance,
      confirmation.confirmed_complete,
      confirmation.notes,
    ],
  );
}

export function useYearEndHandoff(taxYear: string) {
  return useQuery({
    queryKey: ["year-end-handoff", taxYear],
    queryFn: () => loadYearEndHandoff(taxYear),
    enabled: !!taxYear,
  });
}

export function useSaveYearEndHandoff() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveYearEndHandoff,
    onSuccess: (_, details) =>
      client.invalidateQueries({
        queryKey: ["year-end-handoff", details.tax_year],
      }),
  });
}

export function useSaveBankYearEndConfirmation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: saveBankYearEndConfirmation,
    onSuccess: (_, confirmation) =>
      client.invalidateQueries({
        queryKey: ["year-end-handoff", confirmation.tax_year],
      }),
  });
}

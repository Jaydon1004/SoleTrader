import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, query } from "@/lib/database";
import type { TaxCalculatorInput } from "@/types/database";

export const defaultTaxCalculatorInput = (
  taxYear: string,
): TaxCalculatorInput => ({
  tax_year: taxYear,
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
  home_office_months: 12,
  home_office_actual_cost: 0,
  prior_year_tax_bill: 0,
  prior_year_tax_deducted: 0,
  other_tax_deducted: 0,
  created_at: "",
  updated_at: "",
});

const editableFields: Array<keyof TaxCalculatorInput> = [
  "marriage_allowance_claimed",
  "blind_person_allowance_claimed",
  "employment_income",
  "employment_tax_paid",
  "rental_income",
  "savings_interest",
  "dividend_income",
  "pension_contributions",
  "gift_aid_donations",
  "home_office_method",
  "home_office_hours_per_month",
  "home_office_months",
  "home_office_actual_cost",
  "prior_year_tax_bill",
  "prior_year_tax_deducted",
  "other_tax_deducted",
];

export function useTaxCalculatorInput(taxYear: string) {
  return useQuery({
    queryKey: ["tax-calculator-input", taxYear],
    enabled: !!taxYear,
    queryFn: async () => {
      const rows = await query<TaxCalculatorInput>(
        "SELECT * FROM tax_calculator_inputs WHERE tax_year = ?",
        [taxYear],
      );
      return rows[0] ?? defaultTaxCalculatorInput(taxYear);
    },
  });
}

export function useSaveTaxCalculatorInput() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaxCalculatorInput) => {
      const values = editableFields.map((field) => input[field]);
      const columns = editableFields.join(", ");
      const placeholders = editableFields.map(() => "?").join(", ");
      const updates = editableFields
        .map((field) => `${field} = excluded.${field}`)
        .join(", ");
      await execute(
        `INSERT INTO tax_calculator_inputs (tax_year, ${columns}) VALUES (?, ${placeholders})
         ON CONFLICT(tax_year) DO UPDATE SET ${updates}, updated_at = datetime('now')`,
        [input.tax_year, ...values],
      );
    },
    onSuccess: (_data, input) => {
      queryClient.invalidateQueries({
        queryKey: ["tax-calculator-input", input.tax_year],
      });
      queryClient.invalidateQueries({
        queryKey: ["dashboard", input.tax_year],
      });
    },
  });
}

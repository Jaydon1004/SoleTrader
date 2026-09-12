import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, addWeeks, addYears, format } from "date-fns";
import { invoke } from "@tauri-apps/api/core";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";

export type DirectIncomeType =
  | "sale"
  | "cis_subcontractor"
  | "other_business_income"
  | "grant"
  | "refund"
  | "other";
export type IncomeFrequency =
  "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";
export function calculateCisSettlement(
  amount: number,
  rate: number,
  mode: "after_cis" | "gross",
) {
  if (!Number.isFinite(amount) || amount < 0 || ![20, 30].includes(rate))
    return { cash: 0, gross: 0, deduction: 0 };
  const cash = mode === "after_cis" ? amount : amount * (1 - rate / 100);
  const gross = mode === "after_cis" ? amount / (1 - rate / 100) : amount;
  return { cash, gross, deduction: gross - cash };
}

export interface DirectIncome {
  id: number;
  income_date: string;
  description: string;
  income_type: DirectIncomeType;
  amount: number;
  gross_amount: number;
  cis_rate: number;
  cis_deduction_amount: number;
  cis_party_name: string;
  cis_party_utr: string;
  evidence_document_id: number | null;
  vat_amount: number;
  vat_rate: number | null;
  payment_method: string;
  client_id: number | null;
  client_name: string;
  notes: string;
  is_recurring: number;
  recurring_frequency: IncomeFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: number;
  tax_year: string;
  bank_transaction_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectIncomeInput {
  income_date: string;
  description: string;
  income_type: DirectIncomeType;
  amount: number;
  gross_amount?: number;
  cis_rate?: number;
  cis_deduction_amount?: number;
  cis_party_name?: string;
  cis_party_utr?: string;
  vat_amount: number;
  vat_rate: number | null;
  payment_method: string;
  client_id: number | null;
  notes: string;
  is_recurring: boolean;
  recurring_frequency: IncomeFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: boolean;
}

const select = `SELECT d.*, COALESCE(NULLIF(c.company, ''), c.name, '') AS client_name
  FROM direct_income d LEFT JOIN clients c ON c.id = d.client_id`;

function invalidate(client: ReturnType<typeof useQueryClient>) {
  [
    "direct-income",
    "dashboard",
    "vat",
    "reports",
    "audit-log",
    "global-search",
    "bank-reconciliation",
    "bank-match-options",
  ].forEach((key) => client.invalidateQueries({ queryKey: [key] }));
}

export function useDirectIncome(
  filters: { taxYear?: string; search?: string } = {},
) {
  return useQuery({
    queryKey: ["direct-income", filters],
    queryFn: () => {
      const conditions = ["d.deleted_at IS NULL"];
      const values: unknown[] = [];
      if (filters.taxYear && filters.taxYear !== "all") {
        conditions.push("d.tax_year = ?");
        values.push(filters.taxYear);
      }
      if (filters.search?.trim()) {
        conditions.push(
          "(d.description LIKE ? OR d.notes LIKE ? OR c.name LIKE ? OR c.company LIKE ?)",
        );
        const value = `%${filters.search.trim()}%`;
        values.push(value, value, value, value);
      }
      return query<DirectIncome>(
        `${select} WHERE ${conditions.join(" AND ")} ORDER BY d.income_date DESC, d.id DESC`,
        values,
      );
    },
  });
}

export function useDirectIncomeRecord(id: number | null) {
  return useQuery({
    queryKey: ["direct-income-record", id],
    enabled: id !== null,
    queryFn: async () => {
      const rows = await query<DirectIncome>(
        `${select} WHERE d.id = ? AND d.deleted_at IS NULL`,
        [id],
      );
      return rows[0] ?? null;
    },
  });
}

export function useCreateDirectIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (data: DirectIncomeInput) =>
      invoke<number>("create_direct_income", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          gross_amount: data.gross_amount ?? data.amount,
          cis_rate: data.cis_rate ?? 0,
          cis_deduction_amount: data.cis_deduction_amount ?? 0,
          cis_party_name: data.cis_party_name ?? "",
          cis_party_utr: data.cis_party_utr ?? "",
          ...data,
        },
      }),
    onSuccess: () => invalidate(client),
  });
}

export function useUpdateDirectIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: DirectIncomeInput & { id: number }) =>
      invoke<void>("update_direct_income", {
        input: {
          id,
          workspace_id: getActiveWorkspaceId(),
          gross_amount: data.gross_amount ?? data.amount,
          cis_rate: data.cis_rate ?? 0,
          cis_deduction_amount: data.cis_deduction_amount ?? 0,
          cis_party_name: data.cis_party_name ?? "",
          cis_party_utr: data.cis_party_utr ?? "",
          ...data,
        },
      }),
    onSuccess: () => invalidate(client),
  });
}

export function useDeleteDirectIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE direct_income SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(client),
  });
}

export function useDueRecurringDirectIncome() {
  return useQuery({
    queryKey: ["direct-income-recurring-due"],
    queryFn: () =>
      query<DirectIncome>(
        `${select} WHERE d.deleted_at IS NULL AND d.is_recurring = 1 AND d.recurring_auto_create = 1 AND d.recurring_next_date <= date('now') ORDER BY d.recurring_next_date`,
      ),
  });
}

function nextDate(value: string, frequency: IncomeFrequency) {
  const date = new Date(`${value}T00:00:00`);
  const next =
    frequency === "weekly"
      ? addWeeks(date, 1)
      : frequency === "fortnightly"
        ? addWeeks(date, 2)
        : frequency === "monthly"
          ? addMonths(date, 1)
          : frequency === "quarterly"
            ? addMonths(date, 3)
            : addYears(date, 1);
  return format(next, "yyyy-MM-dd");
}

export function useProcessRecurringDirectIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (rows: DirectIncome[]) => {
      for (const row of rows) {
        if (!row.recurring_frequency || !row.recurring_next_date) continue;
        const date = row.recurring_next_date;
        await execute(
          "INSERT INTO direct_income (income_date, description, income_type, amount, gross_amount, cis_rate, cis_deduction_amount, cis_party_name, cis_party_utr, vat_amount, vat_rate, payment_method, client_id, notes, tax_year, is_recurring, recurring_frequency, recurring_next_date, recurring_auto_create) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, 1)",
          [
            date,
            row.description,
            row.income_type,
            row.amount,
            row.gross_amount,
            row.cis_rate,
            row.cis_deduction_amount,
            row.cis_party_name,
            row.cis_party_utr,
            row.vat_amount,
            row.vat_rate,
            row.payment_method,
            row.client_id,
            row.notes,
            row.tax_year,
            row.recurring_frequency,
            nextDate(date, row.recurring_frequency),
          ],
        );
        await execute(
          "UPDATE direct_income SET recurring_next_date = ? WHERE id = ?",
          [nextDate(date, row.recurring_frequency), row.id],
        );
      }
    },
    onSuccess: () => invalidate(client),
  });
}

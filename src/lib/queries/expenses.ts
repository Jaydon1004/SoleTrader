import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";
import { deleteStoredFile } from "@/lib/receipt-storage";

export type ExpenseFrequency =
  "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export interface ExpenseCategory {
  id: number;
  name: string;
  is_system: number;
  sort_order: number;
  created_at: string;
}

export interface Expense {
  id: number;
  category_id: number;
  category_name: string;
  date: string;
  supplier: string;
  description: string;
  amount: number;
  vat_amount: number;
  vat_ec_acquisition: number;
  vat_capital_asset: number;
  business_percent: number;
  allowable_amount: number;
  receipt_path: string;
  notes: string;
  is_recurring: number;
  recurring_frequency: ExpenseFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: number;
  tax_year: string;
  is_bad_debt: number;
  source_invoice_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoredReceipt {
  path: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface ExpenseInput {
  category_id: number;
  date: string;
  supplier: string;
  description: string;
  amount: number;
  vat_amount: number;
  vat_ec_acquisition: boolean;
  vat_capital_asset: boolean;
  business_percent: number;
  receipt_path: string;
  receipt_file?: StoredReceipt | null;
  notes: string;
  is_recurring: boolean;
  recurring_frequency: ExpenseFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: boolean;
}

interface ExpenseFilters {
  categoryId?: string;
  taxYear?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  deleted?: boolean;
  receiptMissing?: boolean;
}

const expenseSelect = `
  SELECT e.*, c.name AS category_name,
    ROUND((e.amount - CASE
      WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN e.vat_amount
      ELSE 0 END) * e.business_percent / 100, 2) AS allowable_amount
  FROM expenses e
  INNER JOIN expense_categories c ON c.id = e.category_id`;

function invalidateExpenses(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
  queryClient.invalidateQueries({ queryKey: ["expense-suppliers"] });
  queryClient.invalidateQueries({ queryKey: ["expense-recurring-due"] });
  queryClient.invalidateQueries({ queryKey: ["documents"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

const nativeExpenseInput = (data: ExpenseInput) => ({
  workspace_id: getActiveWorkspaceId(),
  ...data,
});

export function useExpenseCategories() {
  return useQuery({
    queryKey: ["expense-categories"],
    queryFn: () =>
      query<ExpenseCategory>(
        "SELECT * FROM expense_categories ORDER BY sort_order, name",
      ),
  });
}

export function useExpenses(filters: ExpenseFilters = {}) {
  return useQuery({
    queryKey: ["expenses", filters],
    queryFn: () => {
      const conditions = [
        filters.deleted ? "e.deleted_at IS NOT NULL" : "e.deleted_at IS NULL",
      ];
      const values: unknown[] = [];
      if (filters.categoryId && filters.categoryId !== "all") {
        conditions.push("e.category_id = ?");
        values.push(Number(filters.categoryId));
      }
      if (filters.taxYear && filters.taxYear !== "all") {
        conditions.push("e.tax_year = ?");
        values.push(filters.taxYear);
      }
      if (filters.dateFrom) {
        conditions.push("e.date >= ?");
        values.push(filters.dateFrom);
      }
      if (filters.dateTo) {
        conditions.push("e.date <= ?");
        values.push(filters.dateTo);
      }
      if (filters.receiptMissing)
        conditions.push(
          "COALESCE(e.receipt_path, '') = '' AND e.is_bad_debt = 0",
        );
      if (filters.search?.trim()) {
        conditions.push(
          "(e.supplier LIKE ? OR e.description LIKE ? OR e.notes LIKE ?)",
        );
        const search = `%${filters.search.trim()}%`;
        values.push(search, search, search);
      }
      return query<Expense>(
        `${expenseSelect} WHERE ${conditions.join(" AND ")} ORDER BY e.date DESC, e.id DESC`,
        values,
      );
    },
  });
}

export function useExpense(id: number | null) {
  return useQuery({
    queryKey: ["expense", id],
    enabled: id !== null,
    queryFn: async () => {
      const rows = await query<Expense>(`${expenseSelect} WHERE e.id = ?`, [
        id,
      ]);
      return rows[0] ?? null;
    },
  });
}

export function useExpenseSuppliers() {
  return useQuery({
    queryKey: ["expense-suppliers"],
    queryFn: async () => {
      const rows = await query<{ supplier: string }>(
        "SELECT supplier FROM expenses WHERE deleted_at IS NULL AND supplier != '' GROUP BY supplier ORDER BY MAX(date) DESC, supplier LIMIT 100",
      );
      return rows.map((row) => row.supplier);
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ExpenseInput) => {
      try {
        return await invoke<number>("create_expense", {
          input: nativeExpenseInput(data),
        });
      } catch (error) {
        if (data.receipt_file)
          await deleteStoredFile(data.receipt_file.path).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useUpdateExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: ExpenseInput & { id: number }) => {
      try {
        await invoke<void>("update_expense", {
          input: { id, ...nativeExpenseInput(data) },
        });
      } catch (error) {
        if (data.receipt_file)
          await deleteStoredFile(data.receipt_file.path).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: (_data, variables) => {
      invalidateExpenses(queryClient);
      queryClient.invalidateQueries({ queryKey: ["expense", variables.id] });
    },
  });
}

export function useDeleteExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const rows = await query<{ is_bad_debt: number }>(
        "SELECT is_bad_debt FROM expenses WHERE id = ?",
        [id],
      );
      if (rows[0]?.is_bad_debt === 1)
        throw new Error(
          "Bad-debt expenses are managed from their source invoice.",
        );
      await execute(
        "UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id],
      );
    },
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useRestoreExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE expenses SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useBulkDeleteExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      invoke<void>("bulk_delete_expenses", {
        input: { workspace_id: getActiveWorkspaceId(), ids },
      }),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useBulkCategoriseExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ids, categoryId }: { ids: number[]; categoryId: number }) =>
      invoke<void>("bulk_categorise_expenses", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          ids,
          category_id: categoryId,
        },
      }),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useExpenseSummary(taxYear: string) {
  return useQuery({
    queryKey: ["expense-summary", taxYear],
    queryFn: async () => {
      const rows = await query<{
        total: number;
        vat: number;
        allowable: number;
        count: number;
      }>(
        `SELECT COALESCE(SUM(e.amount), 0) AS total, COALESCE(SUM(e.vat_amount), 0) AS vat,
          COALESCE(SUM((e.amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered'
            THEN e.vat_amount ELSE 0 END) * e.business_percent / 100), 0) AS allowable,
          COUNT(e.id) AS count
         FROM expenses e WHERE e.deleted_at IS NULL AND e.tax_year = ?`,
        [taxYear],
      );
      return rows[0] ?? { total: 0, vat: 0, allowable: 0, count: 0 };
    },
  });
}

export function useDueRecurringExpenses() {
  return useQuery({
    queryKey: ["expense-recurring-due"],
    queryFn: () =>
      query<Expense>(
        `${expenseSelect} WHERE e.deleted_at IS NULL AND e.is_recurring = 1
       AND e.recurring_next_date <= date('now') ORDER BY e.recurring_next_date`,
      ),
  });
}

export function useProcessRecurringExpenses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (includeReminderOnly: boolean) =>
      invoke<number>("process_recurring_expenses", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          include_reminder_only: includeReminderOnly,
        },
      }),
    onSuccess: () => invalidateExpenses(queryClient),
  });
}

export function useCreateExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const order = await query<{ next_order: number }>(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM expense_categories",
      );
      await execute(
        "INSERT INTO expense_categories (name, is_system, sort_order) VALUES (?, 0, ?)",
        [name.trim(), order[0]?.next_order ?? 1],
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] }),
  });
}

export function useRenameExpenseCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      execute(
        "UPDATE expense_categories SET name = ? WHERE id = ? AND is_system = 0",
        [name.trim(), id],
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["global-search"] });
    },
  });
}

export function useReorderExpenseCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) =>
      invoke<void>("reorder_expense_categories", {
        input: { workspace_id: getActiveWorkspaceId(), ids },
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["expense-categories"] }),
  });
}

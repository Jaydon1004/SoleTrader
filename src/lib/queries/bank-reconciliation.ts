import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { type BankImportRow, type MatchCandidate } from "@/lib/bank-import";
import {
  createExpenseFromBank,
  execute,
  getActiveWorkspaceId,
  query,
  recordInvoicePaymentFromBank,
} from "@/lib/database";

export interface BankTransaction {
  id: number;
  import_date: string;
  transaction_date: string;
  description: string;
  amount_in: number;
  amount_out: number;
  balance: number | null;
  matched_invoice_id: number | null;
  matched_expense_id: number | null;
  matched_payment_id: number | null;
  manual_category_id: number | null;
  status: "unmatched" | "matched" | "ignored";
  source_file: string;
  hash: string;
  import_batch_id: number | null;
  tax_year: string;
  match_confidence: "" | "exact" | "near" | "manual";
  raw_data: string;
  created_at: string;
  updated_at: string;
  invoice_reference: string;
  client_name: string;
  expense_description: string;
  expense_category: string;
}

export interface BankImportBatch {
  id: number;
  source_file: string;
  imported_rows: number;
  duplicate_rows: number;
  date_from: string;
  date_to: string;
  created_at: string;
}

export interface BankReconciliationSettings {
  id: number;
  match_tolerance_days: number;
  amount_tolerance: number;
  updated_at: string;
}

export interface BankFilters {
  taxYear: string;
  status: string;
  search: string;
}

export interface BankMatchOptions {
  payments: MatchCandidate[];
  expenses: MatchCandidate[];
  invoices: Array<{
    id: number;
    label: string;
    balance: number;
    source_type: "issued" | "self_billed";
  }>;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
  queryClient.invalidateQueries({ queryKey: ["bank-match-options"] });
  queryClient.invalidateQueries({ queryKey: ["bank-import-batches"] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

const paymentCandidatesSql = `
  SELECT p.id, p.invoice_id AS recordId, p.payment_date AS date, COALESCE(p.cash_amount, p.amount) AS amount,
    CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END || ' · ' || COALESCE(NULLIF(c.company, ''), c.name) AS label
  FROM invoice_payments p
  INNER JOIN invoices i ON i.id = p.invoice_id
  INNER JOIN clients c ON c.id = i.client_id
  WHERE i.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM bank_transactions b WHERE b.matched_payment_id = p.id AND b.status = 'matched'
  ) ORDER BY p.payment_date DESC`;

const expenseCandidatesSql = `
  SELECT e.id, e.id AS recordId, e.date, e.amount,
    COALESCE(NULLIF(e.supplier, ''), e.description) || ' · ' || ec.name AS label
  FROM expenses e INNER JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.deleted_at IS NULL AND NOT EXISTS (
    SELECT 1 FROM bank_transactions b WHERE b.matched_expense_id = e.id AND b.status = 'matched'
  ) ORDER BY e.date DESC`;

export function useBankTransactions(filters: BankFilters) {
  return useQuery({
    queryKey: ["bank-reconciliation", filters],
    queryFn: () => {
      const conditions = ["1 = 1"];
      const values: unknown[] = [];
      if (filters.taxYear !== "all") {
        conditions.push("b.tax_year = ?");
        values.push(filters.taxYear);
      }
      if (filters.status !== "all") {
        conditions.push("b.status = ?");
        values.push(filters.status);
      }
      if (filters.search.trim()) {
        conditions.push(
          "(b.description LIKE ? OR i.invoice_number LIKE ? OR i.external_reference LIKE ? OR c.name LIKE ? OR e.description LIKE ? OR ec.name LIKE ?)",
        );
        const value = `%${filters.search.trim()}%`;
        values.push(value, value, value, value, value, value);
      }
      return query<BankTransaction>(
        `SELECT b.*, COALESCE(CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END, '') AS invoice_reference, COALESCE(c.name, '') AS client_name,
          COALESCE(e.description, '') AS expense_description, COALESCE(ec.name, '') AS expense_category
         FROM bank_transactions b
         LEFT JOIN invoices i ON i.id = b.matched_invoice_id
         LEFT JOIN clients c ON c.id = i.client_id
         LEFT JOIN expenses e ON e.id = b.matched_expense_id
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         WHERE ${conditions.join(" AND ")} ORDER BY b.transaction_date DESC, b.id DESC`,
        values,
      );
    },
  });
}

export function useBankImportBatches() {
  return useQuery({
    queryKey: ["bank-import-batches"],
    queryFn: () =>
      query<BankImportBatch>(
        "SELECT * FROM bank_import_batches ORDER BY id DESC LIMIT 20",
      ),
  });
}

export function useBankReconciliationSettings() {
  return useQuery({
    queryKey: ["bank-reconciliation-settings"],
    queryFn: async () =>
      (
        await query<BankReconciliationSettings>(
          "SELECT * FROM bank_reconciliation_settings WHERE id = 1",
        )
      )[0],
  });
}

export function useUpdateBankReconciliationSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ days, amount }: { days: number; amount: number }) =>
      execute(
        "UPDATE bank_reconciliation_settings SET match_tolerance_days = ?, amount_tolerance = ?, updated_at = datetime('now') WHERE id = 1",
        [days, amount],
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["bank-reconciliation-settings"],
      }),
  });
}

export function useBankMatchOptions() {
  return useQuery({
    queryKey: ["bank-match-options"],
    queryFn: async (): Promise<BankMatchOptions> => {
      const [payments, expenses, invoices] = await Promise.all([
        query<MatchCandidate>(paymentCandidatesSql),
        query<MatchCandidate>(expenseCandidatesSql),
        query<{
          id: number;
          label: string;
          balance: number;
          source_type: "issued" | "self_billed";
        }>(
          `SELECT i.id, CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END || ' · ' || COALESCE(NULLIF(c.company, ''), c.name) AS label,
           i.source_type,
           MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)) AS balance
           FROM invoices i INNER JOIN clients c ON c.id = i.client_id
           WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.status NOT IN ('draft', 'cancelled', 'paid')
           AND i.total > i.amount_paid + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)
           ORDER BY i.issue_date DESC`,
        ),
      ]);
      return { payments, expenses, invoices };
    },
  });
}

export function useImportBankTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceFile,
      rows,
    }: {
      sourceFile: string;
      rows: BankImportRow[];
    }) =>
      invoke<{ imported: number; duplicates: number; matched: number }>(
        "import_bank_transactions",
        { input: { workspaceId: getActiveWorkspaceId(), sourceFile, rows } },
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCheckBankDuplicates() {
  return useMutation({
    mutationFn: async (hashes: string[]) => {
      const unique = [...new Set(hashes)];
      const duplicates = new Set<string>();
      for (let index = 0; index < unique.length; index += 900) {
        const chunk = unique.slice(index, index + 900);
        if (!chunk.length) continue;
        const rows = await query<{ hash: string }>(
          `SELECT hash FROM bank_transactions WHERE hash IN (${chunk.map(() => "?").join(",")})`,
          chunk,
        );
        rows.forEach((row) => duplicates.add(row.hash));
      }
      return [...duplicates];
    },
  });
}

export function useMatchBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      kind,
      candidate,
    }: {
      transactionId: number;
      kind: "payment" | "expense";
      candidate: MatchCandidate;
    }) =>
      execute(
        `UPDATE bank_transactions SET matched_invoice_id = ?, matched_payment_id = ?, matched_expense_id = ?,
       status = 'matched', match_confidence = 'manual', updated_at = datetime('now') WHERE id = ?`,
        [
          kind === "payment" ? candidate.recordId : null,
          kind === "payment" ? candidate.id : null,
          kind === "expense" ? candidate.recordId : null,
          transactionId,
        ],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUnmatchBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE bank_transactions SET matched_invoice_id = NULL, matched_payment_id = NULL, matched_expense_id = NULL, status = 'unmatched', match_confidence = '', updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useIgnoreBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE bank_transactions SET status = 'ignored', updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCreateExpenseFromBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transaction: bank,
      categoryId,
      supplier,
      description,
      vatAmount,
      businessPercent,
    }: {
      transaction: BankTransaction;
      categoryId: number;
      supplier: string;
      description: string;
      vatAmount: number;
      businessPercent: number;
    }) =>
      createExpenseFromBank({
        bankTransactionId: bank.id,
        categoryId,
        supplier,
        description,
        vatAmount,
        businessPercent,
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useRecordInvoicePaymentFromBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transaction: bank,
      invoiceId,
    }: {
      transaction: BankTransaction;
      invoiceId: number;
    }) =>
      recordInvoicePaymentFromBank({ bankTransactionId: bank.id, invoiceId }),
    onSuccess: () => invalidate(queryClient),
  });
}

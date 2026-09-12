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
  matched_income_id: number | null;
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
  bank_account_id: number;
  classification: string;
  invoice_reference: string;
  client_name: string;
  expense_description: string;
  expense_category: string;
  income_description: string;
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

export interface BankAccount {
  id: number;
  name: string;
  account_type: string;
  account_use: "business" | "mixed" | "personal";
  opening_balance: number;
  archived: number;
}

export interface BankFilters {
  taxYear: string;
  status: string;
  search: string;
  bankAccountId?: string;
}

export interface BankMatchOptions {
  payments: MatchCandidate[];
  expenses: MatchCandidate[];
  income: MatchCandidate[];
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
  queryClient.invalidateQueries({ queryKey: ["direct-income"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

const paymentCandidatesSql = `
  SELECT p.id, p.invoice_id AS recordId, p.payment_date AS date, COALESCE(p.cash_amount, p.amount) AS amount,
    CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END || ' · ' || COALESCE(NULLIF(c.company, ''), c.name) AS label,
    b.id AS linkedBankTransactionId
  FROM invoice_payments p
  INNER JOIN invoices i ON i.id = p.invoice_id
  INNER JOIN clients c ON c.id = i.client_id
  LEFT JOIN bank_transactions b ON b.matched_payment_id = p.id AND b.status = 'matched'
  WHERE i.deleted_at IS NULL ORDER BY p.payment_date DESC`;

const expenseCandidatesSql = `
  SELECT e.id, e.id AS recordId, e.date, e.amount,
    COALESCE(NULLIF(e.supplier, ''), e.description) || ' · ' || ec.name AS label,
    b.id AS linkedBankTransactionId
  FROM expenses e INNER JOIN expense_categories ec ON ec.id = e.category_id
  LEFT JOIN bank_transactions b ON b.matched_expense_id = e.id AND b.status = 'matched'
  WHERE e.deleted_at IS NULL ORDER BY e.date DESC`;

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
      if (filters.bankAccountId && filters.bankAccountId !== "all") {
        conditions.push("b.bank_account_id = ?");
        values.push(Number(filters.bankAccountId));
      }
      if (filters.search.trim()) {
        conditions.push(
          "(b.description LIKE ? OR i.invoice_number LIKE ? OR i.external_reference LIKE ? OR c.name LIKE ? OR e.description LIKE ? OR ec.name LIKE ? OR di.description LIKE ?)",
        );
        const value = `%${filters.search.trim()}%`;
        values.push(value, value, value, value, value, value, value);
      }
      return query<BankTransaction>(
        `SELECT b.*, COALESCE(CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END, '') AS invoice_reference, COALESCE(c.name, '') AS client_name,
          COALESCE(e.description, '') AS expense_description, COALESCE(ec.name, '') AS expense_category,
          COALESCE(di.description, '') AS income_description
         FROM bank_transactions b
         LEFT JOIN invoices i ON i.id = b.matched_invoice_id
         LEFT JOIN clients c ON c.id = i.client_id
         LEFT JOIN expenses e ON e.id = b.matched_expense_id
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
               LEFT JOIN direct_income di ON di.id = b.matched_income_id
         WHERE ${conditions.join(" AND ")} ORDER BY b.transaction_date DESC, b.id DESC`,
        values,
      );
    },
  });
}

export function useBankAccounts() {
  return useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () =>
      query<BankAccount>(
        "SELECT * FROM bank_accounts WHERE archived = 0 ORDER BY name",
      ),
  });
}

export function useCreateBankAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      name,
      accountType,
      accountUse,
      openingBalance,
    }: {
      name: string;
      accountType: string;
      accountUse: BankAccount["account_use"];
      openingBalance: number;
    }) =>
      execute(
        "INSERT INTO bank_accounts (name, account_type, account_use, opening_balance) VALUES (?, ?, ?, ?)",
        [name.trim(), accountType, accountUse, openingBalance],
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["bank-accounts"] });
      client.invalidateQueries({ queryKey: ["bank-reconciliation"] });
    },
  });
}

export function useUpdateBankAccountUse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      accountUse,
    }: {
      id: number;
      accountUse: BankAccount["account_use"];
    }) =>
      execute(
        "UPDATE bank_accounts SET account_use = ?, updated_at = datetime('now') WHERE id = ?",
        [accountUse, id],
      ),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["bank-accounts"] });
      client.invalidateQueries({ queryKey: ["bank-reconciliation"] });
    },
  });
}

export function useLinkBankTransfer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      firstTransactionId,
      secondTransactionId,
    }: {
      firstTransactionId: number;
      secondTransactionId: number;
    }) =>
      invoke("link_bank_transfer", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          first_transaction_id: firstTransactionId,
          second_transaction_id: secondTransactionId,
        },
      }),
    onSuccess: () => invalidate(client),
  });
}

export function useSplitBankTransaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      transactionId: number;
      firstDescription: string;
      firstAmount: number;
      firstClassification: string;
      secondDescription: string;
      secondAmount: number;
      secondClassification: string;
    }) =>
      invoke("split_bank_transaction", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          bank_transaction_id: input.transactionId,
          first_description: input.firstDescription,
          first_amount: input.firstAmount,
          first_classification: input.firstClassification,
          second_description: input.secondDescription,
          second_amount: input.secondAmount,
          second_classification: input.secondClassification,
        },
      }),
    onSuccess: () => invalidate(client),
  });
}

export function useClassifyBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionId,
      classification,
    }: {
      transactionId: number;
      classification: string;
    }) =>
      invoke("classify_bank_transaction", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          bank_transaction_id: transactionId,
          classification,
        },
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useBulkClassifyBankTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transactionIds,
      classification,
    }: {
      transactionIds: number[];
      classification: string;
    }) =>
      invoke<number>("bulk_classify_bank_transactions", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          bank_transaction_ids: transactionIds,
          classification,
        },
      }),
    onSuccess: () => invalidate(queryClient),
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
      const [payments, expenses, income, invoices] = await Promise.all([
        query<MatchCandidate>(paymentCandidatesSql),
        query<MatchCandidate>(expenseCandidatesSql),
        query<MatchCandidate>(
          `SELECT d.id, d.id AS recordId, d.income_date AS date, d.amount,
             d.description || CASE WHEN COALESCE(NULLIF(c.company, ''), c.name, '') = '' THEN '' ELSE ' · ' || COALESCE(NULLIF(c.company, ''), c.name) END AS label,
             COALESCE(b.id, d.bank_transaction_id) AS linkedBankTransactionId
           FROM direct_income d LEFT JOIN clients c ON c.id = d.client_id
           LEFT JOIN bank_transactions b ON b.matched_income_id = d.id AND b.status = 'matched'
           WHERE d.deleted_at IS NULL ORDER BY d.income_date DESC`,
        ),
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
      return { payments, expenses, income, invoices };
    },
  });
}

export function useImportBankTransactions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sourceFile,
      bankAccountId,
      rows,
    }: {
      sourceFile: string;
      bankAccountId: number;
      rows: BankImportRow[];
    }) =>
      invoke<{ imported: number; duplicates: number; matched: number }>(
        "import_bank_transactions",
        {
          input: {
            workspaceId: getActiveWorkspaceId(),
            sourceFile,
            bankAccountId,
            rows,
          },
        },
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCheckBankDuplicates() {
  return useMutation({
    mutationFn: async ({
      hashes,
      bankAccountId,
    }: {
      hashes: string[];
      bankAccountId: number;
    }) => {
      const unique = [...new Set(hashes)];
      const duplicates = new Set<string>();
      for (let index = 0; index < unique.length; index += 900) {
        const chunk = unique.slice(index, index + 900);
        if (!chunk.length) continue;
        const rows = await query<{ hash: string }>(
          `SELECT hash FROM bank_transactions WHERE bank_account_id = ? AND hash IN (${chunk.map(() => "?").join(",")})`,
          [bankAccountId, ...chunk],
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
      kind: "payment" | "expense" | "income";
      candidate: MatchCandidate;
    }) =>
      invoke("link_existing_bank_record", {
        input: {
          workspaceId: getActiveWorkspaceId(),
          bankTransactionId: transactionId,
          recordKind: kind,
          recordId: candidate.id,
        },
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUnmatchBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      invoke("unmatch_bank_transaction", {
        input: {
          workspaceId: getActiveWorkspaceId(),
          bankTransactionId: id,
        },
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useIgnoreBankTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE bank_transactions SET status = 'ignored', classification = 'ignored', match_confidence = 'manual', auto_classified = 0, updated_at = datetime('now') WHERE id = ?",
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

export function useCreateDirectIncomeFromBank() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      transaction,
      description,
      incomeType,
      vatAmount,
      vatRate,
      paymentMethod,
      clientId,
      notes,
      grossAmount,
      cisRate,
      cisDeductionAmount,
      cisPartyName,
      cisPartyUtr,
    }: {
      transaction: BankTransaction;
      description: string;
      incomeType: string;
      vatAmount: number;
      vatRate: number | null;
      paymentMethod: string;
      clientId: number | null;
      notes: string;
      grossAmount: number;
      cisRate: number;
      cisDeductionAmount: number;
      cisPartyName: string;
      cisPartyUtr: string;
    }) =>
      invoke<number>("create_direct_income_from_bank", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          bank_transaction_id: transaction.id,
          description,
          income_type: incomeType,
          vat_amount: vatAmount,
          vat_rate: vatRate,
          payment_method: paymentMethod,
          client_id: clientId,
          notes,
          gross_amount: grossAmount,
          cis_rate: cisRate,
          cis_deduction_amount: cisDeductionAmount,
          cis_party_name: cisPartyName,
          cis_party_utr: cisPartyUtr,
        },
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

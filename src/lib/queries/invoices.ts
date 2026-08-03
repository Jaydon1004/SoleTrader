import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "cancelled";

export type RecurringFrequency =
  "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

export interface Invoice {
  id: number;
  client_id: number;
  client_name: string;
  client_company: string;
  client_email: string;
  client_address_line_1: string;
  client_address_line_2: string;
  client_city: string;
  client_county: string;
  client_postcode: string;
  invoice_number: string;
  display_reference: string;
  source_type: "issued" | "self_billed";
  external_reference: string | null;
  source_document_id: number | null;
  self_billing_agreement_id: number | null;
  self_billing_checks_confirmed: number;
  source_document_name: string;
  agreement_start_date: string;
  agreement_expiry_date: string;
  agreement_document_name: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat_amount: number;
  vat_ec_supply: number;
  total: number;
  amount_paid: number;
  credited_amount: number;
  balance_due: number;
  notes: string;
  internal_notes: string;
  is_recurring: number;
  recurring_frequency: RecurringFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: number;
  is_quote: number;
  converted_from_quote_id: number | null;
  tax_year: string;
  pdf_path: string;
  bad_debt_written_off: number;
  bad_debt_expense_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceLineItem {
  id: number;
  invoice_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  vat_rate: number | null;
  vat_amount: number;
  line_total: number;
  sort_order: number;
}

export interface InvoicePayment {
  id: number;
  invoice_id: number;
  amount: number;
  cash_amount: number;
  cis_deduction_amount: number;
  cis_transaction_id: number | null;
  payment_date: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface CreditNote {
  id: number;
  invoice_id: number;
  credit_number: string;
  amount: number;
  reason: string;
  issue_date: string;
  created_at: string;
}

export interface InvoiceDetail extends Invoice {
  line_items: InvoiceLineItem[];
  payments: InvoicePayment[];
  credit_notes: CreditNote[];
}

export interface InvoiceInput {
  client_id: number;
  issue_date: string;
  due_date: string;
  vat_ec_supply: boolean;
  notes: string;
  internal_notes: string;
  is_quote: boolean;
  is_recurring: boolean;
  recurring_frequency: RecurringFrequency | null;
  recurring_next_date: string | null;
  recurring_auto_create: boolean;
  line_items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_rate: number | null;
  }>;
}

export interface SelfBilledInvoiceInput {
  client_id: number;
  external_reference: string;
  issue_date: string;
  due_date: string;
  notes: string;
  internal_notes: string;
  source_document_id: number;
  self_billing_agreement_id: number | null;
  self_billing_checks_confirmed: boolean;
  line_items: InvoiceInput["line_items"];
}

export interface SelfBilledSettlementInput {
  invoice_id: number;
  payment_date: string;
  cash_amount: number;
  cis_deduction_amount: number;
  cis_gross_amount: number;
  materials_amount: number;
  deduction_rate: number;
  party_utr: string;
  notes: string;
  source_document_id: number | null;
  bank_transaction_id: number | null;
}

interface InvoiceFilters {
  status?: "all" | InvoiceStatus | "quote";
  taxYear?: string;
  search?: string;
  clientId?: number | null;
}

const invoiceSelect = `
  SELECT i.*, c.name AS client_name, c.company AS client_company, c.email AS client_email,
    c.address_line_1 AS client_address_line_1, c.address_line_2 AS client_address_line_2,
    c.city AS client_city, c.county AS client_county, c.postcode AS client_postcode,
    CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS display_reference,
    COALESCE((SELECT file_name FROM documents WHERE id = i.source_document_id AND deleted_at IS NULL), '') AS source_document_name,
    COALESCE((SELECT start_date FROM self_billing_agreements WHERE id = i.self_billing_agreement_id), '') AS agreement_start_date,
    COALESCE((SELECT expiry_date FROM self_billing_agreements WHERE id = i.self_billing_agreement_id), '') AS agreement_expiry_date,
    COALESCE((SELECT d.file_name FROM self_billing_agreements a LEFT JOIN documents d ON d.id = a.document_id AND d.deleted_at IS NULL WHERE a.id = i.self_billing_agreement_id), '') AS agreement_document_name,
    COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.invoice_id = i.id), 0) AS credited_amount,
    MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(cn.amount) FROM credit_notes cn WHERE cn.invoice_id = i.id), 0)) AS balance_due
  FROM invoices i
  INNER JOIN clients c ON c.id = i.client_id`;

const nativeInvoiceInput = (data: InvoiceInput) => ({
  workspace_id: getActiveWorkspaceId(),
  ...data,
});

async function refreshOverdueInvoices() {
  await execute(
    `UPDATE invoices SET status = 'overdue', updated_at = datetime('now')
     WHERE is_quote = 0 AND deleted_at IS NULL AND due_date < date('now')
       AND status IN ('sent', 'viewed', 'partially_paid')
       AND total > amount_paid + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = invoices.id), 0)`,
  );
}

function invalidateInvoices(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["invoice-income-summary"] });
  queryClient.invalidateQueries({ queryKey: ["clients"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useInvoices(filters: InvoiceFilters = {}) {
  return useQuery({
    queryKey: ["invoices", filters],
    queryFn: async () => {
      await refreshOverdueInvoices();
      const conditions = ["i.deleted_at IS NULL"];
      const values: unknown[] = [];
      if (filters.status === "quote") conditions.push("i.is_quote = 1");
      else if (filters.status && filters.status !== "all") {
        conditions.push("i.status = ?", "i.is_quote = 0");
        values.push(filters.status);
      }
      if (filters.status !== "quote") conditions.push("i.is_quote = 0");
      if (filters.taxYear && filters.taxYear !== "all") {
        conditions.push("i.tax_year = ?");
        values.push(filters.taxYear);
      }
      if (filters.clientId) {
        conditions.push("i.client_id = ?");
        values.push(filters.clientId);
      }
      if (filters.search?.trim()) {
        conditions.push(
          "(i.invoice_number LIKE ? OR i.external_reference LIKE ? OR c.name LIKE ? OR c.company LIKE ?)",
        );
        const search = `%${filters.search.trim()}%`;
        values.push(search, search, search, search);
      }
      return query<Invoice>(
        `${invoiceSelect} WHERE ${conditions.join(" AND ")} ORDER BY i.issue_date DESC, i.id DESC`,
        values,
      );
    },
  });
}

export function useInvoiceIncomeSummary(taxYear: string) {
  return useQuery({
    queryKey: ["invoice-income-summary", taxYear],
    queryFn: async () => {
      const rows = await query<{
        invoiced: number;
        paid: number;
        outstanding: number;
        overdue_count: number;
      }>(
        `SELECT
          COALESCE(SUM(i.total - COALESCE(credits.amount, 0)), 0) AS invoiced,
          COALESCE(SUM(i.amount_paid), 0) AS paid,
          COALESCE(SUM(CASE WHEN i.bad_debt_written_off = 1 THEN 0
            ELSE MAX(0, i.total - i.amount_paid - COALESCE(credits.amount, 0)) END), 0) AS outstanding,
          COALESCE(SUM(CASE WHEN i.status = 'overdue' THEN 1 ELSE 0 END), 0) AS overdue_count
         FROM invoices i
         LEFT JOIN (SELECT invoice_id, SUM(amount) AS amount FROM credit_notes GROUP BY invoice_id) credits
           ON credits.invoice_id = i.id
         WHERE i.deleted_at IS NULL AND i.is_quote = 0
           AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1) AND i.tax_year = ?`,
        [taxYear],
      );
      return (
        rows[0] ?? { invoiced: 0, paid: 0, outstanding: 0, overdue_count: 0 }
      );
    },
  });
}

export function useInvoice(id: number | null) {
  return useQuery({
    queryKey: ["invoice", id],
    enabled: id !== null,
    queryFn: async (): Promise<InvoiceDetail | null> => {
      const invoices = await query<Invoice>(`${invoiceSelect} WHERE i.id = ?`, [
        id,
      ]);
      if (!invoices[0]) return null;
      const [lineItems, payments, creditNotes] = await Promise.all([
        query<InvoiceLineItem>(
          "SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY sort_order, id",
          [id],
        ),
        query<InvoicePayment>(
          "SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC, id DESC",
          [id],
        ),
        query<CreditNote>(
          "SELECT * FROM credit_notes WHERE invoice_id = ? ORDER BY issue_date DESC, id DESC",
          [id],
        ),
      ]);
      return {
        ...invoices[0],
        line_items: lineItems,
        payments,
        credit_notes: creditNotes,
      };
    },
  });
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: InvoiceInput) =>
      invoke<number>("create_invoice", { input: nativeInvoiceInput(data) }),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
  });
}

export function useCreateSelfBilledInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SelfBilledInvoiceInput) =>
      invoke<number>("create_self_billed_invoice", {
        input: { workspace_id: getActiveWorkspaceId(), ...data },
      }),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["self-billing-agreements"] });
    },
  });
}

export function useUpdateInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: InvoiceInput & { id: number }) =>
      invoke<void>("update_invoice", {
        input: { id, ...nativeInvoiceInput(data) },
      }),
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.id] });
    },
  });
}

export function useSetInvoiceStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: number;
      status: InvoiceStatus;
    }) => {
      await execute(
        "UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?",
        [status, id],
      );
    },
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice", variables.id] });
    },
  });
}

export function useRecordPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      amount,
      paymentDate,
      paymentMethod,
      notes,
    }: {
      invoiceId: number;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      notes: string;
    }) =>
      invoke<number>("record_invoice_payment", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          invoice_id: invoiceId,
          amount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          notes,
        },
      }),
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
      queryClient.invalidateQueries({ queryKey: ["client-payments"] });
    },
  });
}

export function useRecordSelfBilledSettlement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SelfBilledSettlementInput) =>
      invoke<number>("record_self_billed_settlement", {
        input: { workspace_id: getActiveWorkspaceId(), ...data },
      }),
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoice_id],
      });
      queryClient.invalidateQueries({ queryKey: ["advanced-tax"] });
      queryClient.invalidateQueries({ queryKey: ["bank-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["bank-match-options"] });
    },
  });
}

export function useCreateCreditNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      invoiceId,
      amount,
      reason,
      issueDate,
    }: {
      invoiceId: number;
      amount: number;
      reason: string;
      issueDate: string;
    }) =>
      invoke<number>("create_credit_note", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          invoice_id: invoiceId,
          amount,
          reason,
          issue_date: issueDate,
        },
      }),
    onSuccess: (_data, variables) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
    },
  });
}

export function useConvertQuote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quoteId: number) =>
      invoke<number>("convert_quote", {
        input: { workspace_id: getActiveWorkspaceId(), quote_id: quoteId },
      }),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
  });
}

export function useDueRecurringInvoices() {
  return useQuery({
    queryKey: ["invoices", "recurring-due"],
    queryFn: () =>
      query<Invoice>(
        `${invoiceSelect} WHERE i.deleted_at IS NULL AND i.is_recurring = 1
       AND i.recurring_next_date <= date('now') ORDER BY i.recurring_next_date`,
      ),
  });
}

export function useProcessRecurringInvoices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      invoke<number>("process_recurring_invoices", {
        input: { workspace_id: getActiveWorkspaceId() },
      }),
    onSuccess: () => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice-settings"] });
      queryClient.invalidateQueries({
        queryKey: ["invoices", "recurring-due"],
      });
    },
  });
}

export function useWriteOffBadDebt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      invoke<void>("write_off_bad_debt", {
        input: { workspace_id: getActiveWorkspaceId(), invoice_id: invoiceId },
      }),
    onSuccess: (_data, invoiceId) => {
      invalidateInvoices(queryClient);
      queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
  });
}

export function useArchiveInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      execute(
        "UPDATE invoices SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [invoiceId],
      ),
    onSuccess: () => invalidateInvoices(queryClient),
  });
}

export function useRestoreInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      execute(
        "UPDATE invoices SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?",
        [invoiceId],
      ),
    onSuccess: () => invalidateInvoices(queryClient),
  });
}

export function useSetInvoicePdfPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, path }: { invoiceId: number; path: string }) =>
      execute(
        "UPDATE invoices SET pdf_path = ?, updated_at = datetime('now') WHERE id = ?",
        [path, invoiceId],
      ),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({
        queryKey: ["invoice", variables.invoiceId],
      });
    },
  });
}

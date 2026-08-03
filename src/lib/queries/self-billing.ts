import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, query } from "@/lib/database";
import type { DocumentRecord } from "@/lib/queries/documents";

export interface SelfBillingAgreement {
  id: number;
  client_id: number;
  client_name: string;
  start_date: string;
  expiry_date: string;
  customer_vat_number: string;
  document_id: number | null;
  document_name: string;
  notes: string;
  archived: number;
  created_at: string;
  updated_at: string;
}

export interface SelfBillingAgreementInput {
  client_id: number;
  start_date: string;
  expiry_date: string;
  customer_vat_number: string;
  document_id: number | null;
  notes: string;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["self-billing-agreements"] });
  queryClient.invalidateQueries({ queryKey: ["self-billing-documents"] });
  queryClient.invalidateQueries({ queryKey: ["reminders"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useSelfBillingAgreements(
  clientId?: number,
  includeArchived = false,
) {
  return useQuery({
    queryKey: ["self-billing-agreements", clientId ?? "all", includeArchived],
    queryFn: () =>
      query<SelfBillingAgreement>(
        `SELECT a.*, COALESCE(NULLIF(c.company, ''), c.name) AS client_name,
        COALESCE(d.file_name, '') AS document_name
       FROM self_billing_agreements a
       INNER JOIN clients c ON c.id = a.client_id
       LEFT JOIN documents d ON d.id = a.document_id AND d.deleted_at IS NULL
       WHERE (? IS NULL OR a.client_id = ?) AND (? = 1 OR a.archived = 0)
       ORDER BY a.expiry_date DESC, a.id DESC`,
        [clientId ?? null, clientId ?? null, includeArchived ? 1 : 0],
      ),
  });
}

export function useActiveSelfBillingAgreements(
  clientId: number | null,
  invoiceDate: string,
) {
  return useQuery({
    queryKey: ["self-billing-agreements", "active", clientId, invoiceDate],
    enabled: clientId !== null && Boolean(invoiceDate),
    queryFn: () =>
      query<SelfBillingAgreement>(
        `SELECT a.*, COALESCE(NULLIF(c.company, ''), c.name) AS client_name,
        COALESCE(d.file_name, '') AS document_name
       FROM self_billing_agreements a
       INNER JOIN clients c ON c.id = a.client_id
       LEFT JOIN documents d ON d.id = a.document_id AND d.deleted_at IS NULL
       WHERE a.client_id = ? AND a.archived = 0 AND a.start_date <= ? AND a.expiry_date >= ?
       ORDER BY a.expiry_date DESC`,
        [clientId, invoiceDate, invoiceDate],
      ),
  });
}

export function useSelfBillingDocuments(
  clientId: number | null,
  purpose: "invoice" | "agreement",
) {
  return useQuery({
    queryKey: ["self-billing-documents", clientId, purpose],
    enabled: clientId !== null,
    queryFn: () =>
      query<DocumentRecord>(
        `SELECT d.*, COALESCE(c.name, '') AS client_name,
        COALESCE(e.description, '') AS expense_description,
        COALESCE(ec.name, '') AS expense_category_name
       FROM documents d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN expenses e ON e.id = d.linked_expense_id
       LEFT JOIN expense_categories ec ON ec.id = e.category_id
       WHERE d.deleted_at IS NULL AND (d.client_id IS NULL OR d.client_id = ?)
         AND ${purpose === "invoice" ? "d.linked_invoice_id IS NULL" : "d.category = 'contract'"}
       ORDER BY COALESCE(NULLIF(d.document_date, ''), d.created_at) DESC, d.id DESC`,
        [clientId],
      ),
  });
}

export function useCreateSelfBillingAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SelfBillingAgreementInput) =>
      execute(
        `INSERT INTO self_billing_agreements
       (client_id, start_date, expiry_date, customer_vat_number, document_id, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          input.client_id,
          input.start_date,
          input.expiry_date,
          input.customer_vat_number.trim(),
          input.document_id,
          input.notes.trim(),
        ],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateSelfBillingAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: SelfBillingAgreementInput & { id: number }) =>
      execute(
        `UPDATE self_billing_agreements SET client_id = ?, start_date = ?, expiry_date = ?,
       customer_vat_number = ?, document_id = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [
          input.client_id,
          input.start_date,
          input.expiry_date,
          input.customer_vat_number.trim(),
          input.document_id,
          input.notes.trim(),
          id,
        ],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useArchiveSelfBillingAgreement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE self_billing_agreements SET archived = 1, updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function agreementStatus(
  agreement: Pick<
    SelfBillingAgreement,
    "start_date" | "expiry_date" | "archived"
  >,
  today = new Date().toISOString().slice(0, 10),
) {
  if (agreement.archived) return "archived";
  if (agreement.start_date > today) return "upcoming";
  if (agreement.expiry_date < today) return "expired";
  return "active";
}

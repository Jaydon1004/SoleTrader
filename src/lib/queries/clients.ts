import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { query, execute } from "@/lib/database";

export interface Client {
  id: number;
  name: string;
  company: string;
  email: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  county: string;
  postcode: string;
  notes: string;
  archived: number;
  created_at: string;
  updated_at: string;
  // Aggregates (joined)
  total_invoiced?: number;
  total_paid?: number;
  outstanding?: number;
  invoice_count?: number;
}

export type ClientInput = Omit<
  Client,
  | "id"
  | "archived"
  | "created_at"
  | "updated_at"
  | "total_invoiced"
  | "total_paid"
  | "outstanding"
  | "invoice_count"
>;

export interface ClientPayment {
  id: number;
  invoice_id: number;
  invoice_reference: string;
  amount: number;
  cash_amount: number;
  cis_deduction_amount: number;
  payment_date: string;
  payment_method: string;
  notes: string;
}

export interface ClientDirectIncome {
  id: number;
  description: string;
  income_date: string;
  gross_amount: number;
  amount: number;
  cis_deduction_amount: number;
  payment_method: string;
}

export interface ClientInvoiceSummary {
  id: number;
  reference: string;
  issue_date: string;
  due_date: string;
  status: string;
  total: number;
  balance_due: number;
}

export interface ClientDocumentSummary {
  id: number;
  file_name: string;
  category: string;
  document_date: string;
  created_at: string;
}

export interface ClientActivitySummary {
  id: number;
  entity_type: string;
  action: string;
  created_at: string;
}

export function useClients(includeArchived = false) {
  return useQuery({
    queryKey: ["clients", includeArchived],
    queryFn: () =>
      query<Client>(
        `SELECT c.*,
          COALESCE(SUM(i.total), 0) AS total_invoiced,
          COALESCE(SUM(i.amount_paid), 0) AS total_paid,
          COALESCE(SUM(CASE WHEN i.bad_debt_written_off = 1 THEN 0
            ELSE MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)) END), 0) AS outstanding,
          COUNT(i.id) AS invoice_count
         FROM clients c
         LEFT JOIN invoices i ON i.client_id = c.id AND i.deleted_at IS NULL
           AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1)
         WHERE ${includeArchived ? "1 = 1" : "c.archived = 0"}
         GROUP BY c.id
         ORDER BY c.name ASC`,
      ),
  });
}

export function useClient(id: number | null) {
  return useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      if (!id) return null;
      const rows = await query<Client>(
        `SELECT c.*,
          COALESCE(SUM(i.total), 0) AS total_invoiced,
          COALESCE(SUM(i.amount_paid), 0) AS total_paid,
          COALESCE(SUM(CASE WHEN i.bad_debt_written_off = 1 THEN 0
            ELSE MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)) END), 0) AS outstanding,
          COUNT(i.id) AS invoice_count
         FROM clients c
         LEFT JOIN invoices i ON i.client_id = c.id AND i.deleted_at IS NULL
           AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1)
         WHERE c.id = ?
         GROUP BY c.id`,
        [id],
      );
      return rows[0] ?? null;
    },
    enabled: !!id,
  });
}

export function useClientPayments(clientId: number | null) {
  return useQuery({
    queryKey: ["client-payments", clientId],
    queryFn: () =>
      query<ClientPayment>(
        `SELECT p.id, p.invoice_id,
          CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS invoice_reference,
          p.amount, COALESCE(p.cash_amount, p.amount) AS cash_amount, p.cis_deduction_amount, p.payment_date,
          p.payment_method, p.notes
         FROM invoice_payments p
         INNER JOIN invoices i ON i.id = p.invoice_id
         WHERE i.client_id = ? AND i.deleted_at IS NULL
         ORDER BY p.payment_date DESC, p.id DESC`,
        [clientId],
      ),
    enabled: clientId !== null,
  });
}

export function useClientWorkspace(clientId: number | null) {
  return useQuery({
    queryKey: ["client-workspace", clientId],
    enabled: clientId !== null,
    queryFn: async () => {
      const [invoices, directIncome, documents, activity] = await Promise.all([
        query<ClientInvoiceSummary>(
          `SELECT i.id,
            CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS reference,
            i.issue_date, i.due_date, i.status, i.total,
            MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)) AS balance_due
           FROM invoices i WHERE i.client_id = ? AND i.deleted_at IS NULL
           ORDER BY i.issue_date DESC, i.id DESC`,
          [clientId],
        ),
        query<ClientDirectIncome>(
          `SELECT id, description, income_date, gross_amount, amount, cis_deduction_amount, payment_method
           FROM direct_income WHERE client_id = ? AND deleted_at IS NULL ORDER BY income_date DESC, id DESC`,
          [clientId],
        ),
        query<ClientDocumentSummary>(
          `SELECT d.id, d.file_name, d.category, d.document_date, d.created_at
           FROM documents d WHERE d.deleted_at IS NULL
             AND (d.client_id = ? OR d.linked_invoice_id IN (SELECT id FROM invoices WHERE client_id = ?))
           ORDER BY COALESCE(NULLIF(d.document_date, ''), d.created_at) DESC, d.id DESC`,
          [clientId, clientId],
        ),
        query<ClientActivitySummary>(
          `SELECT a.id, a.entity_type, a.action, a.created_at
           FROM audit_log a
           WHERE (a.entity_type = 'client' AND a.entity_id = ?)
              OR (a.entity_type = 'invoice' AND a.entity_id IN (SELECT id FROM invoices WHERE client_id = ?))
           ORDER BY a.created_at DESC, a.id DESC LIMIT 100`,
          [clientId, clientId],
        ),
      ]);
      return { invoices, directIncome, documents, activity };
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: ClientInput) => {
      const result = await execute(
        `INSERT INTO clients (name, company, email, phone, address_line_1, address_line_2, city, county, postcode, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          data.company,
          data.email,
          data.phone,
          data.address_line_1,
          data.address_line_2,
          data.city,
          data.county,
          data.postcode,
          data.notes,
        ],
      );
      return result;
    },
    onSuccess: () => invalidateClientLinks(qc),
  });
}

function invalidateClientLinks(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["clients"] });
  qc.invalidateQueries({ queryKey: ["invoices"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["reports"] });
  qc.invalidateQueries({ queryKey: ["audit-log"] });
  qc.invalidateQueries({ queryKey: ["global-search"] });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: ClientInput & { id: number }) => {
      await execute(
        `UPDATE clients SET name=?, company=?, email=?, phone=?, address_line_1=?,
         address_line_2=?, city=?, county=?, postcode=?, notes=?, updated_at=datetime('now')
         WHERE id=?`,
        [
          data.name,
          data.company,
          data.email,
          data.phone,
          data.address_line_1,
          data.address_line_2,
          data.city,
          data.county,
          data.postcode,
          data.notes,
          id,
        ],
      );
    },
    onSuccess: (_d, vars) => {
      invalidateClientLinks(qc);
      qc.invalidateQueries({ queryKey: ["client", vars.id] });
    },
  });
}

export function useArchiveClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, archived }: { id: number; archived: boolean }) => {
      await execute(
        "UPDATE clients SET archived=?, updated_at=datetime('now') WHERE id=?",
        [archived ? 1 : 0, id],
      );
    },
    onSuccess: () => invalidateClientLinks(qc),
  });
}

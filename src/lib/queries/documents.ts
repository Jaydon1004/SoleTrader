import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExpenseFromDocument,
  execute,
  linkDocumentExpense,
  query,
} from "@/lib/database";
import type { StoredReceipt } from "@/lib/queries/expenses";
import {
  findReceiptDuplicates,
  rankReceiptBankMatches,
  type RankedBankCandidate,
  type ReceiptDuplicateCandidate,
  type ReceiptFingerprint,
} from "@/lib/receipt-intelligence";

export type DocumentCategory =
  | "receipt"
  | "invoice_sent"
  | "invoice_received"
  | "contract"
  | "insurance"
  | "other";
export type OcrStatus =
  "not_started" | "processing" | "review" | "complete" | "failed";

export interface DocumentRecord {
  id: number;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  category: DocumentCategory;
  linked_expense_id: number | null;
  linked_invoice_id: number | null;
  linked_vehicle_cost_id: number | null;
  client_id: number | null;
  tax_year: string;
  notes: string;
  ocr_text: string;
  document_date: string;
  ocr_status: OcrStatus;
  ocr_supplier: string;
  ocr_date: string;
  ocr_total: number;
  ocr_vat: number;
  ocr_category_id: number | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  client_name: string;
  expense_description: string;
  expense_category_name: string;
}

export interface DocumentFilters {
  search?: string;
  category?: string;
  taxYear?: string;
  clientId?: string;
  fileKind?: string;
}

export interface DocumentMetadata {
  category: DocumentCategory;
  clientId: number | null;
  taxYear: string;
  documentDate: string;
  notes: string;
}

export interface ReceiptInsights {
  duplicates: ReceiptDuplicateCandidate[];
  bankMatches: RankedBankCandidate[];
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["documents"] });
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useDocuments(filters: DocumentFilters) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: () => {
      const conditions = ["d.deleted_at IS NULL"];
      const values: unknown[] = [];
      if (filters.category && filters.category !== "all") {
        conditions.push("d.category = ?");
        values.push(filters.category);
      }
      if (filters.taxYear && filters.taxYear !== "all") {
        conditions.push("d.tax_year = ?");
        values.push(filters.taxYear);
      }
      if (filters.clientId && filters.clientId !== "all") {
        conditions.push("d.client_id = ?");
        values.push(Number(filters.clientId));
      }
      if (filters.fileKind === "image")
        conditions.push("d.file_type LIKE 'image/%'");
      if (filters.fileKind === "pdf")
        conditions.push("d.file_type = 'application/pdf'");
      if (filters.fileKind === "other")
        conditions.push(
          "d.file_type NOT LIKE 'image/%' AND d.file_type != 'application/pdf'",
        );
      if (filters.search?.trim()) {
        conditions.push(
          "(d.file_name LIKE ? OR d.notes LIKE ? OR d.ocr_text LIKE ? OR d.ocr_supplier LIKE ? OR c.name LIKE ? OR e.description LIKE ?)",
        );
        const search = `%${filters.search.trim()}%`;
        values.push(search, search, search, search, search, search);
      }
      return query<DocumentRecord>(
        `SELECT d.*, COALESCE(c.name, '') AS client_name,
          COALESCE(e.description, '') AS expense_description,
          COALESCE(ec.name, '') AS expense_category_name
         FROM documents d
         LEFT JOIN clients c ON c.id = d.client_id
         LEFT JOIN expenses e ON e.id = d.linked_expense_id
         LEFT JOIN expense_categories ec ON ec.id = e.category_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY COALESCE(NULLIF(d.document_date, ''), d.created_at) DESC, d.id DESC`,
        values,
      );
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      metadata,
    }: {
      file: StoredReceipt;
      metadata: DocumentMetadata;
    }) =>
      execute(
        `INSERT INTO documents (file_name, file_path, file_type, file_size, category, client_id,
       tax_year, document_date, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          file.fileName,
          file.path,
          file.fileType,
          file.fileSize,
          metadata.category,
          metadata.clientId,
          metadata.taxYear,
          metadata.documentDate,
          metadata.notes,
        ],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...metadata }: DocumentMetadata & { id: number }) =>
      execute(
        `UPDATE documents SET category = ?, client_id = ?, tax_year = ?, document_date = ?, notes = ?,
       updated_at = datetime('now') WHERE id = ?`,
        [
          metadata.category,
          metadata.clientId,
          metadata.taxYear,
          metadata.documentDate,
          metadata.notes,
          id,
        ],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateDocumentOcr() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      text = "",
      supplier = "",
      date = "",
      total = 0,
      vat = 0,
      categoryId = null,
    }: {
      id: number;
      status: OcrStatus;
      text?: string;
      supplier?: string;
      date?: string;
      total?: number;
      vat?: number;
      categoryId?: number | null;
    }) =>
      execute(
        `UPDATE documents SET ocr_status = ?, ocr_text = ?, ocr_supplier = ?, ocr_date = ?,
       ocr_total = ?, ocr_vat = ?, ocr_category_id = ?, updated_at = datetime('now') WHERE id = ?`,
        [status, text, supplier, date, total, vat, categoryId, id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE documents SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useRestoreDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE documents SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useLinkDocumentExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      document,
      expenseId,
    }: {
      document: DocumentRecord;
      expenseId: number;
    }) => linkDocumentExpense({ documentId: document.id, expenseId }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCreateExpenseFromDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      document,
      categoryId,
      supplier,
      date,
      amount,
      vat,
      bankTransactionId,
    }: {
      document: DocumentRecord;
      categoryId: number;
      supplier: string;
      date: string;
      amount: number;
      vat: number;
      bankTransactionId?: number;
    }) =>
      createExpenseFromDocument({
        documentId: document.id,
        categoryId,
        supplier,
        date,
        amount,
        vatAmount: vat,
        bankTransactionId,
      }),
    onSuccess: () => invalidate(queryClient),
  });
}

export async function findReceiptInsights(
  documentId: number,
  receipt: ReceiptFingerprint,
): Promise<ReceiptInsights> {
  if (!receipt.date || receipt.total <= 0)
    return { duplicates: [], bankMatches: [] };
  const [documents, bankTransactions] = await Promise.all([
    query<{
      id: number;
      fileName: string;
      supplier: string;
      date: string;
      total: number;
    }>(
      `SELECT id, file_name AS fileName, ocr_supplier AS supplier,
        COALESCE(NULLIF(ocr_date, ''), substr(document_date, 1, 10)) AS date,
        ocr_total AS total
       FROM documents
       WHERE id != ? AND deleted_at IS NULL AND ocr_total > 0`,
      [documentId],
    ),
    query<{
      id: number;
      date: string;
      description: string;
      amount: number;
    }>(
      `SELECT id, transaction_date AS date, description, amount_out AS amount
       FROM bank_transactions
       WHERE status = 'unmatched' AND amount_out > 0
         AND transaction_date BETWEEN date(?, '-7 days') AND date(?, '+7 days')`,
      [receipt.date, receipt.date],
    ),
  ]);
  return {
    duplicates: findReceiptDuplicates(receipt, documents),
    bankMatches: rankReceiptBankMatches(receipt, bankTransactions),
  };
}

export async function findPriorSupplierCategory(supplier: string) {
  if (!supplier.trim()) return undefined;
  const rows = await query<{ category_id: number }>(
    "SELECT category_id FROM expenses WHERE deleted_at IS NULL AND lower(supplier) = lower(?) ORDER BY date DESC, id DESC LIMIT 1",
    [supplier.trim()],
  );
  return rows[0]?.category_id;
}

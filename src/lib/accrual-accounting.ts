import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { execute, query } from "@/lib/database";

export interface SupplierBill {
  id: number;
  category_id: number;
  category_name: string;
  supplier: string;
  reference: string;
  bill_date: string;
  due_date: string;
  gross_amount: number;
  vat_amount: number;
  business_percent: number;
  vat_capital_asset: number;
  notes: string;
  tax_year: string;
  amount_paid: number;
  outstanding_amount: number;
  deleted_at: string | null;
}

export interface SupplierBillPayment {
  id: number;
  bill_id: number;
  payment_date: string;
  amount: number;
  notes: string;
  created_at: string;
}

export interface SupplierBillInput {
  id?: number;
  category_id: number;
  supplier: string;
  reference: string;
  bill_date: string;
  due_date: string;
  gross_amount: number;
  vat_amount: number;
  business_percent: number;
  vat_capital_asset: number;
  notes: string;
  tax_year: string;
}

export interface AccrualAdjustment {
  id: number;
  tax_year: string;
  category_id: number;
  category_name: string;
  adjustment_type: "accrual" | "prepayment";
  description: string;
  amount: number;
  adjustment_date: string;
  reversal_date: string;
  notes: string;
  deleted_at: string | null;
}

export interface AccrualAdjustmentInput {
  id?: number;
  tax_year: string;
  category_id: number;
  adjustment_type: "accrual" | "prepayment";
  description: string;
  amount: number;
  adjustment_date: string;
  reversal_date: string;
  notes: string;
}

export interface AccrualAccountingData {
  bills: SupplierBill[];
  payments: SupplierBillPayment[];
  adjustments: AccrualAdjustment[];
}

export async function loadAccrualAccounting(
  taxYear: string,
): Promise<AccrualAccountingData> {
  const [bills, payments, adjustments] = await Promise.all([
    query<SupplierBill>(
      `SELECT b.*, c.name AS category_name,
        ROUND(COALESCE(SUM(p.amount), 0), 2) AS amount_paid,
        ROUND(MAX(0, b.gross_amount - COALESCE(SUM(p.amount), 0)), 2) AS outstanding_amount
       FROM supplier_bills b INNER JOIN expense_categories c ON c.id = b.category_id
       LEFT JOIN supplier_bill_payments p ON p.bill_id = b.id
       WHERE b.tax_year = ? AND b.deleted_at IS NULL
       GROUP BY b.id ORDER BY b.bill_date DESC, b.id DESC`,
      [taxYear],
    ),
    query<SupplierBillPayment>(
      `SELECT p.* FROM supplier_bill_payments p
       INNER JOIN supplier_bills b ON b.id = p.bill_id
       WHERE b.tax_year = ? AND b.deleted_at IS NULL
       ORDER BY p.payment_date DESC, p.id DESC`,
      [taxYear],
    ),
    query<AccrualAdjustment>(
      `SELECT a.*, c.name AS category_name FROM accrual_adjustments a
       INNER JOIN expense_categories c ON c.id = a.category_id
       WHERE a.tax_year = ? AND a.deleted_at IS NULL
       ORDER BY a.adjustment_date DESC, a.id DESC`,
      [taxYear],
    ),
  ]);
  return { bills, payments, adjustments };
}

export async function saveSupplierBill(input: SupplierBillInput) {
  if (input.id) {
    return execute(
      `UPDATE supplier_bills SET category_id = ?, supplier = ?, reference = ?,
        bill_date = ?, due_date = ?, gross_amount = ?, vat_amount = ?,
        business_percent = ?, vat_capital_asset = ?, notes = ?, tax_year = ?,
        updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL`,
      [
        input.category_id,
        input.supplier.trim(),
        input.reference.trim(),
        input.bill_date,
        input.due_date,
        input.gross_amount,
        input.vat_amount,
        input.business_percent,
        input.vat_capital_asset,
        input.notes.trim(),
        input.tax_year,
        input.id,
      ],
    );
  }
  return execute(
    `INSERT INTO supplier_bills (
      category_id, supplier, reference, bill_date, due_date, gross_amount,
      vat_amount, business_percent, vat_capital_asset, notes, tax_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.category_id,
      input.supplier.trim(),
      input.reference.trim(),
      input.bill_date,
      input.due_date,
      input.gross_amount,
      input.vat_amount,
      input.business_percent,
      input.vat_capital_asset,
      input.notes.trim(),
      input.tax_year,
    ],
  );
}

export function deleteSupplierBill(id: number) {
  return execute(
    "UPDATE supplier_bills SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
}

export function recordSupplierBillPayment(input: {
  billId: number;
  paymentDate: string;
  amount: number;
  notes: string;
}) {
  return execute(
    "INSERT INTO supplier_bill_payments (bill_id, payment_date, amount, notes) VALUES (?, ?, ?, ?)",
    [input.billId, input.paymentDate, input.amount, input.notes.trim()],
  );
}

export function deleteSupplierBillPayment(id: number) {
  return execute("DELETE FROM supplier_bill_payments WHERE id = ?", [id]);
}

export async function saveAccrualAdjustment(input: AccrualAdjustmentInput) {
  if (input.id) {
    return execute(
      `UPDATE accrual_adjustments SET category_id = ?, adjustment_type = ?,
        description = ?, amount = ?, adjustment_date = ?, reversal_date = ?,
        notes = ?, tax_year = ?, updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`,
      [
        input.category_id,
        input.adjustment_type,
        input.description.trim(),
        input.amount,
        input.adjustment_date,
        input.reversal_date,
        input.notes.trim(),
        input.tax_year,
        input.id,
      ],
    );
  }
  return execute(
    `INSERT INTO accrual_adjustments (
      category_id, adjustment_type, description, amount, adjustment_date,
      reversal_date, notes, tax_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.category_id,
      input.adjustment_type,
      input.description.trim(),
      input.amount,
      input.adjustment_date,
      input.reversal_date,
      input.notes.trim(),
      input.tax_year,
    ],
  );
}

export function deleteAccrualAdjustment(id: number) {
  return execute(
    "UPDATE accrual_adjustments SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
}

function invalidateAccruals(client: ReturnType<typeof useQueryClient>) {
  for (const key of [
    "accrual-accounting",
    "dashboard",
    "reports",
    "vat",
    "audit-log",
  ]) {
    client.invalidateQueries({ queryKey: [key] });
  }
}

export function useAccrualAccounting(taxYear: string) {
  return useQuery({
    queryKey: ["accrual-accounting", taxYear],
    queryFn: () => loadAccrualAccounting(taxYear),
    enabled: !!taxYear,
  });
}

function useAccrualMutation<T>(mutationFn: (input: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateAccruals(client),
  });
}

export const useSaveSupplierBill = () => useAccrualMutation(saveSupplierBill);
export const useDeleteSupplierBill = () =>
  useAccrualMutation(deleteSupplierBill);
export const useRecordSupplierBillPayment = () =>
  useAccrualMutation(recordSupplierBillPayment);
export const useDeleteSupplierBillPayment = () =>
  useAccrualMutation(deleteSupplierBillPayment);
export const useSaveAccrualAdjustment = () =>
  useAccrualMutation(saveAccrualAdjustment);
export const useDeleteAccrualAdjustment = () =>
  useAccrualMutation(deleteAccrualAdjustment);

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/database", () => mocks);

import {
  deleteAccrualAdjustment,
  deleteSupplierBill,
  deleteSupplierBillPayment,
  loadAccrualAccounting,
  recordSupplierBillPayment,
  saveAccrualAdjustment,
  saveSupplierBill,
} from "@/lib/accrual-accounting";

describe("accrual accounting data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads bills, payments and adjustments for one tax year", async () => {
    mocks.query
      .mockResolvedValueOnce([{ id: 1, outstanding_amount: 60 }])
      .mockResolvedValueOnce([{ id: 2, bill_id: 1, amount: 40 }])
      .mockResolvedValueOnce([{ id: 3, adjustment_type: "accrual" }]);

    const data = await loadAccrualAccounting("2025/26");

    expect(data.bills[0]).toMatchObject({ outstanding_amount: 60 });
    expect(data.payments).toHaveLength(1);
    expect(data.adjustments).toHaveLength(1);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("creates and updates supplier bills", async () => {
    const input = {
      category_id: 1,
      supplier: "  Supplier Ltd ",
      reference: " BILL-1 ",
      bill_date: "2026-03-01",
      due_date: "2026-03-31",
      gross_amount: 120,
      vat_amount: 20,
      business_percent: 100,
      vat_capital_asset: 0,
      notes: " Test ",
      tax_year: "2025/26",
    };
    await saveSupplierBill(input);
    await saveSupplierBill({ ...input, id: 7 });

    expect(mocks.execute.mock.calls[0][0]).toContain(
      "INSERT INTO supplier_bills",
    );
    expect(mocks.execute.mock.calls[0][1][1]).toBe("Supplier Ltd");
    expect(mocks.execute.mock.calls[1][0]).toContain("UPDATE supplier_bills");
  });

  it("records and removes payments and soft-deletes bills", async () => {
    await recordSupplierBillPayment({
      billId: 1,
      paymentDate: "2026-03-20",
      amount: 50,
      notes: " Part paid ",
    });
    await deleteSupplierBillPayment(2);
    await deleteSupplierBill(1);

    expect(mocks.execute.mock.calls[0][0]).toContain(
      "INSERT INTO supplier_bill_payments",
    );
    expect(mocks.execute.mock.calls[1][0]).toContain(
      "DELETE FROM supplier_bill_payments",
    );
    expect(mocks.execute.mock.calls[2][0]).toContain("UPDATE supplier_bills");
  });

  it("creates, updates and removes reversing adjustments", async () => {
    const input = {
      tax_year: "2025/26",
      category_id: 1,
      adjustment_type: "prepayment" as const,
      description: "Annual insurance",
      amount: 300,
      adjustment_date: "2026-04-05",
      reversal_date: "2026-04-06",
      notes: "Nine months prepaid",
    };
    await saveAccrualAdjustment(input);
    await saveAccrualAdjustment({ ...input, id: 3 });
    await deleteAccrualAdjustment(3);

    expect(mocks.execute.mock.calls[0][0]).toContain(
      "INSERT INTO accrual_adjustments",
    );
    expect(mocks.execute.mock.calls[1][0]).toContain(
      "UPDATE accrual_adjustments",
    );
    expect(mocks.execute.mock.calls[2][0]).toContain(
      "UPDATE accrual_adjustments",
    );
  });
});

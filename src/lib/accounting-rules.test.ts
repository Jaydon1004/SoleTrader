import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  allowableExpenseAmount,
  badDebtExpenseAmount,
  groupTaxableSales,
  recognisedCashCreditAmounts,
  taxableSaleAmount,
} from "@/lib/accounting-rules";

describe("bad-debt accounting", () => {
  it("does not deduct an unpaid invoice on the cash basis", () => {
    expect(badDebtExpenseAmount("cash", 1200)).toBe(0);
  });

  it("deducts the unpaid balance once on the accrual basis", () => {
    expect(badDebtExpenseAmount("accrual", 1200)).toBe(1200);
  });

  it("never creates a negative bad-debt expense", () => {
    expect(badDebtExpenseAmount("accrual", -10)).toBe(0);
  });
});

describe("VAT-aware income tax amounts", () => {
  const standard = {
    vat_status: "voluntary",
    vat_scheme: "standard",
    vat_flat_rate_percent: null,
  } as const;
  const flatRate = {
    vat_status: "compulsory",
    vat_scheme: "flat_rate",
    vat_flat_rate_percent: 12.5,
  } as const;
  const unregistered = {
    vat_status: "unregistered",
    vat_scheme: "standard",
    vat_flat_rate_percent: null,
  } as const;

  it("excludes output VAT from standard-scheme taxable sales", () => {
    expect(taxableSaleAmount(120, 100, standard)).toBe(100);
    expect(taxableSaleAmount(60, 50, standard)).toBe(50);
  });

  it("deducts flat-rate VAT from gross sales", () => {
    expect(taxableSaleAmount(120, 100, flatRate)).toBe(105);
    expect(
      taxableSaleAmount(120, 100, {
        ...flatRate,
        vat_flat_rate_percent: null,
      }),
    ).toBe(120);
    expect(taxableSaleAmount(120, 100, unregistered)).toBe(120);
  });

  it("keeps flat-rate purchase VAT unless it is a capital asset", () => {
    expect(allowableExpenseAmount(120, 20, 100, false, flatRate)).toBe(120);
    expect(allowableExpenseAmount(120, 20, 100, true, flatRate)).toBe(100);
    expect(allowableExpenseAmount(120, 20, 50, false, standard)).toBe(50);
    expect(allowableExpenseAmount(120, 20, 50, false, unregistered)).toBe(60);
  });

  it("groups dated sales and credits without changing their VAT treatment", () => {
    expect(
      groupTaxableSales(
        [
          { name: "Client A", gross: 120, net: 100 },
          { name: "Client A", gross: -60, net: -50 },
          { name: "Client B", gross: 240, net: 200 },
        ],
        standard,
      ),
    ).toEqual([
      { name: "Client B", amount: 200 },
      { name: "Client A", amount: 50 },
    ]);
  });
});

describe("cash-accounting VAT credits", () => {
  it("does not recognise a credit against an unpaid invoice", () => {
    expect(
      recognisedCashCreditAmounts(
        [],
        [{ invoiceId: 1, date: "2026-01-10", amount: 120 }],
      ),
    ).toEqual([0]);
  });

  it("caps a credit at payments received by the credit date", () => {
    expect(
      recognisedCashCreditAmounts(
        [
          { invoiceId: 1, date: "2026-01-01", amount: 50 },
          { invoiceId: 1, date: "2026-01-20", amount: 70 },
        ],
        [{ invoiceId: 1, date: "2026-01-10", amount: 120 }],
      ),
    ).toEqual([50]);
  });

  it("shares recognised payments across credits in chronological order", () => {
    expect(
      recognisedCashCreditAmounts(
        [{ invoiceId: 1, date: "2026-01-01", amount: 100 }],
        [
          { invoiceId: 1, date: "2026-01-20", amount: 80 },
          { invoiceId: 1, date: "2026-01-10", amount: 60 },
        ],
      ),
    ).toEqual([40, 60]);
  });

  it("preserves entry order for credits on the same date", () => {
    expect(
      recognisedCashCreditAmounts(
        [{ invoiceId: 1, date: "2026-01-01", amount: 100 }],
        [
          { invoiceId: 1, date: "2026-01-10", amount: 70 },
          { invoiceId: 1, date: "2026-01-10", amount: 70 },
        ],
      ),
    ).toEqual([70, 30]);
  });

  it("never recognises more than the paid or requested amount", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100_000, max: 1_000_000 }), {
          maxLength: 30,
        }),
        fc.array(fc.integer({ min: -100_000, max: 1_000_000 }), {
          maxLength: 30,
        }),
        (paymentPence, creditPence) => {
          const payments = paymentPence.map((amount, index) => ({
            invoiceId: 1,
            date: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
            amount: amount / 100,
          }));
          const credits = creditPence.map((amount, index) => ({
            invoiceId: 1,
            date: `2026-02-${String((index % 28) + 1).padStart(2, "0")}`,
            amount: amount / 100,
          }));
          const recognised = recognisedCashCreditAmounts(payments, credits);
          const positivePayments = payments.reduce(
            (sum, payment) => sum + Math.max(0, payment.amount),
            0,
          );
          const positiveCredits = credits.reduce(
            (sum, credit) => sum + Math.max(0, credit.amount),
            0,
          );
          const total = recognised.reduce((sum, amount) => sum + amount, 0);

          expect(recognised).toHaveLength(credits.length);
          expect(recognised.every((amount) => amount >= 0)).toBe(true);
          expect(total).toBeLessThanOrEqual(positivePayments + 1e-8);
          expect(total).toBeLessThanOrEqual(positiveCredits + 1e-8);
        },
      ),
      { numRuns: 500 },
    );
  });
});

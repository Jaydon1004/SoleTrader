import { describe, expect, it } from "vitest";
import { extractReceiptFields, suggestCategoryId } from "@/lib/document-ocr";
import {
  findReceiptDuplicates,
  rankReceiptBankMatches,
} from "@/lib/receipt-intelligence";

describe("receipt OCR field extraction", () => {
  it("extracts supplier, UK date, total, and VAT from receipt text", () => {
    const result = extractReceiptFields(`
ACME OFFICE SUPPLIES
Receipt 1042
Date 17/07/2026
Printer paper 20.00
VAT 4.00
Grand Total £24.00
`);
    expect(result).toMatchObject({
      supplier: "ACME OFFICE SUPPLIES",
      date: "2026-07-17",
      total: 24,
      vat: 4,
    });
  });

  it("uses the most recent supplier category before keyword suggestions", () => {
    const categories = [
      { id: 1, name: "Travel" },
      { id: 2, name: "Office costs" },
    ];
    expect(suggestCategoryId("Acme", "train ticket", categories, 2)).toBe(2);
    expect(suggestCategoryId("Rail operator", "train ticket", categories)).toBe(
      1,
    );
  });
});

describe("receipt intelligence", () => {
  it("flags the same supplier, date, and total as a duplicate", () => {
    const duplicates = findReceiptDuplicates(
      { supplier: "Acme Office Supplies", date: "2026-07-17", total: 24 },
      [
        {
          id: 7,
          fileName: "receipt.jpg",
          supplier: "ACME OFFICE SUPPLIES LTD",
          date: "2026-07-17",
          total: 24,
        },
        {
          id: 8,
          fileName: "other.jpg",
          supplier: "Acme Office Supplies",
          date: "2026-07-18",
          total: 24,
        },
      ],
    );
    expect(duplicates.map((candidate) => candidate.id)).toEqual([7]);
  });

  it("ranks matching bank payments by amount, date, and supplier", () => {
    const matches = rankReceiptBankMatches(
      { supplier: "Acme Office Supplies", date: "2026-07-17", total: 24 },
      [
        {
          id: 4,
          date: "2026-07-17",
          description: "CARD ACME OFFICE SUPPLIES",
          amount: 24,
        },
        {
          id: 5,
          date: "2026-07-22",
          description: "CARD PAYMENT",
          amount: 24,
        },
        {
          id: 6,
          date: "2026-07-17",
          description: "UNRELATED",
          amount: 42,
        },
      ],
    );
    expect(matches.map((candidate) => candidate.id)).toEqual([4, 5]);
    expect(matches[0]).toMatchObject({ confidence: "exact" });
  });
});

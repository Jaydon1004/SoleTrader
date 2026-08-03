import { describe, expect, it } from "vitest";
import {
  accountantExportErrorMessage,
  buildAccountantManifest,
  evidenceFileName,
  safePackageName,
} from "@/lib/accountant-package";

describe("accountant package", () => {
  it("preserves useful Tauri string errors", () => {
    expect(accountantExportErrorMessage("database is locked")).toBe(
      "database is locked",
    );
    expect(accountantExportErrorMessage(new Error("disk is full"))).toBe(
      "disk is full",
    );
    expect(accountantExportErrorMessage("  ")).toBe(
      "The accountant handoff could not be created.",
    );
    expect(accountantExportErrorMessage({ reason: "unknown" })).toBe(
      "The accountant handoff could not be created.",
    );
  });

  it("produces a readable manifest that highlights incomplete books", () => {
    const manifest = buildAccountantManifest({
      businessName: "A & B Joinery",
      proprietorName: "Alex Builder",
      taxYear: "2025/26",
      yearStart: "2025-04-06",
      yearEnd: "2026-04-05",
      accountingBasis: "cash",
      vatStatus: "unregistered",
      generatedAt: "6 April 2026, 09:00",
      counts: {
        salesInvoices: 12,
        expenses: 30,
        bankTransactions: 50,
        unmatchedBankTransactions: 2,
        mileageJourneys: 4,
        vehicleCosts: 1,
        capitalAssets: 1,
        vatReturns: 0,
        cisTransactions: 3,
        selfBillingAgreements: 2,
        supportingFiles: 20,
        missingSupportingFiles: 1,
      },
    });

    expect(manifest).toContain("A & B Joinery");
    expect(manifest).toContain(
      "Review required: 2 bank transaction(s) remain unmatched.",
    );
    expect(manifest).toContain(
      "Review required: 1 referenced supporting file(s) could not be copied.",
    );
    expect(manifest).toContain("Self-billing agreements: 2");
  });

  it("creates portable package and evidence names", () => {
    expect(safePackageName("A & B Joinery Ltd.")).toBe("a-b-joinery-ltd");
    expect(evidenceFileName(7, "receipts/April receipt (final).JPG")).toBe(
      "0007-April-receipt-final.JPG",
    );
    expect(evidenceFileName(8, "documents\\invoice.pdf")).toBe(
      "0008-invoice.pdf",
    );
    expect(safePackageName("---")).toBe("sole-trader");
    expect(evidenceFileName(9, "***")).toBe("0009-attachment");
  });

  it("records clean package checks and a missing proprietor", () => {
    const manifest = buildAccountantManifest({
      businessName: "Clean Books",
      proprietorName: "",
      taxYear: "2025/26",
      yearStart: "2025-04-06",
      yearEnd: "2026-04-05",
      accountingBasis: "accrual",
      vatStatus: "voluntary",
      generatedAt: "6 April 2026, 09:00",
      counts: {
        salesInvoices: 0,
        expenses: 0,
        bankTransactions: 0,
        unmatchedBankTransactions: 0,
        mileageJourneys: 0,
        vehicleCosts: 0,
        capitalAssets: 0,
        vatReturns: 0,
        cisTransactions: 0,
        selfBillingAgreements: 0,
        supportingFiles: 0,
        missingSupportingFiles: 0,
      },
    });

    expect(manifest).toContain("Proprietor: Not recorded");
    expect(manifest).toContain("all imported transactions are matched");
    expect(manifest).toContain("every referenced supporting file was copied");
  });
});

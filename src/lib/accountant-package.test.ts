import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mkdir: vi.fn(),
  open: vi.fn(),
  query: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  writeTextFile: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  mkdir: mocks.mkdir,
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
  writeTextFile: mocks.writeTextFile,
}));
vi.mock("@/lib/database", () => ({ query: mocks.query }));
vi.mock("@/lib/receipt-storage", () => ({
  readStoredFile: vi.fn(),
}));
vi.mock("@/lib/report-export", () => ({
  buildReportPdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}));
import {
  accountantExportErrorMessage,
  buildBankReconciliation,
  buildAccountantManifest,
  buildAccrualControlChecks,
  buildDataQualityReport,
  buildLedgerControlChecks,
  buildPackageManifest,
  buildTabularReport,
  buildYearEndControlChecks,
  evidenceFileName,
  exportAccountantPackage,
  safePackageName,
} from "@/lib/accountant-package";
import { emptyYearEndHandoff } from "@/lib/year-end-handoff";

describe("accountant package", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
    expect(manifest).toContain("Accounting basis: Receipts basis (cash basis)");
    expect(manifest).toContain(
      "Review required: 2 bank transaction(s) remain unmatched.",
    );
    expect(manifest).toContain(
      "Review required: 1 referenced supporting file(s) could not be copied.",
    );
    expect(manifest).toContain("Self-billing agreements: 2");
  });

  it("labels HMRC packages as evidence rather than a filed return", () => {
    const manifest = buildAccountantManifest({
      businessName: "A & B Joinery",
      proprietorName: "Alex Builder",
      taxYear: "2025/26",
      yearStart: "2025-04-06",
      yearEnd: "2026-04-05",
      accountingBasis: "cash",
      vatStatus: "unregistered",
      generatedAt: "6 April 2026, 09:00",
      audience: "hmrc",
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

    expect(manifest).toContain("HMRC EVIDENCE HANDOFF");
    expect(manifest).toContain("It has not been filed with HMRC");
    expect(manifest).toContain("HMRC-recognised filing software");
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

  it("splits wide accountant tables into readable PDF sections", () => {
    const report = buildTabularReport("Invoices", "2025/26", [
      { Reference: "INV-1", A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7 },
    ]);

    expect(report.sections).toHaveLength(2);
    expect(report.sections[0].columns).toEqual([
      "Reference",
      "A",
      "B",
      "C",
      "D",
      "E",
    ]);
    expect(report.sections[1].columns).toEqual(["Reference", "F", "G"]);
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

  it("reconciles imported statement movement by bank account", () => {
    const rows = buildBankReconciliation([
      {
        "Account ID": 1,
        Account: "Current account",
        "Money in": 120,
        "Money out": 0,
        Balance: 1120,
        "Reconciliation status": "matched",
      },
      {
        "Account ID": 1,
        Account: "Current account",
        "Money in": 0,
        "Money out": 20,
        Balance: 1100,
        "Reconciliation status": "unmatched",
      },
    ]);

    expect(rows).toEqual([
      {
        "Account ID": 1,
        Account: "Current account",
        "Opening balance": 1000,
        "Money in": 120,
        "Money out": 20,
        "Expected closing balance": 1100,
        "Statement closing balance": 1100,
        Variance: 0,
        Transactions: 2,
        Unmatched: 1,
      },
    ]);
  });

  it("turns reconciliation and evidence gaps into actionable checks", () => {
    const rows = buildDataQualityReport(
      {
        salesInvoices: 1,
        expenses: 2,
        bankTransactions: 2,
        unmatchedBankTransactions: 1,
        mileageJourneys: 0,
        vehicleCosts: 0,
        capitalAssets: 0,
        vatReturns: 0,
        cisTransactions: 0,
        selfBillingAgreements: 0,
        supportingFiles: 1,
        missingSupportingFiles: 1,
      },
      {
        missingReceiptCount: 1,
        outstandingCount: 1,
        outstandingValue: 50,
      } as never,
      [{ Variance: 2.5 } as never],
    );

    expect(rows.filter((row) => row.Status === "Review")).toHaveLength(4);
    expect(rows[rows.length - 1]).toMatchObject({
      Check: "Outstanding customer balances",
      Status: "Information",
    });
  });

  it("builds a machine-readable privacy and control manifest", () => {
    const manifest = buildPackageManifest({
      generatedAt: "2026-08-29T09:00:00.000Z",
      schemaVersion: 26,
      businessName: "A & B Joinery",
      taxYear: "2025/26",
      accountingBasis: "accrual",
      vatStatus: "voluntary",
      vatScheme: "standard",
      counts: {
        salesInvoices: 1,
        expenses: 2,
        bankTransactions: 3,
        unmatchedBankTransactions: 0,
        mileageJourneys: 0,
        vehicleCosts: 0,
        capitalAssets: 0,
        vatReturns: 0,
        cisTransactions: 0,
        selfBillingAgreements: 0,
        supportingFiles: 1,
        missingSupportingFiles: 0,
      },
      reviewItems: 0,
      files: ["z.pdf", "a.pdf"],
    });

    expect(manifest).toMatchObject({
      format: "soletrader-accountant-handoff",
      formatVersion: 2,
      schemaVersion: 26,
      controls: { status: "clear", reviewItems: 0 },
      privacy: { containsPersonalTaxIdentifiers: true },
      files: ["a.pdf", "z.pdf"],
    });
  });

  it("cross-foots detailed ledgers to their control totals", () => {
    const clear = buildLedgerControlChecks({
      invoices: [{ Gross: 120 }],
      lineItems: [{ "Line total": 60 }, { "Line total": 60 }],
      expenses: [{ "Allowable amount": 80 }],
      expenseCategories: [{ "Allowable amount": 80 }],
    });
    const review = buildLedgerControlChecks({
      invoices: [{ Gross: 120 }],
      lineItems: [{ "Line total": 100 }],
      expenses: [],
      expenseCategories: [],
    });

    expect(clear.every((row) => row.Status === "Clear")).toBe(true);
    expect(review[0]).toMatchObject({ Status: "Review" });
    expect(review[0].Result).toContain("£-20.00 variance");
  });

  it("cross-foots supplier payments and validates reversal dates", () => {
    const clear = buildAccrualControlChecks({
      supplierBills: [{ "Paid by year end": 60 }],
      supplierBillPayments: [{ Amount: 60 }],
      accrualAdjustments: [
        { "Adjustment date": "2026-04-05", "Reversal date": "2026-04-06" },
      ],
    });
    const review = buildAccrualControlChecks({
      supplierBills: [{ "Paid by year end": 50 }],
      supplierBillPayments: [{ Amount: 60 }],
      accrualAdjustments: [
        { "Adjustment date": "2026-04-05", "Reversal date": "2026-04-05" },
      ],
    });

    expect(clear.every((row) => row.Status === "Clear")).toBe(true);
    expect(review.every((row) => row.Status === "Review")).toBe(true);
  });

  it("reports year-end completion, bank coverage and approval", () => {
    const details = {
      ...emptyYearEndHandoff("2025/26"),
      questionnaire_complete: 1,
      personal_tax_complete: 1,
      approved: 1,
      approved_by: "Alex Builder",
      approved_at: "2026-04-10T09:00:00.000Z",
    };
    const clear = buildYearEndControlChecks({
      details,
      bankConfirmations: [
        {
          "Statement start": "2025-04-06",
          "Statement end": "2026-04-05",
          "Full year confirmed": 1,
          Variance: 0,
        },
      ],
      yearStart: "2025-04-06",
      yearEnd: "2026-04-05",
    });
    const review = buildYearEndControlChecks({
      details: emptyYearEndHandoff("2025/26"),
      bankConfirmations: [],
      yearStart: "2025-04-06",
      yearEnd: "2026-04-05",
    });

    expect(clear.every((row) => row.Status === "Clear")).toBe(true);
    expect(review.every((row) => row.Status === "Review")).toBe(true);
  });

  it("assembles a controlled accountant handoff", async () => {
    mocks.open.mockResolvedValue("C:\\Exports");
    mocks.query.mockImplementation((sql: string) => {
      if (sql.includes("workspace_schema")) return [{ version: 28 }];
      if (sql.includes("FROM year_end_handoff_details")) {
        return [
          {
            ...emptyYearEndHandoff("2025/26"),
            questionnaire_complete: 1,
            personal_tax_complete: 1,
            approved: 1,
            approved_by: "Alex Builder",
            approved_at: "2026-04-10T09:00:00.000Z",
            declaration: "Approved for handoff",
          },
        ];
      }
      if (
        sql.includes(
          "FROM bank_accounts a LEFT JOIN bank_year_end_confirmations",
        )
      ) {
        return [
          {
            "Account ID": 1,
            Account: "Current account",
            "Statement start": "2025-04-06",
            "Statement end": "2026-04-05",
            "Confirmed closing balance": 1120,
            "Imported closing balance": 1120,
            Variance: 0,
            "Full year confirmed": 1,
          },
        ];
      }
      if (sql.includes("invoice_line_items")) {
        return [{ "Invoice reference": "INV-1", "Line total": 120 }];
      }
      if (sql.includes('i.total AS "Gross"')) {
        return [{ "Invoice reference": "INV-1", Gross: 120 }];
      }
      if (sql.includes('e.id AS "Expense ID"')) {
        return [{ "Expense ID": 1, "Allowable amount": 80 }];
      }
      if (sql.includes('COUNT(*) AS "Transactions"')) {
        return [{ Category: "Tools", "Allowable amount": 80 }];
      }
      if (sql.includes('b.id AS "Bill ID"')) {
        return [
          {
            "Bill ID": 1,
            Supplier: "Timber Ltd",
            Reference: "B-1",
            "Due date": "2026-03-31",
            "Paid by year end": 60,
            "Outstanding at year end": 60,
            "Age at year end": "1-30 days",
          },
        ];
      }
      if (sql.includes('p.id AS "Payment ID"')) {
        return [{ "Payment ID": 1, "Bill ID": 1, Amount: 60 }];
      }
      if (sql.includes('a.id AS "Adjustment ID"')) {
        return [
          {
            "Adjustment ID": 1,
            "Adjustment date": "2026-04-05",
            "Reversal date": "2026-04-06",
          },
        ];
      }
      if (sql.includes("FROM bank_transactions b")) {
        return [
          {
            "Account ID": 1,
            Account: "Current account",
            "Money in": 120,
            "Money out": 0,
            Balance: 1120,
            "Reconciliation status": "matched",
          },
        ];
      }
      return [];
    });

    const result = await exportAccountantPackage("2025/26", {
      config: {
        tax_year: "2025/26",
        year_start: "2025-04-06",
        year_end: "2026-04-05",
      },
      profile: {
        first_name: "Alex",
        last_name: "Builder",
        trading_name: "A & B Joinery",
        business_description: "Joinery",
        utr: "1234567890",
        ni_number: "AB123456C",
        address_line_1: "1 High Street",
        address_line_2: "",
        city: "Leeds",
        county: "",
        postcode: "LS1 1AA",
        email: "alex@example.com",
        phone: "0113 000 0000",
        accounting_basis: "accrual",
        vat_status: "unregistered",
        vat_number: "",
        vat_scheme: "standard",
        cis_status: "none",
      },
      accountingBasis: "accrual",
      income: 120,
      expenses: 80,
      profit: 40,
      tax: { total: 0 },
      missingReceiptCount: 0,
      outstandingCount: 0,
      outstandingValue: 0,
      yearComparison: [
        {
          taxYear: "2025/26",
          income: 120,
          expenses: 80,
          profit: 40,
          tax: 0,
        },
      ],
    } as never);

    expect(result).toMatchObject({
      counts: {
        salesInvoices: 1,
        expenses: 1,
        supplierBills: 1,
        supplierBillPayments: 1,
        accrualAdjustments: 1,
        bankTransactions: 1,
      },
      reviewItems: 0,
      reconciledAccounts: 1,
    });
    const writtenTextPaths = mocks.writeTextFile.mock.calls.map(
      ([path]) => path,
    );
    const writtenBinaryPaths = mocks.writeFile.mock.calls.map(([path]) => path);
    expect(writtenBinaryPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining("data-quality-report.pdf"),
        expect.stringContaining("reconciliation-summary.pdf"),
        expect.stringContaining("prior-year-comparison.pdf"),
        expect.stringContaining("year-end-questionnaire.pdf"),
        expect.stringContaining("personal-tax-checklist.pdf"),
        expect.stringContaining("trial-balance.pdf"),
        expect.stringContaining("general-ledger.pdf"),
        expect.stringContaining("supplier-bills.pdf"),
        expect.stringContaining("supplier-bill-payments.pdf"),
        expect.stringContaining("accrual-adjustments.pdf"),
        expect.stringContaining("creditor-ageing.pdf"),
      ]),
    );
    expect(writtenTextPaths).toEqual(
      expect.arrayContaining([
        expect.stringContaining("package-manifest.json"),
        expect.stringContaining("README.txt"),
      ]),
    );
    expect(
      [...writtenTextPaths, ...writtenBinaryPaths].some((path) =>
        String(path).endsWith(".csv"),
      ),
    ).toBe(false);
    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("accountant-summary.pdf"),
      new Uint8Array([1, 2, 3]),
    );
  });
});

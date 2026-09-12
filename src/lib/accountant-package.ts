import { open } from "@tauri-apps/plugin-dialog";
import {
  mkdir,
  readFile,
  writeFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { query } from "@/lib/database";
import { readStoredFile } from "@/lib/receipt-storage";
import { buildReportPdf, type ReportDocument } from "@/lib/report-export";
import {
  emptyYearEndHandoff,
  type YearEndHandoffDetails,
} from "@/lib/year-end-handoff";
import type { DashboardData } from "@/lib/queries/dashboard";
import type {
  HmrcBusinessCalculation,
  HmrcFilingDetails,
  Sa103Schedule,
} from "@/lib/hmrc-filing";
import type { FullTaxEstimate } from "@/lib/tax-estimate";

export interface AccountantPackageCounts {
  salesInvoices: number;
  expenses: number;
  supplierBills?: number;
  supplierBillPayments?: number;
  accrualAdjustments?: number;
  bankTransactions: number;
  unmatchedBankTransactions: number;
  mileageJourneys: number;
  vehicleCosts: number;
  capitalAssets: number;
  vatReturns: number;
  cisTransactions: number;
  selfBillingAgreements: number;
  supportingFiles: number;
  missingSupportingFiles: number;
}

export interface AccountantPackageManifestInput {
  businessName: string;
  proprietorName: string;
  taxYear: string;
  yearStart: string;
  yearEnd: string;
  accountingBasis: string;
  vatStatus: string;
  generatedAt: string;
  counts: AccountantPackageCounts;
  reviewItems?: number;
  reconciledAccounts?: number;
  audience?: "accountant" | "hmrc";
}

export function safePackageName(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "sole-trader"
  );
}

export function evidenceFileName(index: number, sourcePath: string) {
  const originalName = sourcePath.split(/[\\/]/).pop() || "attachment";
  const extensionIndex = originalName.lastIndexOf(".");
  const extension =
    extensionIndex > 0
      ? originalName.slice(extensionIndex).replace(/[^a-zA-Z0-9.]/g, "")
      : "";
  const stem =
    (extensionIndex > 0 ? originalName.slice(0, extensionIndex) : originalName)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "attachment";
  return `${String(index).padStart(4, "0")}-${stem}${extension}`;
}

export function accountantExportErrorMessage(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  return "The accountant handoff could not be created.";
}

const accountingBasisLabel = (value: string) =>
  value === "cash" ? "Receipts basis (cash basis)" : "Accrual basis";

export function buildAccountantManifest(input: AccountantPackageManifestInput) {
  const { counts } = input;
  const hmrc = input.audience === "hmrc";
  return [
    hmrc ? "SOLETRADER HMRC EVIDENCE HANDOFF" : "SOLETRADER ACCOUNTANT HANDOFF",
    hmrc ? "================================" : "=============================",
    "",
    `Business: ${input.businessName}`,
    `Proprietor: ${input.proprietorName || "Not recorded"}`,
    `Tax year: ${input.taxYear} (${input.yearStart} to ${input.yearEnd})`,
    `Accounting basis: ${accountingBasisLabel(input.accountingBasis)}`,
    `VAT status: ${input.vatStatus}`,
    `Generated: ${input.generatedAt}`,
    "",
    "PACKAGE CONTENTS",
    "----------------",
    "00-summary: business details, handoff notes and package checks",
    "01-sales: invoices, line items, payments, credit notes and clients",
    "02-expenses: paid expenses, supplier bills, creditor ageing and reversing adjustments",
    "03-bank: imported transactions and reconciliation status",
    "04-vehicles: mileage journeys, vehicles and actual vehicle costs",
    "05-tax-and-vat: tax inputs, capital assets, CIS and VAT returns",
    "06-supporting-files: receipt images, documents and archived invoice PDFs",
    "07-ledger: trial balance and journal-level general ledger",
    "Control reports: see 00-summary/data-quality-report.pdf and 03-bank/reconciliation-summary.pdf",
    "",
    "RECORD COUNTS",
    "-------------",
    `Sales invoices: ${counts.salesInvoices}`,
    `Expenses: ${counts.expenses}`,
    `Supplier bills: ${counts.supplierBills ?? 0}`,
    `Supplier bill payments: ${counts.supplierBillPayments ?? 0}`,
    `Accrual and prepayment adjustments: ${counts.accrualAdjustments ?? 0}`,
    `Bank transactions: ${counts.bankTransactions}`,
    `Unmatched bank transactions: ${counts.unmatchedBankTransactions}`,
    `Mileage journeys: ${counts.mileageJourneys}`,
    `Vehicle costs: ${counts.vehicleCosts}`,
    `Capital assets: ${counts.capitalAssets}`,
    `VAT returns: ${counts.vatReturns}`,
    `CIS transactions: ${counts.cisTransactions}`,
    `Self-billing agreements: ${counts.selfBillingAgreements}`,
    `Supporting files copied: ${counts.supportingFiles}`,
    `Missing supporting files: ${counts.missingSupportingFiles}`,
    `Bank accounts summarised: ${input.reconciledAccounts ?? 0}`,
    `Items requiring review: ${input.reviewItems ?? 0}`,
    "",
    "IMPORTANT",
    "---------",
    hmrc
      ? "This is an evidence and preparation package. It has not been filed with HMRC and is not proof that HMRC received or accepted a return. Figures must be reviewed before they are entered into HMRC-recognised filing software or given to an authorised agent."
      : "This package reflects the records held in SoleTrader when it was generated. Tax and VAT calculations remain estimates and should be reviewed by a qualified accountant before filing.",
    ...(hmrc
      ? [
          "Do not send the underlying records with a return unless HMRC asks for them. Retain them for the period required by current HMRC record-keeping rules.",
          "If Making Tax Digital for Income Tax applies, use HMRC-recognised software for digital records, quarterly updates and the final return.",
        ]
      : []),
    counts.unmatchedBankTransactions > 0
      ? `Review required: ${counts.unmatchedBankTransactions} bank transaction(s) remain unmatched.`
      : "Bank check: all imported transactions are matched or intentionally ignored.",
    counts.missingSupportingFiles > 0
      ? `Review required: ${counts.missingSupportingFiles} referenced supporting file(s) could not be copied.`
      : "Evidence check: every referenced supporting file was copied.",
    "",
  ].join("\n");
}

type ExportRow = Record<string, unknown>;

interface EvidenceRow {
  record_type: string;
  record_reference: string;
  original_name: string;
  source_path: string;
}

export interface AccountantPackageResult {
  directory: string;
  counts: AccountantPackageCounts;
  reviewItems: number;
  reconciledAccounts: number;
}

export interface HmrcPackageData {
  filing: HmrcFilingDetails;
  calculation: HmrcBusinessCalculation;
  schedule: Sa103Schedule;
  taxEstimate: FullTaxEstimate;
}

export interface BankReconciliationRow extends ExportRow {
  "Account ID": number;
  Account: string;
  "Opening balance": number;
  "Money in": number;
  "Money out": number;
  "Expected closing balance": number;
  "Statement closing balance": number;
  Variance: number;
  Transactions: number;
  Unmatched: number;
}

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const rounded = (value: number) => Math.round(value * 100) / 100;

export function buildBankReconciliation(
  transactions: ExportRow[],
): BankReconciliationRow[] {
  const accounts = new Map<number, ExportRow[]>();
  for (const transaction of transactions) {
    const accountId = numeric(transaction["Account ID"]);
    accounts.set(accountId, [...(accounts.get(accountId) ?? []), transaction]);
  }
  return [...accounts.entries()].map(([accountId, rows]) => {
    const first = rows[0];
    const last = rows[rows.length - 1] ?? first;
    const moneyIn = rows.reduce(
      (sum, row) => sum + numeric(row["Money in"]),
      0,
    );
    const moneyOut = rows.reduce(
      (sum, row) => sum + numeric(row["Money out"]),
      0,
    );
    const opening =
      numeric(first.Balance) -
      numeric(first["Money in"]) +
      numeric(first["Money out"]);
    const expectedClosing = opening + moneyIn - moneyOut;
    const statementClosing = numeric(last.Balance);
    return {
      "Account ID": accountId,
      Account: String(first.Account || `Bank account ${accountId}`),
      "Opening balance": rounded(opening),
      "Money in": rounded(moneyIn),
      "Money out": rounded(moneyOut),
      "Expected closing balance": rounded(expectedClosing),
      "Statement closing balance": rounded(statementClosing),
      Variance: rounded(statementClosing - expectedClosing),
      Transactions: rows.length,
      Unmatched: rows.filter(
        (row) => row["Reconciliation status"] === "unmatched",
      ).length,
    };
  });
}

export function buildDataQualityReport(
  counts: AccountantPackageCounts,
  dashboard: DashboardData,
  reconciliations: BankReconciliationRow[],
  ledgerChecks: ExportRow[] = [],
) {
  const reconciliationVariance = rounded(
    reconciliations.reduce((sum, row) => sum + Math.abs(row.Variance), 0),
  );
  return [
    {
      Check: "Bank transactions matched or reviewed",
      Status: counts.unmatchedBankTransactions === 0 ? "Clear" : "Review",
      Result: `${counts.unmatchedBankTransactions} unmatched`,
      Action:
        counts.unmatchedBankTransactions === 0
          ? "None"
          : "Review unmatched rows in 03-bank/bank-transactions.pdf",
    },
    {
      Check: "Imported statement arithmetic",
      Status: reconciliationVariance <= 0.01 ? "Clear" : "Review",
      Result: money(reconciliationVariance),
      Action:
        reconciliationVariance <= 0.01
          ? "None"
          : "Compare statement opening and closing balances by account",
    },
    {
      Check: "Expense evidence references",
      Status: dashboard.missingReceiptCount === 0 ? "Clear" : "Review",
      Result: `${dashboard.missingReceiptCount} expense(s) without a receipt reference`,
      Action:
        dashboard.missingReceiptCount === 0
          ? "None"
          : "Review the expense ledger and request missing evidence",
    },
    {
      Check: "Supporting files copied",
      Status: counts.missingSupportingFiles === 0 ? "Clear" : "Review",
      Result: `${counts.supportingFiles} copied; ${counts.missingSupportingFiles} missing`,
      Action:
        counts.missingSupportingFiles === 0
          ? "None"
          : "See 06-supporting-files/evidence-index.pdf",
    },
    {
      Check: "Outstanding customer balances",
      Status: dashboard.outstandingCount === 0 ? "Clear" : "Information",
      Result: `${dashboard.outstandingCount} invoice(s); ${money(dashboard.outstandingValue)}`,
      Action: "Confirm collectability and consider bad-debt treatment",
    },
    ...ledgerChecks,
  ];
}

export function buildLedgerControlChecks(input: {
  invoices: ExportRow[];
  lineItems: ExportRow[];
  expenses: ExportRow[];
  expenseCategories: ExportRow[];
}) {
  const total = (rows: ExportRow[], key: string) =>
    rounded(rows.reduce((sum, row) => sum + numeric(row[key]), 0));
  const check = (name: string, detail: number, summary: number) => {
    const variance = rounded(detail - summary);
    return {
      Check: name,
      Status: Math.abs(variance) <= 0.01 ? "Clear" : "Review",
      Result: `${money(detail)} detail; ${money(summary)} control; ${money(variance)} variance`,
      Action:
        Math.abs(variance) <= 0.01
          ? "None"
          : "Review the detailed and summary PDF reports",
    };
  };
  return [
    check(
      "Invoice headers cross-foot to line items",
      total(input.lineItems, "Line total"),
      total(input.invoices, "Gross"),
    ),
    check(
      "Expense detail cross-foots to category summary",
      total(input.expenses, "Allowable amount"),
      total(input.expenseCategories, "Allowable amount"),
    ),
  ];
}

export function buildAccrualControlChecks(input: {
  supplierBills: ExportRow[];
  supplierBillPayments: ExportRow[];
  accrualAdjustments: ExportRow[];
}) {
  const paidOnBills = rounded(
    input.supplierBills.reduce(
      (sum, row) => sum + numeric(row["Paid by year end"]),
      0,
    ),
  );
  const paymentDetail = rounded(
    input.supplierBillPayments.reduce(
      (sum, row) => sum + numeric(row.Amount),
      0,
    ),
  );
  const paymentVariance = rounded(paymentDetail - paidOnBills);
  const invalidReversals = input.accrualAdjustments.filter(
    (row) =>
      !String(row["Reversal date"]) ||
      String(row["Reversal date"]) <= String(row["Adjustment date"]),
  ).length;
  return [
    {
      Check: "Supplier payments cross-foot to creditor ledger",
      Status: Math.abs(paymentVariance) <= 0.01 ? "Clear" : "Review",
      Result: `${money(paymentDetail)} payments; ${money(paidOnBills)} applied; ${money(paymentVariance)} variance`,
      Action:
        Math.abs(paymentVariance) <= 0.01
          ? "None"
          : "Review supplier-bill-payments.pdf and supplier-bills.pdf",
    },
    {
      Check: "Accrual and prepayment reversal dates",
      Status: invalidReversals === 0 ? "Clear" : "Review",
      Result: `${invalidReversals} invalid or missing reversal date(s)`,
      Action:
        invalidReversals === 0
          ? "None"
          : "Correct reversal dates before finalising the accounts",
    },
  ];
}

export function buildYearEndControlChecks(input: {
  details: YearEndHandoffDetails;
  bankConfirmations: ExportRow[];
  yearStart: string;
  yearEnd: string;
}) {
  const incompleteBanks = input.bankConfirmations.filter(
    (row) =>
      numeric(row["Full year confirmed"]) !== 1 ||
      String(row["Statement start"]) > input.yearStart ||
      String(row["Statement end"]) < input.yearEnd,
  ).length;
  const balanceVariance = rounded(
    input.bankConfirmations.reduce(
      (sum, row) => sum + Math.abs(numeric(row.Variance)),
      0,
    ),
  );
  const completeBanks =
    input.bankConfirmations.length > 0 && incompleteBanks === 0;
  return [
    {
      Check: "Business year-end declarations",
      Status: input.details.questionnaire_complete === 1 ? "Clear" : "Review",
      Result:
        input.details.questionnaire_complete === 1 ? "Completed" : "Incomplete",
      Action:
        input.details.questionnaire_complete === 1
          ? "None"
          : "Complete the business declarations in SoleTrader",
    },
    {
      Check: "Personal tax checklist",
      Status: input.details.personal_tax_complete === 1 ? "Clear" : "Review",
      Result:
        input.details.personal_tax_complete === 1 ? "Completed" : "Incomplete",
      Action:
        input.details.personal_tax_complete === 1
          ? "None"
          : "Complete the personal tax checklist in SoleTrader",
    },
    {
      Check: "Bank statement coverage",
      Status: completeBanks ? "Clear" : "Review",
      Result: `${input.bankConfirmations.length - incompleteBanks} of ${input.bankConfirmations.length} account(s) confirmed`,
      Action: completeBanks
        ? "None"
        : "Confirm full-year statement dates for every active account",
    },
    {
      Check: "Confirmed bank closing balances",
      Status: balanceVariance <= 0.01 && completeBanks ? "Clear" : "Review",
      Result: `${money(balanceVariance)} total variance`,
      Action:
        balanceVariance <= 0.01 && completeBanks
          ? "None"
          : "Compare confirmed balances with the final imported statement rows",
    },
    {
      Check: "Owner approval",
      Status: input.details.approved === 1 ? "Clear" : "Review",
      Result:
        input.details.approved === 1
          ? `${input.details.approved_by || "Owner"} at ${input.details.approved_at || "time not recorded"}`
          : "Not approved",
      Action:
        input.details.approved === 1
          ? "None"
          : "Record owner approval before final submission",
    },
  ];
}

export function buildPackageManifest(input: {
  generatedAt: string;
  schemaVersion: number;
  businessName: string;
  taxYear: string;
  accountingBasis: string;
  vatStatus: string;
  vatScheme: string;
  counts: AccountantPackageCounts;
  reviewItems: number;
  ownerApproved?: boolean;
  bankAccountsConfirmed?: number;
  files: string[];
  audience?: "accountant" | "hmrc";
}) {
  return {
    format:
      input.audience === "hmrc"
        ? "soletrader-hmrc-evidence-handoff"
        : "soletrader-accountant-handoff",
    formatVersion: 2,
    generatedAt: input.generatedAt,
    schemaVersion: input.schemaVersion,
    business: input.businessName,
    taxYear: input.taxYear,
    accountingBasis: input.accountingBasis,
    vat: { status: input.vatStatus, scheme: input.vatScheme },
    counts: input.counts,
    controls: {
      status: input.reviewItems === 0 ? "clear" : "review",
      reviewItems: input.reviewItems,
      ownerApproved: input.ownerApproved ?? false,
      bankAccountsConfirmed: input.bankAccountsConfirmed ?? 0,
    },
    privacy: {
      containsPersonalTaxIdentifiers: true,
      secureTransferRecommended: true,
    },
    files: [...input.files].sort(),
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

const money = (value: number) => `£${value.toFixed(2)}`;
const pathSeparator = (path: string) => (path.includes("\\") ? "\\" : "/");

function joinPath(root: string, ...parts: string[]) {
  const separator = pathSeparator(root);
  return [
    root.replace(/[\\/]$/, ""),
    ...parts.map((part) => part.replace(/^[\\/]|[\\/]$/g, "")),
  ].join(separator);
}

function reportCell(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return JSON.stringify(value);
}

export function buildTabularReport(
  title: string,
  subtitle: string,
  rows: ExportRow[],
): ReportDocument {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (columns.length === 0) {
    return {
      title,
      subtitle,
      sections: [{ title: "Records", columns: ["Status"], rows: [] }],
    };
  }
  const firstColumn = columns[0];
  const columnGroups =
    columns.length <= 6
      ? [columns]
      : Array.from(
          { length: Math.ceil((columns.length - 1) / 5) },
          (_, index) => [
            firstColumn,
            ...columns.slice(1 + index * 5, 1 + (index + 1) * 5),
          ],
        );
  return {
    title,
    subtitle,
    sections: columnGroups.map((group, index) => ({
      title:
        columnGroups.length === 1
          ? "Records"
          : `Records · fields ${index + 1} of ${columnGroups.length}`,
      columns: group,
      rows: rows.map((row) => group.map((column) => reportCell(row[column]))),
    })),
  };
}

async function writeReportPdf(
  path: string,
  title: string,
  subtitle: string,
  rows: ExportRow[],
) {
  await writeFile(
    path,
    buildReportPdf([buildTabularReport(title, subtitle, rows)]),
  );
}

function summaryDocument(
  dashboard: DashboardData,
  counts: AccountantPackageCounts,
  reconciliations: BankReconciliationRow[],
  quality: ExportRow[],
  priorYears: ExportRow[],
  details: YearEndHandoffDetails,
  audience: "accountant" | "hmrc",
): ReportDocument {
  const profile = dashboard.profile;
  const businessName =
    profile.trading_name || `${profile.first_name} ${profile.last_name}`.trim();
  return {
    title:
      audience === "hmrc"
        ? "HMRC evidence handoff summary"
        : "Accountant handoff summary",
    subtitle: `${businessName} · ${dashboard.config.tax_year} · ${accountingBasisLabel(dashboard.accountingBasis)}`,
    sections: [
      {
        title: "Business details",
        columns: ["Field", "Value"],
        rows: [
          ["Trading name", businessName],
          ["Proprietor", `${profile.first_name} ${profile.last_name}`.trim()],
          ["Business description", profile.business_description],
          ["UTR", profile.utr],
          ["National Insurance number", profile.ni_number],
          [
            "Address",
            [
              profile.address_line_1,
              profile.address_line_2,
              profile.city,
              profile.county,
              profile.postcode,
            ]
              .filter(Boolean)
              .join(", "),
          ],
          ["Email", profile.email],
          ["Phone", profile.phone],
          ["Accounting basis", accountingBasisLabel(profile.accounting_basis)],
          ["VAT status", profile.vat_status],
          ["VAT number", profile.vat_number],
          ["VAT scheme", profile.vat_scheme],
          ["CIS status", profile.cis_status],
        ],
      },
      {
        title: "Annual figures from SoleTrader",
        columns: ["Figure", "Amount"],
        rows: [
          ["Turnover / recognised income", money(dashboard.income)],
          [
            "Allowable expenses and vehicle deductions",
            money(dashboard.expenses),
          ],
          ["Net business profit", money(dashboard.profit)],
          ["Estimated tax and National Insurance", money(dashboard.tax.total)],
        ],
      },
      {
        title: "Bookkeeping checks",
        columns: ["Check", "Result"],
        rows: [
          ["Unmatched bank transactions", counts.unmatchedBankTransactions],
          [
            "Expenses without a receipt reference",
            dashboard.missingReceiptCount,
          ],
          ["Outstanding invoices", dashboard.outstandingCount],
          ["Outstanding invoice value", money(dashboard.outstandingValue)],
          ["Supplier bills", counts.supplierBills ?? 0],
          ["Supplier bill payments", counts.supplierBillPayments ?? 0],
          ["Accrual / prepayment adjustments", counts.accrualAdjustments ?? 0],
          ["Supporting files copied", counts.supportingFiles],
          ["Referenced files not copied", counts.missingSupportingFiles],
        ],
      },
      {
        title: "Bank reconciliation",
        columns: [
          "Account",
          "Opening",
          "Money in",
          "Money out",
          "Closing",
          "Variance",
        ],
        rows: reconciliations.map((row) => [
          row.Account,
          money(row["Opening balance"]),
          money(row["Money in"]),
          money(row["Money out"]),
          money(row["Statement closing balance"]),
          money(row.Variance),
        ]),
      },
      {
        title: "Review points",
        columns: ["Check", "Status", "Result", "Action"],
        rows: quality.map((row) => [
          String(row.Check),
          String(row.Status),
          String(row.Result),
          String(row.Action),
        ]),
      },
      {
        title: "Prior-year comparison",
        columns: ["Tax year", "Income", "Expenses", "Profit", "Tax"],
        rows: priorYears.map((row) => [
          String(row["Tax year"]),
          money(numeric(row.Income)),
          money(numeric(row.Expenses)),
          money(numeric(row.Profit)),
          money(numeric(row["Estimated tax"])),
        ]),
      },
      {
        title: "Owner approval",
        columns: ["Field", "Value"],
        rows: [
          ["Status", details.approved === 1 ? "Approved" : "Not approved"],
          ["Approved by", details.approved_by],
          ["Approved at", details.approved_at ?? ""],
          ["Declaration", details.declaration],
        ],
      },
    ],
  };
}

export async function exportAccountantPackage(
  taxYear: string,
  dashboard: DashboardData,
  audience: "accountant" | "hmrc" = "accountant",
  hmrcData?: HmrcPackageData,
): Promise<AccountantPackageResult | null> {
  const hmrc = audience === "hmrc";
  const parent = await open({
    directory: true,
    recursive: true,
    multiple: false,
    title: hmrc
      ? "Choose where to save the HMRC evidence handoff"
      : "Choose where to save the accountant handoff",
  });
  if (!parent || Array.isArray(parent)) return null;
  const config = dashboard.config;
  const profile = dashboard.profile;
  const businessName =
    profile.trading_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "SoleTrader business";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const generatedAt = new Date().toISOString();
  const root = joinPath(
    parent,
    `${safePackageName(businessName)}-${hmrc ? "hmrc-evidence" : "accountant"}-${taxYear.replace("/", "-")}-${stamp}`,
  );
  const folders = [
    "00-summary",
    "01-sales",
    "02-expenses",
    "03-bank",
    "04-vehicles",
    "05-tax-and-vat",
    "06-supporting-files",
    "07-ledger",
  ];

  const schemaRows = await query<{ version: number }>(
    "SELECT version FROM workspace_schema LIMIT 1",
  );
  const schemaVersion = schemaRows[0]?.version ?? 0;
  const supportsSelfBilling = schemaVersion >= 18;
  const supportsAccrualAccounting = schemaVersion >= 28;

  const [
    invoices,
    lineItems,
    payments,
    creditNotes,
    clients,
    expenses,
    expenseCategories,
    supplierBills,
    supplierBillPayments,
    accrualAdjustments,
    bankTransactions,
    bankBatches,
    vehicles,
    mileage,
    vehicleCosts,
    capitalAssets,
    vatReturns,
    cisTransactions,
    taxInputs,
    documents,
    businessDetails,
    vatSettings,
    openingBalances,
    selfBillingAgreements,
    evidence,
  ] = await Promise.all([
    query<ExportRow>(
      supportsSelfBilling
        ? `SELECT CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS "Invoice reference", i.source_type AS "Source type", i.external_reference AS "Customer reference", COALESCE(NULLIF(c.company, ''), c.name) AS "Client", i.status AS "Status", i.issue_date AS "Issue date", i.due_date AS "Due date", i.subtotal AS "Net", i.vat_amount AS "VAT", i.total AS "Gross", i.amount_paid AS "Settled", ROUND(MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), 2) AS "Balance", i.self_billing_agreement_id AS "Self-billing agreement ID", i.source_document_id AS "Original document ID", i.self_billing_checks_confirmed AS "Self-billing VAT checks confirmed", i.notes AS "Customer notes", i.internal_notes AS "Internal notes", i.bad_debt_written_off AS "Bad debt written off", CASE WHEN i.source_type = 'issued' THEN i.pdf_path ELSE '' END AS "Archived PDF" FROM invoices i INNER JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.issue_date BETWEEN ? AND ? ORDER BY i.issue_date, "Invoice reference"`
        : `SELECT i.invoice_number AS "Invoice reference", 'issued' AS "Source type", '' AS "Customer reference", COALESCE(NULLIF(c.company, ''), c.name) AS "Client", i.status AS "Status", i.issue_date AS "Issue date", i.due_date AS "Due date", i.subtotal AS "Net", i.vat_amount AS "VAT", i.total AS "Gross", i.amount_paid AS "Settled", ROUND(MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), 2) AS "Balance", NULL AS "Self-billing agreement ID", NULL AS "Original document ID", 0 AS "Self-billing VAT checks confirmed", i.notes AS "Customer notes", i.internal_notes AS "Internal notes", i.bad_debt_written_off AS "Bad debt written off", i.pdf_path AS "Archived PDF" FROM invoices i INNER JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.issue_date BETWEEN ? AND ? ORDER BY i.issue_date, "Invoice reference"`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT ${supportsSelfBilling ? "CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END" : "i.invoice_number"} AS "Invoice reference", li.description AS "Description", li.quantity AS "Quantity", li.unit_price AS "Unit price", li.vat_rate AS "VAT rate", li.vat_amount AS "VAT", li.line_total AS "Line total" FROM invoice_line_items li INNER JOIN invoices i ON i.id = li.invoice_id WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.issue_date BETWEEN ? AND ? ORDER BY i.issue_date, "Invoice reference", li.sort_order`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      supportsSelfBilling
        ? `SELECT CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS "Invoice reference", COALESCE(NULLIF(c.company, ''), c.name) AS "Client", p.payment_date AS "Payment date", p.amount AS "Total settled", COALESCE(p.cash_amount, p.amount) AS "Cash received", p.cis_deduction_amount AS "CIS withheld", p.cis_transaction_id AS "CIS transaction ID", p.payment_method AS "Method", p.notes AS "Notes" FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id INNER JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date, "Invoice reference"`
        : `SELECT i.invoice_number AS "Invoice reference", COALESCE(NULLIF(c.company, ''), c.name) AS "Client", p.payment_date AS "Payment date", p.amount AS "Total settled", p.amount AS "Cash received", 0 AS "CIS withheld", NULL AS "CIS transaction ID", p.payment_method AS "Method", p.notes AS "Notes" FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id INNER JOIN clients c ON c.id = i.client_id WHERE i.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date, "Invoice reference"`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT cn.credit_number AS "Credit number", ${supportsSelfBilling ? "CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END" : "i.invoice_number"} AS "Invoice reference", cn.issue_date AS "Issue date", cn.amount AS "Amount", cn.reason AS "Reason" FROM credit_notes cn INNER JOIN invoices i ON i.id = cn.invoice_id WHERE i.deleted_at IS NULL AND cn.issue_date BETWEEN ? AND ? ORDER BY cn.issue_date, cn.credit_number`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT DISTINCT c.name AS "Contact", c.company AS "Company", c.email AS "Email", c.phone AS "Phone", c.address_line_1 AS "Address 1", c.address_line_2 AS "Address 2", c.city AS "City", c.county AS "County", c.postcode AS "Postcode", c.notes AS "Notes" FROM clients c INNER JOIN invoices i ON i.client_id = c.id WHERE i.deleted_at IS NULL AND i.issue_date BETWEEN ? AND ? ORDER BY c.company, c.name`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT e.id AS "Expense ID", e.date AS "Date", e.supplier AS "Supplier", e.description AS "Description", c.name AS "Category", e.amount AS "Gross paid", e.vat_amount AS "VAT", e.business_percent AS "Business use %", ROUND((e.amount - CASE WHEN ? = 'unregistered' OR (? = 'flat_rate' AND e.vat_capital_asset = 0) THEN 0 ELSE e.vat_amount END) * e.business_percent / 100, 2) AS "Allowable amount", e.receipt_path AS "Receipt file", e.notes AS "Notes", e.is_bad_debt AS "Bad debt" FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? ORDER BY e.date, e.id`,
      [
        profile.vat_status,
        profile.vat_scheme,
        config.year_start,
        config.year_end,
      ],
    ),
    query<ExportRow>(
      `SELECT c.name AS "Category", COUNT(*) AS "Transactions", ROUND(SUM(e.amount), 2) AS "Gross paid", ROUND(SUM(e.vat_amount * e.business_percent / 100), 2) AS "Business VAT", ROUND(SUM((e.amount - CASE WHEN ? = 'unregistered' OR (? = 'flat_rate' AND e.vat_capital_asset = 0) THEN 0 ELSE e.vat_amount END) * e.business_percent / 100), 2) AS "Allowable amount" FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? GROUP BY c.id ORDER BY "Allowable amount" DESC`,
      [
        profile.vat_status,
        profile.vat_scheme,
        config.year_start,
        config.year_end,
      ],
    ),
    supportsAccrualAccounting
      ? query<ExportRow>(
          `SELECT b.id AS "Bill ID", b.supplier AS "Supplier", b.reference AS "Reference",
            b.bill_date AS "Bill date", b.due_date AS "Due date", c.name AS "Category",
            b.gross_amount AS "Gross", b.vat_amount AS "VAT", b.business_percent AS "Business use %",
            ROUND((b.gross_amount - CASE WHEN ? = 'unregistered' OR (? = 'flat_rate' AND b.vat_capital_asset = 0) THEN 0 ELSE b.vat_amount END) * b.business_percent / 100, 2) AS "Allowable amount",
            ROUND(COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.bill_id = b.id AND p.payment_date <= ?), 0), 2) AS "Paid by year end",
            ROUND(MAX(0, b.gross_amount - COALESCE((SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.bill_id = b.id AND p.payment_date <= ?), 0)), 2) AS "Outstanding at year end",
            CASE WHEN b.due_date >= ? THEN 'Current' WHEN julianday(?) - julianday(b.due_date) <= 30 THEN '1-30 days' WHEN julianday(?) - julianday(b.due_date) <= 60 THEN '31-60 days' WHEN julianday(?) - julianday(b.due_date) <= 90 THEN '61-90 days' ELSE '90+ days' END AS "Age at year end",
            b.vat_capital_asset AS "VAT capital asset", b.notes AS "Notes"
           FROM supplier_bills b INNER JOIN expense_categories c ON c.id = b.category_id
           WHERE b.deleted_at IS NULL AND b.tax_year = ? ORDER BY b.bill_date, b.id`,
          [
            profile.vat_status,
            profile.vat_scheme,
            config.year_end,
            config.year_end,
            config.year_end,
            config.year_end,
            config.year_end,
            config.year_end,
            taxYear,
          ],
        )
      : Promise.resolve([]),
    supportsAccrualAccounting
      ? query<ExportRow>(
          `SELECT p.id AS "Payment ID", p.bill_id AS "Bill ID", b.supplier AS "Supplier",
            b.reference AS "Reference", p.payment_date AS "Payment date", p.amount AS "Amount",
            p.notes AS "Notes" FROM supplier_bill_payments p
           INNER JOIN supplier_bills b ON b.id = p.bill_id
           WHERE b.deleted_at IS NULL AND b.tax_year = ? AND p.payment_date <= ?
           ORDER BY p.payment_date, p.id`,
          [taxYear, config.year_end],
        )
      : Promise.resolve([]),
    supportsAccrualAccounting
      ? query<ExportRow>(
          `SELECT a.id AS "Adjustment ID", a.adjustment_type AS "Type", c.name AS "Category",
            a.description AS "Description", a.amount AS "Amount",
            a.adjustment_date AS "Adjustment date", a.reversal_date AS "Reversal date",
            a.notes AS "Notes" FROM accrual_adjustments a
           INNER JOIN expense_categories c ON c.id = a.category_id
           WHERE a.deleted_at IS NULL AND a.tax_year = ? ORDER BY a.adjustment_date, a.id`,
          [taxYear],
        )
      : Promise.resolve([]),
    query<ExportRow>(
      `SELECT b.bank_account_id AS "Account ID", a.name AS "Account", b.transaction_date AS "Date", b.description AS "Description", b.amount_in AS "Money in", b.amount_out AS "Money out", b.balance AS "Balance", b.status AS "Reconciliation status", b.classification AS "Classification", b.match_confidence AS "Match confidence", b.matched_invoice_id AS "Matched invoice ID", b.matched_payment_id AS "Matched payment ID", b.matched_expense_id AS "Matched expense ID", b.matched_income_id AS "Matched income ID", b.source_file AS "Statement file", b.raw_data AS "Original statement row" FROM bank_transactions b INNER JOIN bank_accounts a ON a.id = b.bank_account_id WHERE b.transaction_date BETWEEN ? AND ? ORDER BY b.bank_account_id, b.transaction_date, b.id`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT source_file AS "Statement file", imported_rows AS "Imported rows", duplicate_rows AS "Duplicates skipped", date_from AS "First date", date_to AS "Last date", created_at AS "Imported at" FROM bank_import_batches WHERE date_to >= ? AND date_from <= ? ORDER BY created_at`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT DISTINCT v.name AS "Vehicle", v.make AS "Make", v.model AS "Model", v.registration AS "Registration", v.vehicle_type AS "Type", v.cost_method AS "Claim method", v.business_percent AS "Business use %" FROM vehicles v LEFT JOIN mileage_logs m ON m.vehicle_id = v.id AND m.deleted_at IS NULL LEFT JOIN vehicle_costs c ON c.vehicle_id = v.id AND c.deleted_at IS NULL WHERE (m.date BETWEEN ? AND ?) OR (c.date BETWEEN ? AND ?) ORDER BY v.name`,
      [config.year_start, config.year_end, config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT m.date AS "Date", v.name AS "Vehicle", v.registration AS "Registration", m.start_location AS "From", m.end_location AS "To", m.purpose AS "Business purpose", m.distance_miles AS "Miles", m.passengers AS "Passengers", m.rate_applied AS "Rate", m.amount AS "Mileage allowance", m.notes AS "Notes" FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id WHERE m.deleted_at IS NULL AND m.date BETWEEN ? AND ? ORDER BY m.date, m.id`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT c.id AS "Cost ID", c.date AS "Date", v.name AS "Vehicle", v.registration AS "Registration", c.cost_type AS "Cost type", c.description AS "Description", c.amount AS "Gross paid", c.vat_amount AS "VAT", c.business_percent AS "Business use %", ROUND((c.amount - CASE WHEN ? = 'unregistered' OR (? = 'flat_rate' AND c.vat_capital_asset = 0) THEN 0 ELSE c.vat_amount END) * c.business_percent / 100, 2) AS "Allowable amount", c.receipt_path AS "Receipt file", c.notes AS "Notes" FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id WHERE c.deleted_at IS NULL AND c.date BETWEEN ? AND ? ORDER BY c.date, c.id`,
      [
        profile.vat_status,
        profile.vat_scheme,
        config.year_start,
        config.year_end,
      ],
    ),
    query<ExportRow>(
      `SELECT name AS "Asset", asset_type AS "Type", description AS "Description", purchase_date AS "Purchase date", purchase_price AS "Purchase price", business_percent AS "Business use %", pool_type AS "Pool", claim_method AS "Claim method", disposal_date AS "Disposal date", disposal_proceeds AS "Disposal proceeds", notes AS "Notes" FROM capital_assets WHERE deleted_at IS NULL AND purchase_date <= ? AND (disposal_date IS NULL OR disposal_date >= ?) ORDER BY purchase_date, id`,
      [config.year_end, config.year_start],
    ),
    query<ExportRow>(
      `SELECT period_start AS "Period start", period_end AS "Period end", scheme AS "Scheme", box1 AS "Box 1", box2 AS "Box 2", box3 AS "Box 3", box4 AS "Box 4", box5 AS "Box 5", box6 AS "Box 6", box7 AS "Box 7", box8 AS "Box 8", box9 AS "Box 9", filed_at AS "Filed at" FROM vat_return_snapshots WHERE tax_year = ? ORDER BY period_start`,
      [taxYear],
    ),
    query<ExportRow>(
      supportsSelfBilling
        ? `SELECT ct.id AS "CIS transaction ID", ct.direction AS "Direction", ct.date AS "Date", ct.party_name AS "Party", ct.party_utr AS "Party UTR", ct.gross_amount AS "Gross amount", ct.materials_amount AS "Materials", ct.deduction_rate AS "Deduction rate %", ct.deduction_amount AS "Deduction", CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS "Invoice reference", ct.invoice_payment_id AS "Invoice payment ID", ct.source_document_id AS "Evidence document ID", ct.bank_transaction_id AS "Bank transaction ID", ct.notes AS "Notes" FROM cis_transactions ct LEFT JOIN invoices i ON i.id = ct.invoice_id WHERE ct.deleted_at IS NULL AND ct.date BETWEEN ? AND ? ORDER BY ct.date, ct.id`
        : `SELECT ct.id AS "CIS transaction ID", ct.direction AS "Direction", ct.date AS "Date", ct.party_name AS "Party", ct.party_utr AS "Party UTR", ct.gross_amount AS "Gross amount", ct.materials_amount AS "Materials", ct.deduction_rate AS "Deduction rate %", ct.deduction_amount AS "Deduction", '' AS "Invoice reference", NULL AS "Invoice payment ID", NULL AS "Evidence document ID", NULL AS "Bank transaction ID", ct.notes AS "Notes" FROM cis_transactions ct WHERE ct.deleted_at IS NULL AND ct.date BETWEEN ? AND ? ORDER BY ct.date, ct.id`,
      [config.year_start, config.year_end],
    ),
    query<ExportRow>("SELECT * FROM tax_calculator_inputs WHERE tax_year = ?", [
      taxYear,
    ]),
    query<ExportRow>(
      `SELECT d.id AS "Document ID", d.document_date AS "Date", d.file_name AS "File name", d.category AS "Category", d.file_type AS "Type", d.file_size AS "Bytes", d.linked_expense_id AS "Expense ID", d.linked_invoice_id AS "Invoice ID", d.linked_vehicle_cost_id AS "Vehicle cost ID", d.notes AS "Notes", d.file_path AS "Stored file" FROM documents d WHERE d.deleted_at IS NULL AND (d.tax_year = ? OR d.document_date BETWEEN ? AND ?) ORDER BY d.document_date, d.id`,
      [taxYear, config.year_start, config.year_end],
    ),
    query<ExportRow>(
      "SELECT first_name, last_name, trading_name, business_description, utr, ni_number, address_line_1, address_line_2, city, county, postcode, phone, email, accounting_basis, vat_status, vat_number, vat_scheme, vat_flat_rate_percent, cis_status, student_loan_plan FROM user_profile WHERE id = 1",
    ),
    query<ExportRow>(
      "SELECT quarter_start_month, mtd_enabled, reminders_enabled FROM vat_settings WHERE id = 1",
    ),
    query<ExportRow>(
      "SELECT key, value FROM app_settings WHERE key LIKE 'opening_%' OR key = 'current_tax_year' ORDER BY key",
    ),
    supportsSelfBilling
      ? query<ExportRow>(
          `SELECT a.id AS "Agreement ID", COALESCE(NULLIF(c.company, ''), c.name) AS "Customer", a.start_date AS "Start date", a.expiry_date AS "Expiry date", a.customer_vat_number AS "Customer VAT number", a.document_id AS "Agreement document ID", COALESCE(d.file_name, '') AS "Agreement document", a.archived AS "Archived", a.notes AS "Notes" FROM self_billing_agreements a INNER JOIN clients c ON c.id = a.client_id LEFT JOIN documents d ON d.id = a.document_id WHERE a.start_date <= ? AND a.expiry_date >= ? ORDER BY a.start_date, a.id`,
          [config.year_end, config.year_start],
        )
      : Promise.resolve([]),
    query<EvidenceRow>(
      supportsSelfBilling
        ? `SELECT 'Expense receipt' AS record_type, 'Expense ' || id AS record_reference, supplier || ' - ' || date AS original_name, receipt_path AS source_path FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ? AND receipt_path != '' UNION ALL SELECT 'Vehicle receipt', 'Vehicle cost ' || c.id, v.name || ' - ' || c.date, c.receipt_path FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id WHERE c.deleted_at IS NULL AND c.date BETWEEN ? AND ? AND c.receipt_path != '' UNION ALL SELECT CASE WHEN EXISTS(SELECT 1 FROM invoices i WHERE i.source_document_id = d.id) THEN 'Original self-billed invoice' WHEN EXISTS(SELECT 1 FROM self_billing_agreements a WHERE a.document_id = d.id) THEN 'Self-billing agreement' ELSE 'Document' END, COALESCE((SELECT CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END FROM invoices i WHERE i.source_document_id = d.id LIMIT 1), (SELECT 'Agreement ' || a.id FROM self_billing_agreements a WHERE a.document_id = d.id LIMIT 1), 'Document ' || d.id), d.file_name, d.file_path FROM documents d WHERE d.deleted_at IS NULL AND (d.tax_year = ? OR d.document_date BETWEEN ? AND ? OR EXISTS(SELECT 1 FROM self_billing_agreements a WHERE a.document_id = d.id AND a.start_date <= ? AND a.expiry_date >= ?)) AND d.file_path != '' UNION ALL SELECT 'Invoice PDF', invoice_number, invoice_number || '.pdf', pdf_path FROM invoices WHERE deleted_at IS NULL AND source_type = 'issued' AND is_quote = 0 AND issue_date BETWEEN ? AND ? AND pdf_path != ''`
        : `SELECT 'Expense receipt' AS record_type, 'Expense ' || id AS record_reference, supplier || ' - ' || date AS original_name, receipt_path AS source_path FROM expenses WHERE deleted_at IS NULL AND date BETWEEN ? AND ? AND receipt_path != '' UNION ALL SELECT 'Vehicle receipt', 'Vehicle cost ' || c.id, v.name || ' - ' || c.date, c.receipt_path FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id WHERE c.deleted_at IS NULL AND c.date BETWEEN ? AND ? AND c.receipt_path != '' UNION ALL SELECT 'Document', 'Document ' || d.id, d.file_name, d.file_path FROM documents d WHERE d.deleted_at IS NULL AND (d.tax_year = ? OR d.document_date BETWEEN ? AND ?) AND d.file_path != '' UNION ALL SELECT 'Invoice PDF', invoice_number, invoice_number || '.pdf', pdf_path FROM invoices WHERE deleted_at IS NULL AND is_quote = 0 AND issue_date BETWEEN ? AND ? AND pdf_path != ''`,
      supportsSelfBilling
        ? [
            config.year_start,
            config.year_end,
            config.year_start,
            config.year_end,
            taxYear,
            config.year_start,
            config.year_end,
            config.year_end,
            config.year_start,
            config.year_start,
            config.year_end,
          ]
        : [
            config.year_start,
            config.year_end,
            config.year_start,
            config.year_end,
            taxYear,
            config.year_start,
            config.year_end,
            config.year_start,
            config.year_end,
          ],
    ),
  ]);

  const directIncome = await query<ExportRow>(
    `SELECT id AS "Income ID", income_date AS "Date", description AS "Description", income_type AS "Type", amount AS "Net paid into bank / received", gross_amount AS "Gross income before CIS", cis_deduction_amount AS "CIS withheld and sent to HMRC", vat_amount AS "VAT", vat_rate AS "VAT rate", payment_method AS "Payment method", client_id AS "Client ID", bank_transaction_id AS "Bank transaction ID", notes AS "Notes" FROM direct_income WHERE deleted_at IS NULL AND income_date BETWEEN ? AND ? ORDER BY income_date, id`,
    [config.year_start, config.year_end],
  );

  const [trialBalance, generalLedger, handoffRows, bankConfirmations] =
    await Promise.all([
      query<ExportRow>(
        `SELECT a.code AS "Account code", a.name AS "Account", a.account_type AS "Type",
          ROUND(COALESCE(t.debit, 0) / 100.0, 2) AS "Debits",
          ROUND(COALESCE(t.credit, 0) / 100.0, 2) AS "Credits",
          ROUND(MAX(COALESCE(t.debit, 0) - COALESCE(t.credit, 0), 0) / 100.0, 2) AS "Debit balance",
          ROUND(MAX(COALESCE(t.credit, 0) - COALESCE(t.debit, 0), 0) / 100.0, 2) AS "Credit balance"
         FROM ledger_accounts a LEFT JOIN (
           SELECT l.account_code, SUM(l.debit) AS debit, SUM(l.credit) AS credit
           FROM journal_lines l INNER JOIN journal_entries j ON j.id = l.entry_id
           WHERE j.tax_year = ? GROUP BY l.account_code
         ) t ON t.account_code = a.code ORDER BY a.code`,
        [taxYear],
      ),
      query<ExportRow>(
        `SELECT j.id AS "Journal ID", j.entry_date AS "Date", j.description AS "Description",
          j.source_type AS "Source type", j.source_id AS "Source ID",
          a.code AS "Account code", a.name AS "Account", a.account_type AS "Type",
          ROUND(l.debit / 100.0, 2) AS "Debit", ROUND(l.credit / 100.0, 2) AS "Credit", l.memo AS "Memo"
         FROM journal_entries j INNER JOIN journal_lines l ON l.entry_id = j.id
         INNER JOIN ledger_accounts a ON a.code = l.account_code
         WHERE j.tax_year = ? ORDER BY j.entry_date, j.id, l.id`,
        [taxYear],
      ),
      query<YearEndHandoffDetails>(
        "SELECT * FROM year_end_handoff_details WHERE tax_year = ?",
        [taxYear],
      ),
      query<ExportRow>(
        `SELECT a.id AS "Account ID", a.name AS "Account", a.account_type AS "Type",
          COALESCE(c.statement_start, '') AS "Statement start",
          COALESCE(c.statement_end, '') AS "Statement end",
          COALESCE(c.closing_balance, 0) AS "Confirmed closing balance",
          COALESCE((SELECT b.balance FROM bank_transactions b WHERE b.bank_account_id = a.id
            AND b.transaction_date BETWEEN ? AND ? ORDER BY b.transaction_date DESC, b.id DESC LIMIT 1), 0) AS "Imported closing balance",
          ROUND(COALESCE(c.closing_balance, 0) - COALESCE((SELECT b.balance FROM bank_transactions b
            WHERE b.bank_account_id = a.id AND b.transaction_date BETWEEN ? AND ?
            ORDER BY b.transaction_date DESC, b.id DESC LIMIT 1), 0), 2) AS "Variance",
          COALESCE(c.confirmed_complete, 0) AS "Full year confirmed",
          COALESCE(c.notes, '') AS "Notes"
         FROM bank_accounts a LEFT JOIN bank_year_end_confirmations c
           ON c.bank_account_id = a.id AND c.tax_year = ?
         WHERE a.archived = 0 ORDER BY a.name`,
        [
          config.year_start,
          config.year_end,
          config.year_start,
          config.year_end,
          taxYear,
        ],
      ),
    ]);
  const handoffDetails = handoffRows[0] ?? emptyYearEndHandoff(taxYear);
  const priorYearComparison: ExportRow[] = dashboard.yearComparison.map(
    (year) => ({
      "Tax year": year.taxYear,
      Income: year.income,
      Expenses: year.expenses,
      Profit: year.profit,
      "Estimated tax": year.tax,
    }),
  );
  const yearEndQuestionnaire: ExportRow[] = [
    {
      Item: "Closing stock / WIP",
      Response: money(handoffDetails.stock_value),
    },
    {
      Item: "Business cash held",
      Response: money(handoffDetails.cash_on_hand),
    },
    {
      Item: "Loans outstanding",
      Response: money(handoffDetails.loans_balance),
    },
    {
      Item: "Hire purchase outstanding",
      Response: money(handoffDetails.hire_purchase_balance),
    },
    {
      Item: "Capital introduced",
      Response: money(handoffDetails.capital_introduced),
    },
    { Item: "Owner drawings", Response: money(handoffDetails.drawings) },
    {
      Item: "Private use adjustments",
      Response: handoffDetails.private_use_notes,
    },
    { Item: "Use of home", Response: handoffDetails.home_office_notes },
    {
      Item: "Other year-end information",
      Response: handoffDetails.other_year_end_notes,
    },
    {
      Item: "Questionnaire reviewed",
      Response: handoffDetails.questionnaire_complete ? "Yes" : "No",
    },
  ];
  const personalTaxChecklist: ExportRow[] = [
    {
      Item: "Employment and P60/P45",
      Response: handoffDetails.employment_details,
    },
    {
      Item: "Pension income and contributions",
      Response: handoffDetails.pension_details,
    },
    {
      Item: "Bank and savings interest",
      Response: handoffDetails.interest_details,
    },
    { Item: "Dividends", Response: handoffDetails.dividend_details },
    {
      Item: "State benefits and other income",
      Response: handoffDetails.benefit_details,
    },
    {
      Item: "Student or postgraduate loans",
      Response: handoffDetails.student_loan_details,
    },
    {
      Item: "Payments on account",
      Response: handoffDetails.payments_on_account_details,
    },
    {
      Item: "Checklist reviewed",
      Response: handoffDetails.personal_tax_complete ? "Yes" : "No",
    },
  ];
  const ownerApproval: ExportRow[] = [
    {
      Status: handoffDetails.approved ? "Approved" : "Not approved",
      "Approved by": handoffDetails.approved_by,
      "Approved at": handoffDetails.approved_at ?? "",
      Declaration: handoffDetails.declaration,
    },
  ];
  const creditorAgeing = supplierBills
    .filter((row) => numeric(row["Outstanding at year end"]) > 0)
    .map((row) => ({
      Supplier: row.Supplier,
      Reference: row.Reference,
      "Due date": row["Due date"],
      "Outstanding at year end": row["Outstanding at year end"],
      "Age at year end": row["Age at year end"],
    }));

  await mkdir(root, { recursive: true });
  await Promise.all(
    folders.map((folder) => mkdir(joinPath(root, folder), { recursive: true })),
  );

  const reportSubtitle = `${businessName} · ${taxYear} · ${accountingBasisLabel(profile.accounting_basis)}`;
  const summaryFileName = hmrc
    ? "00-summary/hmrc-handoff-summary.pdf"
    : "00-summary/accountant-summary.pdf";
  const ledgers: [string, string, ExportRow[]][] = [
    ["01-sales/invoices.pdf", "Sales invoices", invoices],
    ["01-sales/invoice-line-items.pdf", "Invoice line items", lineItems],
    ["01-sales/payments-received.pdf", "Payments received", payments],
    ["01-sales/credit-notes.pdf", "Credit notes", creditNotes],
    ["01-sales/clients.pdf", "Client details", clients],
    ["01-sales/direct-income.pdf", "Direct income", directIncome],
    ["02-expenses/expenses.pdf", "Paid expenses", expenses],
    [
      "02-expenses/category-summary.pdf",
      "Expense category summary",
      expenseCategories,
    ],
    ["02-expenses/supplier-bills.pdf", "Supplier bills", supplierBills],
    [
      "02-expenses/supplier-bill-payments.pdf",
      "Supplier bill payments",
      supplierBillPayments,
    ],
    [
      "02-expenses/accrual-adjustments.pdf",
      "Accrual and prepayment adjustments",
      accrualAdjustments,
    ],
    ["02-expenses/creditor-ageing.pdf", "Aged creditors", creditorAgeing],
    ["03-bank/bank-transactions.pdf", "Bank transactions", bankTransactions],
    [
      "03-bank/imported-statements.pdf",
      "Imported bank statements",
      bankBatches,
    ],
    ["04-vehicles/vehicles.pdf", "Vehicles", vehicles],
    ["04-vehicles/mileage-log.pdf", "Mileage log", mileage],
    ["04-vehicles/vehicle-costs.pdf", "Vehicle costs", vehicleCosts],
    ["05-tax-and-vat/capital-assets.pdf", "Capital assets", capitalAssets],
    ["05-tax-and-vat/vat-returns.pdf", "VAT returns", vatReturns],
    [
      "05-tax-and-vat/cis-transactions.pdf",
      "CIS transactions",
      cisTransactions,
    ],
    [
      "05-tax-and-vat/self-billing-agreements.pdf",
      "Self-billing agreements",
      selfBillingAgreements,
    ],
    [
      "05-tax-and-vat/self-assessment-inputs.pdf",
      "Self-assessment inputs",
      taxInputs,
    ],
    ["00-summary/business-details.pdf", "Business details", businessDetails],
    ["00-summary/vat-settings.pdf", "VAT settings", vatSettings],
    ["00-summary/opening-balances.pdf", "Opening balances", openingBalances],
    ["00-summary/documents-register.pdf", "Documents register", documents],
    [
      "00-summary/prior-year-comparison.pdf",
      "Prior-year comparison",
      priorYearComparison,
    ],
    [
      "00-summary/year-end-questionnaire.pdf",
      "Year-end questionnaire",
      yearEndQuestionnaire,
    ],
    ["00-summary/owner-approval.pdf", "Owner approval", ownerApproval],
    [
      "03-bank/year-end-confirmations.pdf",
      "Bank year-end confirmations",
      bankConfirmations,
    ],
    [
      "05-tax-and-vat/personal-tax-checklist.pdf",
      "Personal tax checklist",
      personalTaxChecklist,
    ],
    ["07-ledger/trial-balance.pdf", "Trial balance", trialBalance],
    ["07-ledger/general-ledger.pdf", "General ledger", generalLedger],
  ];
  if (hmrc && hmrcData) {
    ledgers.push(
      [
        "05-tax-and-vat/sa103-working-schedule.pdf",
        `${hmrcData.schedule.form} working schedule`,
        hmrcData.schedule.boxes.map((row) => ({
          Box: row.box,
          Field: row.label,
          Value: row.value,
          Source: row.source,
          Status: row.status,
        })),
      ],
      [
        "05-tax-and-vat/hmrc-profit-reconciliation.pdf",
        "HMRC profit reconciliation",
        [
          {
            Step: "Recognised business income",
            Amount: hmrcData.calculation.bookkeepingIncome,
            Source: "Sales and direct-income ledgers",
          },
          {
            Step: "Allowable bookkeeping expenses",
            Amount: -hmrcData.calculation.bookkeepingExpenses,
            Source: "Expense, vehicle and accrual ledgers",
          },
          {
            Step: "Bookkeeping profit",
            Amount: hmrcData.calculation.bookkeepingProfit,
            Source: "Income less expenses",
          },
          {
            Step: "Closing stock less opening stock",
            Amount: hmrcData.calculation.stockMovementAdjustment,
            Source: "Year-end and HMRC declarations (accrual basis only)",
          },
          {
            Step: "Use-of-home deduction",
            Amount: -hmrcData.calculation.homeOfficeDeduction,
            Source: "Saved tax inputs",
          },
          {
            Step: "Additions to profit",
            Amount: hmrcData.calculation.additionsToProfit,
            Source: "HMRC declarations and balancing charges",
          },
          {
            Step: "Deductions from profit",
            Amount: -hmrcData.calculation.deductionsFromProfit,
            Source: "Capital allowances and HMRC declarations",
          },
          {
            Step: "Profit for tax purposes",
            Amount: hmrcData.calculation.profitForTaxPurposes,
            Source: "Canonical reconciliation",
          },
          {
            Step: "Adjusted profit",
            Amount: hmrcData.calculation.adjustedProfit,
            Source: "Basis and accounting adjustments",
          },
          {
            Step: "Loss brought forward used",
            Amount: -hmrcData.calculation.lossBroughtForwardUsed,
            Source: "HMRC declarations",
          },
          {
            Step: "Total taxable business profit",
            Amount: hmrcData.calculation.totalTaxableProfit,
            Source: "Canonical reconciliation",
          },
          {
            Step: "CIS deductions",
            Amount: hmrcData.calculation.cisDeductions,
            Source: "CIS transaction ledger",
          },
          {
            Step: "Estimated total liability",
            Amount: hmrcData.taxEstimate.totalLiability,
            Source: "SoleTrader tax estimate",
          },
          {
            Step: "Estimated amount due",
            Amount: hmrcData.taxEstimate.amountDue,
            Source: "Liability less recorded deductions",
          },
        ],
      ],
      [
        "05-tax-and-vat/hmrc-filing-declarations.pdf",
        "HMRC filing declarations",
        Object.entries(hmrcData.filing)
          .filter(([field]) => field !== "updated_at")
          .map(([field, value]) => ({ Field: field, Value: value })),
      ],
    );
  }
  await Promise.all(
    ledgers.map(([relativePath, title, rows]) =>
      writeReportPdf(joinPath(root, relativePath), title, reportSubtitle, rows),
    ),
  );

  const evidenceIndex: ExportRow[] = [];
  let copied = 0;
  let missing = 0;
  for (const [index, item] of evidence.entries()) {
    const packageName = evidenceFileName(index + 1, item.source_path);
    try {
      const bytes = await readStoredFile(item.source_path);
      await writeFile(
        joinPath(root, "06-supporting-files", packageName),
        bytes,
      );
      copied += 1;
      evidenceIndex.push({
        "Record type": item.record_type,
        "Record reference": item.record_reference,
        Description: item.original_name,
        "Original stored path": item.source_path,
        "Package file": packageName,
        Bytes: bytes.byteLength,
        "SHA-256": await sha256(bytes),
        "Copy status": "Copied",
      });
    } catch {
      missing += 1;
      evidenceIndex.push({
        "Record type": item.record_type,
        "Record reference": item.record_reference,
        Description: item.original_name,
        "Original stored path": item.source_path,
        "Package file": "",
        Bytes: "",
        "SHA-256": "",
        "Copy status": "MISSING - review in SoleTrader",
      });
    }
  }
  await writeReportPdf(
    joinPath(root, "06-supporting-files", "evidence-index.pdf"),
    "Supporting evidence index",
    reportSubtitle,
    evidenceIndex,
  );

  const counts: AccountantPackageCounts = {
    salesInvoices: invoices.length,
    expenses: expenses.length,
    supplierBills: supplierBills.length,
    supplierBillPayments: supplierBillPayments.length,
    accrualAdjustments: accrualAdjustments.length,
    bankTransactions: bankTransactions.length,
    unmatchedBankTransactions: bankTransactions.filter(
      (row) => row["Reconciliation status"] === "unmatched",
    ).length,
    mileageJourneys: mileage.length,
    vehicleCosts: vehicleCosts.length,
    capitalAssets: capitalAssets.length,
    vatReturns: vatReturns.length,
    cisTransactions: cisTransactions.length,
    selfBillingAgreements: selfBillingAgreements.length,
    supportingFiles: copied,
    missingSupportingFiles: missing,
  };
  const reconciliations = buildBankReconciliation(bankTransactions);
  const hmrcChecks: ExportRow[] =
    hmrc && hmrcData
      ? [
          {
            Check: "Official SA103 form mapping",
            Status: hmrcData.schedule.verified ? "Clear" : "Review",
            Result: `${hmrcData.schedule.form} · ${hmrcData.schedule.formVersion}`,
            Action: hmrcData.schedule.verified
              ? "None"
              : "Wait for the official tax-year form or use an HMRC-recognised filing product",
          },
          {
            Check: "HMRC declarations reviewed",
            Status:
              hmrcData.filing.reviewed === 1 &&
              hmrcData.filing.unsupported_circumstances_confirmed === 1
                ? "Clear"
                : "Review",
            Result:
              hmrcData.filing.reviewed === 1 ? "Reviewed" : "Not reviewed",
            Action: "Review and save the HMRC filing declarations",
          },
          {
            Check: "Profit calculation cross-foot",
            Status:
              Math.abs(
                hmrcData.calculation.bookkeepingIncome -
                  hmrcData.calculation.bookkeepingExpenses -
                  hmrcData.calculation.bookkeepingProfit,
              ) <= 0.01
                ? "Clear"
                : "Review",
            Result: `${money(hmrcData.calculation.bookkeepingIncome)} income less ${money(hmrcData.calculation.bookkeepingExpenses)} expenses equals ${money(hmrcData.calculation.bookkeepingProfit)} profit`,
            Action: "Reconcile the source ledgers to the bookkeeping profit",
          },
          ...hmrcData.schedule.reviewItems.map((item) => ({
            Check: "SA103 working schedule",
            Status: "Review",
            Result: item,
            Action: "Resolve before using the figures in a tax return",
          })),
        ]
      : [];
  const quality = buildDataQualityReport(counts, dashboard, reconciliations, [
    ...buildLedgerControlChecks({
      invoices,
      lineItems,
      expenses,
      expenseCategories,
    }),
    ...buildAccrualControlChecks({
      supplierBills,
      supplierBillPayments,
      accrualAdjustments,
    }),
    ...buildYearEndControlChecks({
      details: handoffDetails,
      bankConfirmations,
      yearStart: config.year_start,
      yearEnd: config.year_end,
    }),
    ...hmrcChecks,
  ]);
  const reviewItems = quality.filter((row) => row.Status === "Review").length;
  await Promise.all([
    writeReportPdf(
      joinPath(root, "03-bank", "reconciliation-summary.pdf"),
      "Bank reconciliation summary",
      reportSubtitle,
      reconciliations,
    ),
    writeReportPdf(
      joinPath(root, "00-summary", "data-quality-report.pdf"),
      "Data quality and control report",
      reportSubtitle,
      quality,
    ),
  ]);
  const manifest = buildAccountantManifest({
    businessName,
    proprietorName: `${profile.first_name} ${profile.last_name}`.trim(),
    taxYear,
    yearStart: config.year_start,
    yearEnd: config.year_end,
    accountingBasis: profile.accounting_basis,
    vatStatus: profile.vat_status,
    generatedAt: new Date(generatedAt).toLocaleString("en-GB"),
    counts,
    reviewItems,
    reconciledAccounts: reconciliations.length,
    audience,
  });
  await writeTextFile(joinPath(root, "README.txt"), manifest);
  const packageFiles = [
    "README.txt",
    summaryFileName,
    "00-summary/data-quality-report.pdf",
    "00-summary/package-manifest.json",
    "03-bank/reconciliation-summary.pdf",
    "06-supporting-files/evidence-index.pdf",
    ...ledgers.map(([relativePath]) => relativePath),
    ...evidenceIndex
      .map((row) => String(row["Package file"] || ""))
      .filter(Boolean)
      .map((name) => `06-supporting-files/${name}`),
    ...(hmrc
      ? ["00-summary/calculation-snapshot.json", "00-summary/SHA256SUMS.txt"]
      : []),
  ];
  await writeTextFile(
    joinPath(root, "00-summary", "package-manifest.json"),
    JSON.stringify(
      buildPackageManifest({
        generatedAt,
        schemaVersion,
        businessName,
        taxYear,
        accountingBasis: profile.accounting_basis,
        vatStatus: profile.vat_status,
        vatScheme: profile.vat_scheme,
        counts,
        reviewItems,
        ownerApproved: handoffDetails.approved === 1,
        bankAccountsConfirmed: bankConfirmations.filter(
          (row) => numeric(row["Full year confirmed"]) === 1,
        ).length,
        files: packageFiles,
        audience,
      }),
      null,
      2,
    ),
  );
  await writeFile(
    joinPath(root, summaryFileName),
    buildReportPdf([
      summaryDocument(
        dashboard,
        counts,
        reconciliations,
        quality,
        priorYearComparison,
        handoffDetails,
        audience,
      ),
    ]),
  );
  if (hmrc && hmrcData) {
    await writeTextFile(
      joinPath(root, "00-summary", "calculation-snapshot.json"),
      JSON.stringify(
        {
          format: "soletrader-hmrc-calculation",
          formatVersion: 1,
          generatedAt,
          taxYear,
          taxConfiguration: dashboard.config,
          form: hmrcData.schedule,
          calculation: hmrcData.calculation,
          taxEstimate: hmrcData.taxEstimate,
          declarations: hmrcData.filing,
          notice:
            "Preparation record only. This is not an HMRC submission receipt or evidence of acceptance.",
        },
        null,
        2,
      ),
    );
    const checksums = await Promise.all(
      packageFiles
        .filter((path) => path !== "00-summary/SHA256SUMS.txt")
        .sort()
        .map(
          async (path) =>
            `${await sha256(await readFile(joinPath(root, path)))}  ${path}`,
        ),
    );
    await writeTextFile(
      joinPath(root, "00-summary", "SHA256SUMS.txt"),
      `${checksums.join("\n")}\n`,
    );
  }
  return {
    directory: root,
    counts,
    reviewItems,
    reconciledAccounts: reconciliations.length,
  };
}

export function exportHmrcHandoffPackage(
  taxYear: string,
  dashboard: DashboardData,
  hmrcData: HmrcPackageData,
) {
  return exportAccountantPackage(taxYear, dashboard, "hmrc", hmrcData);
}

import { open } from "@tauri-apps/plugin-dialog";
import { mkdir, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";
import { query } from "@/lib/database";
import { readStoredFile } from "@/lib/receipt-storage";
import { buildReportPdf, type ReportDocument } from "@/lib/report-export";
import type { DashboardData } from "@/lib/queries/dashboard";

export interface AccountantPackageCounts {
  salesInvoices: number;
  expenses: number;
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

export function buildAccountantManifest(input: AccountantPackageManifestInput) {
  const { counts } = input;
  return [
    "SOLETRADER ACCOUNTANT HANDOFF",
    "=============================",
    "",
    `Business: ${input.businessName}`,
    `Proprietor: ${input.proprietorName || "Not recorded"}`,
    `Tax year: ${input.taxYear} (${input.yearStart} to ${input.yearEnd})`,
    `Accounting basis: ${input.accountingBasis}`,
    `VAT status: ${input.vatStatus}`,
    `Generated: ${input.generatedAt}`,
    "",
    "PACKAGE CONTENTS",
    "----------------",
    "00-summary: business details, handoff notes and package checks",
    "01-sales: invoices, line items, payments, credit notes and clients",
    "02-expenses: detailed expense ledger and category totals",
    "03-bank: imported transactions and reconciliation status",
    "04-vehicles: mileage journeys, vehicles and actual vehicle costs",
    "05-tax-and-vat: tax inputs, capital assets, CIS and VAT returns",
    "06-supporting-files: receipt images, documents and archived invoice PDFs",
    "",
    "RECORD COUNTS",
    "-------------",
    `Sales invoices: ${counts.salesInvoices}`,
    `Expenses: ${counts.expenses}`,
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
    "",
    "IMPORTANT",
    "---------",
    "This package reflects the records held in SoleTrader when it was generated. Tax and VAT calculations remain estimates and should be reviewed by a qualified accountant before filing.",
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

async function writeCsv(path: string, rows: ExportRow[]) {
  await writeTextFile(
    path,
    `\uFEFF${Papa.unparse(rows, { escapeFormulae: true })}`,
  );
}

function summaryDocument(
  dashboard: DashboardData,
  counts: AccountantPackageCounts,
): ReportDocument {
  const profile = dashboard.profile;
  const businessName =
    profile.trading_name || `${profile.first_name} ${profile.last_name}`.trim();
  return {
    title: "Accountant handoff summary",
    subtitle: `${businessName} · ${dashboard.config.tax_year} · ${dashboard.accountingBasis} basis`,
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
          ["Accounting basis", profile.accounting_basis],
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
          ["Supporting files copied", counts.supportingFiles],
          ["Referenced files not copied", counts.missingSupportingFiles],
        ],
      },
    ],
  };
}

export async function exportAccountantPackage(
  taxYear: string,
  dashboard: DashboardData,
): Promise<AccountantPackageResult | null> {
  const parent = await open({
    directory: true,
    recursive: true,
    multiple: false,
    title: "Choose where to save the accountant handoff",
  });
  if (!parent || Array.isArray(parent)) return null;
  const config = dashboard.config;
  const profile = dashboard.profile;
  const businessName =
    profile.trading_name ||
    `${profile.first_name} ${profile.last_name}`.trim() ||
    "SoleTrader business";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const root = joinPath(
    parent,
    `${safePackageName(businessName)}-accountant-${taxYear.replace("/", "-")}-${stamp}`,
  );
  const folders = [
    "00-summary",
    "01-sales",
    "02-expenses",
    "03-bank",
    "04-vehicles",
    "05-tax-and-vat",
    "06-supporting-files",
  ];

  const schemaRows = await query<{ version: number }>(
    "SELECT version FROM workspace_schema LIMIT 1",
  );
  const supportsSelfBilling = (schemaRows[0]?.version ?? 0) >= 18;

  const [
    invoices,
    lineItems,
    payments,
    creditNotes,
    clients,
    expenses,
    expenseCategories,
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
      `SELECT e.id AS "Expense ID", e.date AS "Date", e.supplier AS "Supplier", e.description AS "Description", c.name AS "Category", e.amount AS "Gross paid", e.vat_amount AS "VAT", e.business_percent AS "Business use %", ROUND((e.amount - CASE WHEN ? != 'unregistered' THEN e.vat_amount ELSE 0 END) * e.business_percent / 100, 2) AS "Allowable amount", e.receipt_path AS "Receipt file", e.notes AS "Notes", e.is_bad_debt AS "Bad debt" FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? ORDER BY e.date, e.id`,
      [profile.vat_status, config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT c.name AS "Category", COUNT(*) AS "Transactions", ROUND(SUM(e.amount), 2) AS "Gross paid", ROUND(SUM(e.vat_amount * e.business_percent / 100), 2) AS "Business VAT", ROUND(SUM((e.amount - CASE WHEN ? != 'unregistered' THEN e.vat_amount ELSE 0 END) * e.business_percent / 100), 2) AS "Allowable amount" FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ? GROUP BY c.id ORDER BY "Allowable amount" DESC`,
      [profile.vat_status, config.year_start, config.year_end],
    ),
    query<ExportRow>(
      `SELECT transaction_date AS "Date", description AS "Description", amount_in AS "Money in", amount_out AS "Money out", balance AS "Balance", status AS "Reconciliation status", match_confidence AS "Match confidence", matched_invoice_id AS "Matched invoice ID", matched_payment_id AS "Matched payment ID", matched_expense_id AS "Matched expense ID", source_file AS "Statement file", raw_data AS "Original statement row" FROM bank_transactions WHERE transaction_date BETWEEN ? AND ? ORDER BY transaction_date, id`,
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
      `SELECT c.id AS "Cost ID", c.date AS "Date", v.name AS "Vehicle", v.registration AS "Registration", c.cost_type AS "Cost type", c.description AS "Description", c.amount AS "Gross paid", c.vat_amount AS "VAT", c.business_percent AS "Business use %", ROUND((c.amount - CASE WHEN ? != 'unregistered' THEN c.vat_amount ELSE 0 END) * c.business_percent / 100, 2) AS "Allowable amount", c.receipt_path AS "Receipt file", c.notes AS "Notes" FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id WHERE c.deleted_at IS NULL AND c.date BETWEEN ? AND ? ORDER BY c.date, c.id`,
      [profile.vat_status, config.year_start, config.year_end],
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

  await mkdir(root, { recursive: true });
  await Promise.all(
    folders.map((folder) => mkdir(joinPath(root, folder), { recursive: true })),
  );

  const ledgers: [string, ExportRow[]][] = [
    ["01-sales/invoices.csv", invoices],
    ["01-sales/invoice-line-items.csv", lineItems],
    ["01-sales/payments-received.csv", payments],
    ["01-sales/credit-notes.csv", creditNotes],
    ["01-sales/clients.csv", clients],
    ["02-expenses/expenses.csv", expenses],
    ["02-expenses/category-summary.csv", expenseCategories],
    ["03-bank/bank-transactions.csv", bankTransactions],
    ["03-bank/imported-statements.csv", bankBatches],
    ["04-vehicles/vehicles.csv", vehicles],
    ["04-vehicles/mileage-log.csv", mileage],
    ["04-vehicles/vehicle-costs.csv", vehicleCosts],
    ["05-tax-and-vat/capital-assets.csv", capitalAssets],
    ["05-tax-and-vat/vat-returns.csv", vatReturns],
    ["05-tax-and-vat/cis-transactions.csv", cisTransactions],
    ["05-tax-and-vat/self-billing-agreements.csv", selfBillingAgreements],
    ["05-tax-and-vat/self-assessment-inputs.csv", taxInputs],
    ["00-summary/business-details.csv", businessDetails],
    ["00-summary/vat-settings.csv", vatSettings],
    ["00-summary/opening-balances.csv", openingBalances],
    ["00-summary/documents-register.csv", documents],
  ];
  await Promise.all(
    ledgers.map(([relativePath, rows]) =>
      writeCsv(joinPath(root, relativePath), rows),
    ),
  );

  const evidenceIndex: ExportRow[] = [];
  let copied = 0;
  let missing = 0;
  for (const [index, item] of evidence.entries()) {
    const packageName = evidenceFileName(index + 1, item.source_path);
    try {
      await writeFile(
        joinPath(root, "06-supporting-files", packageName),
        await readStoredFile(item.source_path),
      );
      copied += 1;
      evidenceIndex.push({
        "Record type": item.record_type,
        "Record reference": item.record_reference,
        Description: item.original_name,
        "Original stored path": item.source_path,
        "Package file": packageName,
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
        "Copy status": "MISSING - review in SoleTrader",
      });
    }
  }
  await writeCsv(
    joinPath(root, "06-supporting-files", "evidence-index.csv"),
    evidenceIndex,
  );

  const counts: AccountantPackageCounts = {
    salesInvoices: invoices.length,
    expenses: expenses.length,
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
  const manifest = buildAccountantManifest({
    businessName,
    proprietorName: `${profile.first_name} ${profile.last_name}`.trim(),
    taxYear,
    yearStart: config.year_start,
    yearEnd: config.year_end,
    accountingBasis: profile.accounting_basis,
    vatStatus: profile.vat_status,
    generatedAt: new Date().toLocaleString("en-GB"),
    counts,
  });
  await writeTextFile(joinPath(root, "README.txt"), manifest);
  await writeFile(
    joinPath(root, "00-summary", "accountant-summary.pdf"),
    buildReportPdf([summaryDocument(dashboard, counts)]),
  );
  return { directory: root, counts };
}

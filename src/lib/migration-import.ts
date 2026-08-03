import {
  parseBankAmount,
  parseBankDate,
  taxYearForBankDate,
} from "@/lib/bank-import";

export type MigrationKind = "clients" | "expenses";
export type MigrationMapping = Record<string, string>;

export interface MigrationPreviewRow {
  rowNumber: number;
  values: Record<string, string | number>;
  error: string;
}

export const migrationFields = {
  clients: [
    "name",
    "company",
    "email",
    "phone",
    "address",
    "city",
    "county",
    "postcode",
    "notes",
  ],
  expenses: [
    "date",
    "supplier",
    "description",
    "amount",
    "vat",
    "businessPercent",
    "category",
    "notes",
  ],
} satisfies Record<MigrationKind, string[]>;

const aliases: Record<string, RegExp[]> = {
  name: [/^name$/, /client name|contact name|customer name/],
  company: [/company|business|organisation/],
  email: [/e.?mail/],
  phone: [/phone|telephone|mobile/],
  address: [/address( line 1)?|street/],
  city: [/city|town/],
  county: [/county|region/],
  postcode: [/post.?code|zip/],
  notes: [/notes?|memo/],
  date: [/^date$/, /expense date|transaction date|paid date/],
  supplier: [/supplier|merchant|payee|vendor/],
  description: [/description|details|item|narrative/],
  amount: [/^amount$|total|gross/],
  vat: [/vat|tax amount/],
  businessPercent: [/business.*%|business percent|business use/],
  category: [/category|expense type|account/],
};

const clean = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();

export function suggestMigrationMapping(
  kind: MigrationKind,
  headers: string[],
): MigrationMapping {
  return Object.fromEntries(
    migrationFields[kind].map((field) => [
      field,
      headers.find((header) =>
        (aliases[field] ?? []).some((pattern) => pattern.test(clean(header))),
      ) ?? "",
    ]),
  );
}

export function mapMigrationRows(
  kind: MigrationKind,
  rows: Record<string, string>[],
  mapping: MigrationMapping,
): MigrationPreviewRow[] {
  return rows.map<MigrationPreviewRow>((source, index) => {
    const text = (field: string) => String(source[mapping[field]] ?? "").trim();
    const errors: string[] = [];
    if (kind === "clients") {
      const name = text("name");
      if (!name) errors.push("Missing client name");
      const values: Record<string, string | number> = {
        name,
        company: text("company"),
        email: text("email"),
        phone: text("phone"),
        address: text("address"),
        city: text("city"),
        county: text("county"),
        postcode: text("postcode").toUpperCase(),
        notes: text("notes"),
      };
      return { rowNumber: index + 2, values, error: errors.join("; ") };
    }
    const date = parseBankDate(text("date"));
    const amount = parseBankAmount(text("amount"));
    const vat = text("vat") ? parseBankAmount(text("vat")) : 0;
    const businessPercent = text("businessPercent")
      ? parseBankAmount(text("businessPercent"))
      : 100;
    const description = text("description");
    if (!date) errors.push("Invalid date");
    if (!description) errors.push("Missing description");
    if (!Number.isFinite(amount) || amount <= 0)
      errors.push("Amount must be greater than zero");
    if (!Number.isFinite(vat) || vat < 0 || vat > amount)
      errors.push("Invalid VAT");
    if (
      !Number.isFinite(businessPercent) ||
      businessPercent <= 0 ||
      businessPercent > 100
    )
      errors.push("Business use must be 1-100%");
    const values: Record<string, string | number> = {
      date,
      supplier: text("supplier"),
      description,
      amount,
      vat,
      businessPercent,
      category: text("category"),
      notes: text("notes"),
      taxYear: date ? taxYearForBankDate(date) : "",
    };
    return { rowNumber: index + 2, values, error: errors.join("; ") };
  });
}

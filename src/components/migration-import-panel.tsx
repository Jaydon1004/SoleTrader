import { useEffect, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseCsv } from "@/lib/bank-import";
import {
  mapMigrationRows,
  migrationFields,
  migrationTemplateCsv,
  suggestMigrationMapping,
  type MigrationKind,
  type MigrationMapping,
} from "@/lib/migration-import";
import { useExpenseCategories } from "@/lib/queries/expenses";
import { useMigrationImport } from "@/lib/queries/migration-import";

const labels: Record<string, string> = {
  name: "Client name",
  company: "Company",
  email: "Email",
  phone: "Phone",
  address: "Address",
  city: "Town / city",
  county: "County",
  postcode: "Postcode",
  notes: "Notes",
  date: "Date",
  supplier: "Supplier",
  description: "Description",
  amount: "Amount",
  vat: "VAT",
  businessPercent: "Business use %",
  category: "Category",
  type: "Income type",
  paymentMethod: "Payment method",
};
const required = {
  clients: new Set(["name"]),
  expenses: new Set(["date", "description", "amount"]),
  income: new Set(["date", "description", "amount"]),
};

function ColumnSelect({
  field,
  value,
  headers,
  needed,
  onChange,
}: {
  field: string;
  value: string;
  headers: string[];
  needed: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {labels[field] ?? field}
        {needed ? " *" : ""}
      </Label>
      <Select
        value={value || "none"}
        onValueChange={(next) => onChange(next === "none" ? "" : next)}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not mapped</SelectItem>
          {headers.map((header) => (
            <SelectItem key={header} value={header}>
              {header}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MigrationImportPanel() {
  const [kind, setKind] = useState<MigrationKind>("clients");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<MigrationMapping>({});
  const [defaultCategory, setDefaultCategory] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    invalid: number;
  } | null>(null);
  const { data: categories } = useExpenseCategories();
  const importer = useMigrationImport();
  useEffect(() => {
    setMapping(suggestMigrationMapping(kind, headers));
    setResult(null);
  }, [headers, kind]);
  const rows = mapMigrationRows(kind, rawRows, mapping);
  const requiredMapped = [...required[kind]].every((field) => mapping[field]);
  const validRows = rows.filter((row) => !row.error);
  const chooseFile = async () => {
    setError("");
    setResult(null);
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "CSV spreadsheet", extensions: ["csv", "txt"] }],
      });
      if (!selected) return;
      const parsed = parseCsv(await readTextFile(selected));
      if (!parsed.headers.length || !parsed.rows.length)
        throw new Error("No headed CSV rows were found.");
      setFileName(selected.split(/[\\/]/).pop() ?? "migration.csv");
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      if (parsed.errors.length) setError(parsed.errors.slice(0, 3).join(" "));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "CSV could not be opened.",
      );
    }
  };
  const runImport = async () => {
    setError("");
    try {
      setResult(
        await importer.mutateAsync({
          kind,
          rows,
          defaultCategoryId: defaultCategory
            ? Number(defaultCategory)
            : undefined,
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Records could not be imported.",
      );
    }
  };
  const saveTemplate = async () => {
    setError("");
    try {
      const destination = await save({
        defaultPath: `soletrader-${kind}-template.csv`,
        filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
      });
      if (!destination) return;
      await writeTextFile(destination, migrationTemplateCsv(kind));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The template could not be saved.",
      );
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Spreadsheet migration</CardTitle>
        <CardDescription>
          Import clients, historical expenses, or direct income from any headed
          CSV. Review mapping and validation before records are written.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Record type</Label>
            <Select
              value={kind}
              onValueChange={(value) => setKind(value as MigrationKind)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clients">Clients</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="income">Direct income</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="font-medium">
              {fileName || "No spreadsheet selected"}
            </p>
            <p className="text-xs text-muted-foreground">
              CSV or text export with one header row.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => void saveTemplate()}>
              <Download className="mr-2 h-4 w-4" />
              Save template
            </Button>
            <Button variant="outline" onClick={chooseFile}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Choose CSV
            </Button>
          </div>
        </div>
        {headers.length > 0 && (
          <>
            <div>
              <h3 className="mb-3 text-sm font-semibold">Column mapping</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {migrationFields[kind].map((field) => (
                  <ColumnSelect
                    key={field}
                    field={field}
                    value={mapping[field] ?? ""}
                    headers={headers}
                    needed={required[kind].has(field)}
                    onChange={(value) =>
                      setMapping((current) => ({ ...current, [field]: value }))
                    }
                  />
                ))}
              </div>
            </div>
            {kind === "expenses" && (
              <div className="max-w-sm space-y-1.5">
                <Label>Fallback category *</Label>
                <Select
                  value={defaultCategory || "none"}
                  onValueChange={(value) =>
                    setDefaultCategory(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose category</SelectItem>
                    {(categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used when a CSV category does not exactly match an existing
                  category.
                </p>
              </div>
            )}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Preview</h3>
                <div className="flex gap-2">
                  <Badge variant="success">{validRows.length} valid</Badge>
                  {rows.length > validRows.length && (
                    <Badge variant="destructive">
                      {rows.length - validRows.length} invalid
                    </Badge>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-auto rounded-md border">
                <div className="grid min-w-180 grid-cols-[70px_120px_minmax(220px,1fr)_130px_160px] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                  <span>CSV row</span>
                  <span>{kind === "clients" ? "Name" : "Date"}</span>
                  <span>
                    {kind === "clients" ? "Company / email" : "Description"}
                  </span>
                  <span>{kind === "clients" ? "Postcode" : "Amount"}</span>
                  <span>Result</span>
                </div>
                {rows.slice(0, 100).map((row) => (
                  <div
                    key={row.rowNumber}
                    className="grid min-w-180 grid-cols-[70px_120px_minmax(220px,1fr)_130px_160px] gap-3 border-b px-3 py-2 text-xs last:border-0"
                  >
                    <span>{row.rowNumber}</span>
                    <span className="truncate">
                      {String(
                        row.values[kind === "clients" ? "name" : "date"] ||
                          "Missing",
                      )}
                    </span>
                    <span className="truncate">
                      {kind === "clients"
                        ? [row.values.company, row.values.email]
                            .filter(Boolean)
                            .join(" / ")
                        : row.values.description}
                    </span>
                    <span>
                      {kind === "clients"
                        ? row.values.postcode
                        : row.values.amount}
                    </span>
                    <span
                      className={
                        row.error ? "text-destructive" : "text-emerald-700"
                      }
                    >
                      {row.error || "Ready"}
                    </span>
                  </div>
                ))}
              </div>
              {rows.length > 100 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing 100 of {rows.length} rows. All valid rows will be
                  processed.
                </p>
              )}
            </div>
          </>
        )}
        {result && (
          <Alert variant="success">
            <Check className="h-4 w-4" />
            <AlertTitle>Import complete</AlertTitle>
            <AlertDescription>
              {result.imported} imported, {result.duplicates} duplicates
              skipped, {result.invalid} invalid rows skipped.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {headers.length > 0 && !result && (
          <div className="flex justify-end">
            <Button
              onClick={runImport}
              disabled={
                !requiredMapped ||
                !validRows.length ||
                (kind === "expenses" && !defaultCategory) ||
                importer.isPending
              }
            >
              <Upload className="mr-2 h-4 w-4" />
              {importer.isPending
                ? "Importing"
                : `Import ${validRows.length} valid rows`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

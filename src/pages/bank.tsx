import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, stat } from "@tauri-apps/plugin-fs";
import {
  Check,
  CircleAlert,
  FileSpreadsheet,
  Link2,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  checkBankBalances,
  decodeBankStatement,
  findBankMatch,
  type BankColumnMapping,
  type BankImportRow,
  mapBankRows,
  parseBankStatement,
  suggestBankMapping,
} from "@/lib/bank-import";
import {
  type BankTransaction,
  useBankImportBatches,
  useBankMatchOptions,
  useBankReconciliationSettings,
  useBankTransactions,
  useCheckBankDuplicates,
  useCreateExpenseFromBank,
  useIgnoreBankTransaction,
  useImportBankTransactions,
  useMatchBankTransaction,
  useRecordInvoicePaymentFromBank,
  useUnmatchBankTransaction,
  useUpdateBankReconciliationSettings,
} from "@/lib/queries/bank-reconciliation";
import { useExpenseCategories } from "@/lib/queries/expenses";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useInvoice } from "@/lib/queries/invoices";
import { SelfBilledSettlementForm } from "@/components/invoices/self-billed-settlement-form";
import {
  EmptyState,
  FilterToolbar,
  PageHeader,
  PageSkeleton,
  QueryErrorState,
  SummaryTile,
} from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const MAX_STATEMENT_BYTES = 10 * 1024 * 1024;
const emptyMapping: BankColumnMapping = {
  date: "",
  description: "",
  amountIn: "",
  amountOut: "",
  amount: "",
  balance: "",
};
const errorMessage = (caught: unknown, fallback: string) => {
  if (caught instanceof Error) return caught.message;
  if (typeof caught === "string" && caught.trim()) return caught;
  if (
    caught &&
    typeof caught === "object" &&
    "message" in caught &&
    typeof caught.message === "string"
  )
    return caught.message;
  return fallback;
};

function ColumnSelect({
  label,
  value,
  headers,
  required,
  onChange,
}: {
  label: string;
  value: string;
  headers: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? " *" : ""}
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

function ImportDialog({
  open: isOpen,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importer = useImportBankTransactions();
  const {
    mutateAsync: checkDuplicateFingerprints,
    isPending: isCheckingDuplicates,
  } = useCheckBankDuplicates();
  const [sourceFile, setSourceFile] = useState("");
  const [detectedFormat, setDetectedFormat] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<BankColumnMapping>(emptyMapping);
  const [rows, setRows] = useState<BankImportRow[]>([]);
  const [duplicateRows, setDuplicateRows] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    matched: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSourceFile("");
    setDetectedFormat("");
    setHeaders([]);
    setRawRows([]);
    setMapping(emptyMapping);
    setRows([]);
    setDuplicateRows(new Set());
    setError("");
    setResult(null);
  }, [isOpen]);

  useEffect(() => {
    if (
      !rawRows.length ||
      !mapping.date ||
      !mapping.description ||
      (!mapping.amount && !mapping.amountIn && !mapping.amountOut)
    ) {
      setRows([]);
      setDuplicateRows(new Set());
      return;
    }
    let active = true;
    const mapped = mapBankRows(rawRows, mapping);
    setRows(mapped);
    void checkDuplicateFingerprints(
      mapped.filter((row) => !row.error).map((row) => row.fingerprint),
    ).then((existing) => {
      if (!active) return;
      const existingHashes = new Set(existing);
      const seen = new Set<string>();
      const duplicates = new Set<string>();
      mapped
        .filter((row) => !row.error)
        .forEach((row) => {
          if (existingHashes.has(row.fingerprint) || seen.has(row.fingerprint))
            duplicates.add(`${row.rowNumber}:${row.fingerprint}`);
          seen.add(row.fingerprint);
        });
      setDuplicateRows(duplicates);
    });
    return () => {
      active = false;
    };
  }, [checkDuplicateFingerprints, mapping, rawRows]);

  const chooseFile = async () => {
    setError("");
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Bank statement",
            extensions: ["csv", "txt", "tsv", "qif", "ofx", "qfx", "dat"],
          },
        ],
      });
      if (!selected) return;
      const file = await stat(selected);
      if (file.size > MAX_STATEMENT_BYTES) {
        throw new Error(
          "This statement is larger than 10 MB. Export smaller date ranges and import them separately.",
        );
      }
      const text = decodeBankStatement(await readFile(selected));
      const parsed = parseBankStatement(text);
      if (!parsed.headers.length || !parsed.rows.length)
        throw new Error("No transaction rows were found in this statement.");
      setSourceFile(selected.split(/[\\/]/).pop() ?? "bank-statement.csv");
      setDetectedFormat(parsed.format);
      setHeaders(parsed.headers);
      setRawRows(parsed.rows);
      setMapping(suggestBankMapping(parsed.headers));
      if (parsed.errors.length) setError(parsed.errors.slice(0, 3).join(" "));
    } catch (caught) {
      setError(errorMessage(caught, "Statement could not be opened."));
    }
  };
  const validRows = rows.filter((row) => !row.error);
  const balanceCheck = checkBankBalances(rows);
  const duplicateCount = validRows.filter((row) =>
    duplicateRows.has(`${row.rowNumber}:${row.fingerprint}`),
  ).length;
  const importRows = async () => {
    try {
      setResult(await importer.mutateAsync({ sourceFile, rows }));
    } catch (caught) {
      setError(errorMessage(caught, "Statement could not be imported."));
    }
  };
  const setColumn = <K extends keyof BankColumnMapping>(
    key: K,
    value: BankColumnMapping[K],
  ) => setMapping((current) => ({ ...current, [key]: value }));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import bank statement</DialogTitle>
          <DialogDescription>
            Open a common bank export, verify every normalized transaction, then
            import valid non-duplicates.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-5 py-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">Imported</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {result.imported}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">Auto-matched</p>
                  <p className="mt-1 text-3xl font-semibold text-emerald-700">
                    {result.matched}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">
                    Duplicates skipped
                  </p>
                  <p className="mt-1 text-3xl font-semibold">
                    {result.duplicates}
                  </p>
                </CardContent>
              </Card>
            </div>
            <Alert variant="success">
              <Check className="h-4 w-4" />
              <AlertTitle>Import complete</AlertTitle>
              <AlertDescription>
                Unmatched transactions are ready in the reconciliation queue.
              </AlertDescription>
            </Alert>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>
                Review transactions
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 rounded-md border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">
                    {sourceFile || "Choose a bank statement"}
                  </p>
                  {detectedFormat && (
                    <Badge variant="success">{detectedFormat} detected</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Supports CSV, TSV, labelled text statements, QIF, OFX, and QFX
                  exports.
                </p>
              </div>
              <Button variant="outline" onClick={chooseFile}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {sourceFile ? "Replace file" : "Choose file"}
              </Button>
            </div>
            {headers.length > 0 && (
              <>
                <div>
                  <h3 className="mb-3 text-sm font-semibold">Column mapping</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ColumnSelect
                      label="Date"
                      required
                      value={mapping.date}
                      headers={headers}
                      onChange={(value) => setColumn("date", value)}
                    />
                    <ColumnSelect
                      label="Description"
                      required
                      value={mapping.description}
                      headers={headers}
                      onChange={(value) => setColumn("description", value)}
                    />
                    <ColumnSelect
                      label="Amount in"
                      value={mapping.amountIn}
                      headers={headers}
                      onChange={(value) => setColumn("amountIn", value)}
                    />
                    <ColumnSelect
                      label="Amount out"
                      value={mapping.amountOut}
                      headers={headers}
                      onChange={(value) => setColumn("amountOut", value)}
                    />
                    <ColumnSelect
                      label="Single signed amount"
                      value={mapping.amount}
                      headers={headers}
                      onChange={(value) => setColumn("amount", value)}
                    />
                    <ColumnSelect
                      label="Balance"
                      value={mapping.balance}
                      headers={headers}
                      onChange={(value) => setColumn("balance", value)}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Map separate money-in/out columns or one signed amount
                    column.
                  </p>
                </div>
                {balanceCheck.checked >= 2 &&
                  (balanceCheck.mismatches === 0 ? (
                    <Alert variant="success">
                      <Check className="h-4 w-4" />
                      <AlertTitle>Balances verified</AlertTitle>
                      <AlertDescription>
                        All {balanceCheck.checked} consecutive balance changes
                        agree with the transaction amounts.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <Alert variant="destructive">
                      <CircleAlert className="h-4 w-4" />
                      <AlertTitle>Balance check failed</AlertTitle>
                      <AlertDescription>
                        {balanceCheck.mismatches} of {balanceCheck.checked}{" "}
                        consecutive balance changes do not agree with the
                        transaction amounts. Check the amount and balance
                        mappings before importing.
                      </AlertDescription>
                    </Alert>
                  ))}
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Import preview</h3>
                    <div className="flex gap-2">
                      <Badge variant="success">
                        {validRows.length - duplicateCount} ready
                      </Badge>
                      {duplicateCount > 0 && (
                        <Badge variant="warning">
                          {duplicateCount} duplicates
                        </Badge>
                      )}
                      {rows.length - validRows.length > 0 && (
                        <Badge variant="destructive">
                          {rows.length - validRows.length} invalid
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="max-h-80 overflow-auto rounded-md border">
                    <div className="grid min-w-190 grid-cols-[80px_110px_minmax(220px,1fr)_110px_110px_110px_120px] gap-3 border-b bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                      <span>Row</span>
                      <span>Date</span>
                      <span>Description</span>
                      <span className="text-right">Money in</span>
                      <span className="text-right">Money out</span>
                      <span className="text-right">Balance</span>
                      <span>Result</span>
                    </div>
                    {rows.slice(0, 200).map((row) => (
                      <div
                        key={`${row.rowNumber}-${row.fingerprint}`}
                        className="grid min-w-190 grid-cols-[80px_110px_minmax(220px,1fr)_110px_110px_110px_120px] gap-3 border-b px-3 py-2 text-xs last:border-0"
                      >
                        <span>{row.rowNumber}</span>
                        <span>{row.transactionDate || "Invalid"}</span>
                        <span className="truncate">
                          {row.description || "Missing"}
                        </span>
                        <span className="text-right">
                          {row.amountIn ? money.format(row.amountIn) : ""}
                        </span>
                        <span className="text-right">
                          {row.amountOut ? money.format(row.amountOut) : ""}
                        </span>
                        <span className="text-right">
                          {row.balance === null
                            ? ""
                            : money.format(row.balance)}
                        </span>
                        <span>
                          {row.error ? (
                            <span className="text-destructive">
                              {row.error}
                            </span>
                          ) : duplicateRows.has(
                              `${row.rowNumber}:${row.fingerprint}`,
                            ) ? (
                            <span className="text-amber-700">
                              Skip duplicate
                            </span>
                          ) : (
                            <span className="text-emerald-700">Ready</span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {rows.length > 200 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Showing 200 of {rows.length} rows. All valid rows will be
                      imported.
                    </p>
                  )}
                </div>
              </>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        )}
        {!result && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={importRows}
              disabled={
                !validRows.length ||
                validRows.length === duplicateCount ||
                balanceCheck.mismatches > 0 ||
                importer.isPending ||
                isCheckingDuplicates
              }
            >
              <Upload className="mr-2 h-4 w-4" />
              {importer.isPending
                ? "Importing"
                : `Import ${Math.max(0, validRows.length - duplicateCount)} rows`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResolveDialog({
  transaction,
  open: isOpen,
  onOpenChange,
  embedded = false,
}: {
  transaction: BankTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedded?: boolean;
}) {
  const { data: options } = useBankMatchOptions();
  const { data: categories } = useExpenseCategories();
  const { data: reconciliationSettings } = useBankReconciliationSettings();
  const match = useMatchBankTransaction();
  const createExpense = useCreateExpenseFromBank();
  const recordPayment = useRecordInvoicePaymentFromBank();
  const [candidateId, setCandidateId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [vat, setVat] = useState("");
  const [businessPercent, setBusinessPercent] = useState("100");
  const [error, setError] = useState("");
  const { data: selectedInvoice } = useInvoice(
    invoiceId ? Number(invoiceId) : null,
  );
  useEffect(() => {
    if (!transaction || !isOpen) return;
    setCandidateId("");
    setInvoiceId("");
    setCategoryId("");
    setSupplier(transaction.description);
    setDescription(transaction.description);
    setVat("");
    setBusinessPercent("100");
    setError("");
  }, [isOpen, transaction]);
  if (!transaction) return null;
  const incoming = transaction.amount_in > 0;
  const candidates = incoming
    ? (options?.payments ?? [])
    : (options?.expenses ?? []);
  const transactionAmount = transaction.amount_in || transaction.amount_out;
  const suggestion = findBankMatch(
    transaction.transaction_date,
    transactionAmount,
    candidates,
    reconciliationSettings?.match_tolerance_days ?? 3,
    reconciliationSettings?.amount_tolerance ?? 0.01,
  );
  const selectedCandidate = candidates.find(
    (candidate) => candidate.id === Number(candidateId),
  );
  const candidateReason = (candidate: (typeof candidates)[number]) => {
    const days = Math.round(
      Math.abs(
        new Date(`${transaction.transaction_date}T00:00:00`).getTime() -
          new Date(`${candidate.date}T00:00:00`).getTime(),
      ) / 86_400_000,
    );
    const amountDifference = Math.abs(transactionAmount - candidate.amount);
    return `${amountDifference < 0.005 ? "Exact amount" : `${money.format(amountDifference)} difference`} · ${days === 0 ? "same date" : `${days} day${days === 1 ? "" : "s"} apart`}`;
  };
  const selectedInvoiceOption = options?.invoices.find(
    (invoice) => invoice.id === Number(invoiceId),
  );
  const link = async () => {
    const candidate = candidates.find(
      (item) => item.id === Number(candidateId),
    );
    if (!candidate) return setError("Select a recorded item.");
    await match.mutateAsync({
      transactionId: transaction.id,
      kind: incoming ? "payment" : "expense",
      candidate,
    });
    onOpenChange(false);
  };
  const create = async () => {
    try {
      if (incoming) {
        if (!invoiceId) return setError("Select an outstanding invoice.");
        await recordPayment.mutateAsync({
          transaction,
          invoiceId: Number(invoiceId),
        });
      } else {
        if (!categoryId) return setError("Select an expense category.");
        const parsedVat = Number(vat) || 0;
        const parsedBusiness = Number(businessPercent);
        if (parsedVat < 0 || parsedVat > transaction.amount_out)
          return setError(
            "VAT must be between zero and the transaction amount.",
          );
        if (parsedBusiness <= 0 || parsedBusiness > 100)
          return setError("Business use must be between 1% and 100%.");
        await createExpense.mutateAsync({
          transaction,
          categoryId: Number(categoryId),
          supplier,
          description,
          vatAmount: parsedVat,
          businessPercent: parsedBusiness,
        });
      }
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Transaction could not be reconciled.",
      );
    }
  };
  const content = (
    <>
      <div>
        <h2 className="font-semibold">Reconcile transaction</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {transaction.transaction_date} · {transaction.description} ·{" "}
          {money.format(transaction.amount_in || transaction.amount_out)}
        </p>
      </div>
      <Tabs defaultValue="recorded">
        <TabsList>
          <TabsTrigger value="recorded">Link recorded</TabsTrigger>
          <TabsTrigger value="create">
            {incoming ? "Record invoice payment" : "Create expense"}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="recorded" className="space-y-4 pt-4">
          {suggestion ? (
            <Alert
              variant={suggestion.confidence === "exact" ? "success" : "info"}
            >
              <AlertTitle>
                {suggestion.confidence === "exact"
                  ? "Exact match suggested"
                  : "Possible match suggested"}
              </AlertTitle>
              <AlertDescription className="mt-2">
                <p>{suggestion.label}</p>
                <p className="mt-1 text-xs">{candidateReason(suggestion)}</p>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  onClick={() => setCandidateId(String(suggestion.id))}
                >
                  Use this match
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="info">
              <AlertTitle>No automatic match</AlertTitle>
              <AlertDescription>
                No unique record is within the configured date and amount
                tolerances. Review the available records manually.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>
              {incoming ? "Recorded invoice payment" : "Recorded expense"}
            </Label>
            <Select
              value={candidateId || "none"}
              onValueChange={(value) =>
                setCandidateId(value === "none" ? "" : value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select a record</SelectItem>
                {candidates.map((candidate) => (
                  <SelectItem key={candidate.id} value={String(candidate.id)}>
                    {candidate.date} · {candidate.label} ·{" "}
                    {money.format(candidate.amount)} ·{" "}
                    {candidateReason(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCandidate && (
              <p className="text-xs text-muted-foreground">
                Why this may match: {candidateReason(selectedCandidate)}.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button onClick={link} disabled={!candidateId || match.isPending}>
              <Link2 className="mr-2 h-4 w-4" />
              Link record
            </Button>
          </div>
        </TabsContent>
        <TabsContent value="create" className="space-y-4 pt-4">
          {incoming ? (
            <div className="space-y-2">
              <Label>Outstanding invoice</Label>
              <Select
                value={invoiceId || "none"}
                onValueChange={(value) =>
                  setInvoiceId(value === "none" ? "" : value)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Select invoice</SelectItem>
                  {(options?.invoices ?? [])
                    .filter(
                      (invoice) =>
                        invoice.balance + 0.005 >= transaction.amount_in,
                    )
                    .map((invoice) => (
                      <SelectItem key={invoice.id} value={String(invoice.id)}>
                        {invoice.label} · {money.format(invoice.balance)}{" "}
                        outstanding
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {selectedInvoiceOption?.source_type === "self_billed" &&
                selectedInvoice && (
                  <SelfBilledSettlementForm
                    invoice={selectedInvoice}
                    bankTransaction={transaction}
                    onCancel={() => setInvoiceId("")}
                    onSaved={() => onOpenChange(false)}
                  />
                )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={categoryId || "none"}
                  onValueChange={(value) =>
                    setCategoryId(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select category</SelectItem>
                    {(categories ?? []).map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>VAT included</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vat}
                  onChange={(event) => setVat(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Business use %</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={businessPercent}
                  onChange={(event) => setBusinessPercent(event.target.value)}
                />
              </div>
            </div>
          )}
          {selectedInvoiceOption?.source_type !== "self_billed" && (
            <div className="flex justify-end">
              <Button
                onClick={create}
                disabled={createExpense.isPending || recordPayment.isPending}
              >
                <Check className="mr-2 h-4 w-4" />
                {incoming ? "Record payment" : "Create expense"}
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
  if (embedded) return <div className="space-y-4">{content}</div>;
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-4xl overflow-y-auto">
        {content}
      </DialogContent>
    </Dialog>
  );
}

export function BankPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taxYearQuery = useTaxYearConfigs();
  const settingsQuery = useBankReconciliationSettings();
  const batchQuery = useBankImportBatches();
  const { data: taxYears } = taxYearQuery;
  const { data: settings } = settingsQuery;
  const updateSettings = useUpdateBankReconciliationSettings();
  const ignore = useIgnoreBankTransaction();
  const unmatch = useUnmatchBankTransaction();
  const { data: batches } = batchQuery;
  const [taxYear, setTaxYear] = useState("all");
  const [status, setStatus] = useState(() =>
    ["all", "matched", "ignored"].includes(searchParams.get("status") ?? "")
      ? searchParams.get("status")!
      : "unmatched",
  );
  const [search, setSearch] = useState("");
  const {
    data: transactions,
    isLoading,
    error,
    isFetching,
    refetch,
  } = useBankTransactions({ taxYear, status, search });
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<BankTransaction | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [days, setDays] = useState("3");
  const [amountTolerance, setAmountTolerance] = useState("0.01");
  const { confirm, toast } = useFeedback();
  useEffect(() => {
    if (settings) {
      setDays(String(settings.match_tolerance_days));
      setAmountTolerance(String(settings.amount_tolerance));
    }
  }, [settings]);
  const rows = transactions ?? [];
  const totalIn = rows.reduce((sum, row) => sum + row.amount_in, 0);
  const totalOut = rows.reduce((sum, row) => sum + row.amount_out, 0);
  const matched = rows.filter((row) => row.status === "matched");
  const unmatched = rows.filter((row) => row.status === "unmatched");
  const saveSettings = async () => {
    await updateSettings.mutateAsync({
      days: Number(days),
      amount: Number(amountTolerance),
    });
    setSettingsOpen(false);
    toast("Matching settings saved");
  };
  const changeStatus = (value: string) => {
    setStatus(value);
    setSelected(null);
    const next = new URLSearchParams(searchParams);
    if (value === "unmatched") next.delete("status");
    else next.set("status", value);
    setSearchParams(next, { replace: true });
  };
  const ignoreTransaction = async (row: BankTransaction) => {
    if (
      !(await confirm({
        title: "Ignore this bank transaction?",
        description:
          "Ignored movements remain in the statement history and can be restored with Unmatch.",
        confirmLabel: "Ignore transaction",
      }))
    )
      return;
    ignore.mutate(row.id, {
      onSuccess: () => {
        setSelected(null);
        toast("Transaction ignored");
      },
    });
  };

  const queries = [taxYearQuery, settingsQuery, batchQuery];
  if (isLoading || queries.some((query) => query.isLoading))
    return <PageSkeleton rows={8} />;
  if (error || queries.some((query) => query.isError))
    return (
      <QueryErrorState
        title="Bank transactions could not be loaded"
        onRetry={() =>
          Promise.all([refetch(), ...queries.map((query) => query.refetch())])
        }
        isRetrying={isFetching || queries.some((query) => query.isFetching)}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Bank statements"
        title="Reconciliation"
        description="Work down unmatched activity, link records, and create anything missing without leaving the queue."
        primaryAction={
          <Button onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import statement
          </Button>
        }
        secondaryActions={
          <Button
            size="icon"
            variant="outline"
            aria-label="Matching settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        }
      />
      {/*
  return <div className="space-y-5"><header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Bank statements</p><h2 className="mt-1 text-2xl font-semibold">Reconciliation</h2><p className="mt-1 text-sm text-muted-foreground">Import a supported bank statement, match recorded activity, and resolve discrepancies.</p></div><div className="flex gap-2"><Button size="icon" variant="outline" title="Matching settings" onClick={() => setSettingsOpen(true)}><Settings2 className="h-4 w-4" /></Button><Button onClick={() => setImportOpen(true)}><Upload className="mr-2 h-4 w-4" />Import statement</Button></div></header>
      return <div className="overflow-x-auto rounded-md border bg-card"><div className="min-w-225"><div className="grid grid-cols-[105px_minmax(230px,1fr)_115px_115px_105px_minmax(180px,0.8fr)_125px] gap-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground"><span>Date</span><span>Description</span><span className="text-right">Money in</span><span className="text-right">Money out</span><span>Status</span><span>Matched record</span><span></span></div>{isLoading ? <div className="py-14 text-center text-sm text-muted-foreground">Loading transactions...</div> : rows.length === 0 ? <div className="py-14 text-center"><FileSpreadsheet className="mx-auto h-9 w-9 text-muted-foreground/50" /><p className="mt-2 font-medium">No bank transactions match</p><p className="mt-1 text-sm text-muted-foreground">Import a supported bank statement to begin reconciliation.</p></div> : rows.map((row) => <div key={row.id} className="grid grid-cols-[105px_minmax(230px,1fr)_115px_115px_105px_minmax(180px,0.8fr)_125px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0"><span className="text-muted-foreground">{row.transaction_date}</span><span className="min-w-0"><span className="block truncate font-medium">{row.description}</span><span className="text-xs text-muted-foreground">{row.tax_year} · {row.source_file}</span></span><span className="text-right font-medium text-emerald-700">{row.amount_in ? money.format(row.amount_in) : ""}</span><span className="text-right font-medium">{row.amount_out ? money.format(row.amount_out) : ""}</span><span><Badge variant={row.status === "matched" ? "success" : row.status === "unmatched" ? "warning" : "secondary"}>{row.status}</Badge></span><span className="truncate text-xs">{row.invoice_number ? `${row.invoice_number} · ${row.client_name}` : row.expense_description ? `${row.expense_description} · ${row.expense_category}` : "—"}</span><span className="flex justify-end gap-1">{row.status === "unmatched" && <><Button size="icon" variant="ghost" title="Rec
  */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Money in" value={money.format(totalIn)} />
        <SummaryTile label="Money out" value={money.format(totalOut)} />
        <SummaryTile
          label="Matched records"
          value={matched.length}
          detail={`of ${rows.filter((row) => row.status !== "ignored").length} active transactions`}
          tone="positive"
        />
        <SummaryTile
          label="Needs review"
          value={unmatched.length}
          detail={`${money.format(unmatched.reduce((sum, row) => sum + row.amount_in - row.amount_out, 0))} net unmatched`}
          tone="attention"
        />
      </div>
      {unmatched.length > 0 && (
        <Alert variant="warning">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>
            {unmatched.length} transaction{unmatched.length === 1 ? "" : "s"}{" "}
            need review
          </AlertTitle>
          <AlertDescription>
            Link recorded items, create missing records, or ignore non-business
            movements.
          </AlertDescription>
        </Alert>
      )}
      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search descriptions and matches..."
        activeCount={(search ? 1 : 0) + (taxYear !== "all" ? 1 : 0)}
        onClear={() => {
          setSearch("");
          setTaxYear("all");
        }}
      >
        <Select value={taxYear} onValueChange={setTaxYear}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tax years</SelectItem>
            {(taxYears ?? []).map((year) => (
              <SelectItem key={year.tax_year} value={year.tax_year}>
                {year.tax_year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={changeStatus}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unmatched">Unmatched</SelectItem>
            <SelectItem value="matched">Matched</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
      </FilterToolbar>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.7fr)]">
        <div className="overflow-x-auto rounded-md border bg-card">
          <div className="min-w-225">
            <div className="grid grid-cols-[105px_minmax(230px,1fr)_115px_115px_105px_minmax(180px,0.8fr)_125px] gap-3 border-b bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Money in</span>
              <span className="text-right">Money out</span>
              <span>Status</span>
              <span>Matched record</span>
              <span></span>
            </div>
            {rows.length === 0 ? (
              <EmptyState
                icon={FileSpreadsheet}
                title={
                  status === "unmatched"
                    ? "Reconciliation queue is clear"
                    : "No bank transactions match"
                }
                description={
                  status === "unmatched"
                    ? "There are no unmatched transactions in the selected tax year."
                    : "Choose another status, clear filters, or import a statement."
                }
              />
            ) : (
              rows.map((row) => (
                <div
                  key={row.id}
                  className={`grid grid-cols-[105px_minmax(230px,1fr)_115px_115px_105px_minmax(180px,0.8fr)_125px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0 ${selected?.id === row.id ? "bg-accent/70" : "hover:bg-muted/40"}`}
                >
                  <span className="text-muted-foreground">
                    {row.transaction_date}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {row.description}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {row.tax_year} · {row.source_file}
                    </span>
                  </span>
                  <span className="text-right font-medium text-emerald-700">
                    {row.amount_in ? money.format(row.amount_in) : ""}
                  </span>
                  <span className="text-right font-medium">
                    {row.amount_out ? money.format(row.amount_out) : ""}
                  </span>
                  <span>
                    <Badge
                      variant={
                        row.status === "matched"
                          ? "success"
                          : row.status === "unmatched"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {row.status}
                    </Badge>
                  </span>
                  <span className="truncate text-xs">
                    {row.invoice_reference
                      ? `${row.invoice_reference} · ${row.client_name}`
                      : row.expense_description
                        ? `${row.expense_description} · ${row.expense_category}`
                        : "—"}
                  </span>
                  <span className="flex justify-end gap-1">
                    {row.status === "unmatched" && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Reconcile ${row.description}`}
                          onClick={() => setSelected(row)}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Ignore ${row.description}`}
                          onClick={() => void ignoreTransaction(row)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    {row.status !== "unmatched" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => unmatch.mutate(row.id)}
                      >
                        Unmatch
                      </Button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
        <aside className="rounded-md border bg-card p-4 xl:sticky xl:top-20">
          {selected ? (
            <ResolveDialog
              transaction={selected}
              open
              onOpenChange={(open) => {
                if (!open) setSelected(null);
              }}
              embedded
            />
          ) : (
            <div className="flex min-h-80 flex-col items-center justify-center text-center">
              <span className="rounded-md bg-muted p-3">
                <Link2 className="h-6 w-6 text-muted-foreground" />
              </span>
              <h2 className="mt-4 font-semibold">Select a transaction</h2>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Choose Reconcile from the queue to link a record or create a
                missing invoice payment or expense.
              </p>
            </div>
          )}
        </aside>
      </div>
      {(batches ?? []).length > 0 && (
        <div className="text-xs text-muted-foreground">
          Last import: {batches?.[0].source_file} · {batches?.[0].imported_rows}{" "}
          rows · {batches?.[0].duplicate_rows} duplicates skipped ·{" "}
          {batches?.[0].date_from} to {batches?.[0].date_to}
        </div>
      )}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Automatic matching</DialogTitle>
            <DialogDescription>
              Control how closely bank dates and amounts must match recorded
              activity. Ambiguous matches always remain for review.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date tolerance (days)</Label>
              <Input
                type="number"
                min="0"
                max="31"
                step="1"
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount tolerance</Label>
              <Input
                type="number"
                min="0"
                max="10"
                step="0.01"
                value={amountTolerance}
                onChange={(event) => setAmountTolerance(event.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSettings} disabled={updateSettings.isPending}>
              Save settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

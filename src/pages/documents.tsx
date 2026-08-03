import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  CheckCircle2,
  CircleDashed,
  FileSearch,
  FolderOpen,
  Link2,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  ScanText,
  Search,
  Smartphone,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { DocumentPreview } from "@/components/document-preview";
import { MobileReceiptDialog } from "@/components/expenses/mobile-receipt-dialog";
import { LoadingSpinner } from "@/components/loading";
import {
  PageHeader,
  QueryErrorState,
  SavedViews,
  SummaryTile,
} from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { recogniseReceipt, suggestCategoryId } from "@/lib/document-ocr";
import { useClients } from "@/lib/queries/clients";
import {
  findPriorSupplierCategory,
  findReceiptInsights,
  type DocumentCategory,
  type DocumentMetadata,
  type DocumentRecord,
  type OcrStatus,
  type ReceiptInsights,
  useCreateDocument,
  useCreateExpenseFromDocument,
  useDeleteDocument,
  useDocuments,
  useLinkDocumentExpense,
  useRestoreDocument,
  useUpdateDocument,
  useUpdateDocumentOcr,
} from "@/lib/queries/documents";
import {
  useExpenseCategories,
  useExpenses,
  type StoredReceipt,
} from "@/lib/queries/expenses";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import {
  chooseAndStoreDocument,
  deleteStoredFile,
  openStoredReceipt,
  readStoredFile,
} from "@/lib/receipt-storage";
import { useAppStore } from "@/stores/app-store";

const categories: { value: DocumentCategory; label: string }[] = [
  { value: "receipt", label: "Receipt" },
  { value: "invoice_sent", label: "Invoice sent" },
  { value: "invoice_received", label: "Invoice received" },
  { value: "contract", label: "Contract" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];
const bytes = new Intl.NumberFormat("en-GB", {
  style: "unit",
  unit: "kilobyte",
  maximumFractionDigits: 0,
});
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
type EvidenceView = "all" | "not_started" | "review" | "failed" | "complete";

const ocrPresentation: Record<
  OcrStatus,
  {
    label: string;
    variant: "outline" | "secondary" | "warning" | "destructive" | "success";
  }
> = {
  not_started: { label: "OCR not run", variant: "outline" },
  processing: { label: "OCR processing", variant: "secondary" },
  review: { label: "Review OCR", variant: "warning" },
  failed: { label: "OCR failed", variant: "destructive" },
  complete: { label: "OCR complete", variant: "success" },
};

function categoryLabel(value: string) {
  return (
    categories.find((category) => category.value === value)?.label ?? value
  );
}

function taxYearForDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const startYear = date >= new Date(year, 3, 6) ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function MetadataFields({
  value,
  onChange,
  taxYears,
  clients,
}: {
  value: DocumentMetadata;
  onChange: (value: DocumentMetadata) => void;
  taxYears: { tax_year: string }[];
  clients: { id: number; name: string }[];
}) {
  const set = <K extends keyof DocumentMetadata>(
    key: K,
    next: DocumentMetadata[K],
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Category</Label>
        <Select
          value={value.category}
          onValueChange={(next) => set("category", next as DocumentCategory)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category.value} value={category.value}>
                {category.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Document date</Label>
        <Input
          type="date"
          value={value.documentDate}
          onChange={(event) => {
            const date = event.target.value;
            onChange({
              ...value,
              documentDate: date,
              taxYear: taxYearForDate(date) || value.taxYear,
            });
          }}
        />
      </div>
      <div className="space-y-2">
        <Label>Tax year</Label>
        <Select
          value={value.taxYear || "none"}
          onValueChange={(next) => set("taxYear", next === "none" ? "" : next)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Not assigned</SelectItem>
            {taxYears.map((year) => (
              <SelectItem key={year.tax_year} value={year.tax_year}>
                {year.tax_year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Client</Label>
        <Select
          value={value.clientId ? String(value.clientId) : "none"}
          onValueChange={(next) =>
            set("clientId", next === "none" ? null : Number(next))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No client</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={String(client.id)}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Notes</Label>
        <Textarea
          rows={3}
          value={value.notes}
          onChange={(event) => set("notes", event.target.value)}
        />
      </div>
    </div>
  );
}

function DocumentEditor({
  file,
  document,
  open,
  onOpenChange,
}: {
  file?: StoredReceipt | null;
  document?: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const taxYearQuery = useTaxYearConfigs();
  const clientQuery = useClients();
  const { data: taxYears } = taxYearQuery;
  const { data: clients } = clientQuery;
  const create = useCreateDocument();
  const update = useUpdateDocument();
  const stagedFileHandled = useRef(false);
  const [metadata, setMetadata] = useState<DocumentMetadata>({
    category: "other",
    clientId: null,
    taxYear: currentTaxYear,
    documentDate: new Date().toISOString().slice(0, 10),
    notes: "",
  });
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    stagedFileHandled.current = false;
    setMetadata(
      document
        ? {
            category: document.category,
            clientId: document.client_id,
            taxYear: document.tax_year,
            documentDate: document.document_date.slice(0, 10),
            notes: document.notes,
          }
        : {
            category: "other",
            clientId: null,
            taxYear: currentTaxYear,
            documentDate: new Date().toISOString().slice(0, 10),
            notes: "",
          },
    );
    setError("");
  }, [currentTaxYear, document, open]);
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && file && !document && !stagedFileHandled.current) {
      stagedFileHandled.current = true;
      void deleteStoredFile(file.path);
    }
    onOpenChange(nextOpen);
  };
  const save = async () => {
    try {
      if (document) await update.mutateAsync({ id: document.id, ...metadata });
      else if (file) {
        await create.mutateAsync({ file, metadata });
        stagedFileHandled.current = true;
      }
      onOpenChange(false);
    } catch (caught) {
      if (file && !document && !stagedFileHandled.current) {
        stagedFileHandled.current = true;
        await deleteStoredFile(file.path).catch(() => undefined);
      }
      setError(
        `${caught instanceof Error ? caught.message : "Document could not be saved."} The staged file was removed; select it again before retrying.`,
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {document ? "Edit document" : "File document"}
          </DialogTitle>
          <DialogDescription>
            {document?.file_name ?? file?.fileName}
          </DialogDescription>
        </DialogHeader>
        <MetadataFields
          value={metadata}
          onChange={setMetadata}
          taxYears={taxYears ?? []}
          clients={clients ?? []}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={
              create.isPending || update.isPending || stagedFileHandled.current
            }
          >
            Save document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OcrReview({
  document,
  open,
  onOpenChange,
}: {
  document: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: expenseCategories } = useExpenseCategories();
  const { data: expenses } = useExpenses();
  const updateOcr = useUpdateDocumentOcr();
  const createExpense = useCreateExpenseFromDocument();
  const linkExpense = useLinkDocumentExpense();
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState("");
  const [total, setTotal] = useState("");
  const [vat, setVat] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [text, setText] = useState("");
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [insights, setInsights] = useState<ReceiptInsights>({
    duplicates: [],
    bankMatches: [],
  });
  const [bankTransactionId, setBankTransactionId] = useState("");

  useEffect(() => {
    if (!document || !open) return;
    setSupplier(document.ocr_supplier);
    setDate(document.ocr_date || document.document_date.slice(0, 10));
    setTotal(document.ocr_total ? String(document.ocr_total) : "");
    setVat(document.ocr_vat ? String(document.ocr_vat) : "");
    setCategoryId(
      document.ocr_category_id ? String(document.ocr_category_id) : "",
    );
    setText(document.ocr_text);
    setExpenseId(
      document.linked_expense_id ? String(document.linked_expense_id) : "",
    );
    setProgress(0);
    setError("");
    setBankTransactionId("");
    void findReceiptInsights(document.id, {
      supplier: document.ocr_supplier,
      date: document.ocr_date || document.document_date.slice(0, 10),
      total: document.ocr_total,
    }).then(setInsights);
  }, [document, open]);

  if (!document) return null;
  const canOcr =
    document.file_type.startsWith("image/") ||
    document.file_type === "application/pdf";
  const currentStatus = processing ? "processing" : document.ocr_status;
  const status = ocrPresentation[currentStatus];
  const runOcr = async () => {
    setProcessing(true);
    setError("");
    setProgress(0);
    try {
      await updateOcr.mutateAsync({ id: document.id, status: "processing" });
      const fileBytes = await readStoredFile(document.file_path);
      const result = await recogniseReceipt(
        new Blob([new Uint8Array(fileBytes)], { type: document.file_type }),
        (next) => setProgress(next),
      );
      const priorCategory = await findPriorSupplierCategory(result.supplier);
      const suggested = suggestCategoryId(
        result.supplier,
        result.text,
        expenseCategories ?? [],
        priorCategory,
      );
      setSupplier(result.supplier);
      setDate(result.date || document.document_date.slice(0, 10));
      setTotal(result.total ? String(result.total) : "");
      setVat(result.vat ? String(result.vat) : "");
      setText(result.text);
      setCategoryId(suggested ? String(suggested) : "");
      setInsights(
        await findReceiptInsights(document.id, {
          supplier: result.supplier,
          date: result.date || document.document_date.slice(0, 10),
          total: result.total,
        }),
      );
      await updateOcr.mutateAsync({
        id: document.id,
        status: "review",
        text: result.text,
        supplier: result.supplier,
        date: result.date,
        total: result.total,
        vat: result.vat,
        categoryId: suggested,
      });
    } catch (caught) {
      await updateOcr.mutateAsync({ id: document.id, status: "failed", text });
      setError(
        caught instanceof Error
          ? caught.message
          : "OCR could not read this document.",
      );
    } finally {
      setProcessing(false);
    }
  };
  const saveReview = async () => {
    await updateOcr.mutateAsync({
      id: document.id,
      status: "complete",
      text,
      supplier,
      date,
      total: Number(total) || 0,
      vat: Number(vat) || 0,
      categoryId: categoryId ? Number(categoryId) : null,
    });
    onOpenChange(false);
  };
  const create = async () => {
    if (!categoryId || !date || Number(total) <= 0)
      return setError("Confirm a category, date, and total greater than zero.");
    await updateOcr.mutateAsync({
      id: document.id,
      status: "review",
      text,
      supplier,
      date,
      total: Number(total),
      vat: Number(vat) || 0,
      categoryId: Number(categoryId),
    });
    await createExpense.mutateAsync({
      document,
      categoryId: Number(categoryId),
      supplier,
      date,
      amount: Number(total),
      vat: Number(vat) || 0,
      bankTransactionId: bankTransactionId
        ? Number(bankTransactionId)
        : undefined,
    });
    onOpenChange(false);
  };
  const link = async () => {
    if (!expenseId) return setError("Select an existing expense.");
    await linkExpense.mutateAsync({ document, expenseId: Number(expenseId) });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>OCR and expense review</DialogTitle>
          <DialogDescription>
            Review extracted values before they affect your bookkeeping.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="overflow-hidden rounded-md border">
            <DocumentPreview
              path={document.file_path}
              fileType={document.file_type}
            />
          </div>
          <div className="space-y-4">
            <div className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">Local text recognition</p>
                    <Badge variant={status.variant}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {processing
                      ? "Reading this document on your device. Keep this window open until review is ready."
                      : currentStatus === "review"
                        ? "Check the extracted values and complete the review or create an expense."
                        : currentStatus === "failed"
                          ? "Recognition did not complete. Retry it or enter the values manually."
                          : currentStatus === "complete"
                            ? "The extracted values have been reviewed. Run again to replace them."
                            : canOcr
                              ? "Runs entirely on this device."
                              : "OCR is available for image and PDF receipts; this file remains viewable."}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={runOcr}
                  disabled={!canOcr || processing}
                >
                  {processing ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : currentStatus === "failed" ||
                    currentStatus === "complete" ? (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  ) : (
                    <ScanText className="mr-2 h-4 w-4" />
                  )}
                  {processing
                    ? `${Math.round(progress * 100)}%`
                    : currentStatus === "failed"
                      ? "Retry OCR"
                      : currentStatus === "complete"
                        ? "Replace OCR"
                        : "Run OCR"}
                </Button>
              </div>
              {processing && (
                <div
                  className="mt-3 h-2 overflow-hidden rounded bg-muted"
                  role="progressbar"
                  aria-label="OCR progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress * 100)}
                >
                  <div
                    className="h-full bg-primary transition-[width]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Total</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>VAT</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={vat}
                  onChange={(event) => setVat(event.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Suggested expense category</Label>
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
                  <SelectItem value="none">Review category</SelectItem>
                  {(expenseCategories ?? []).map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {insights.duplicates.length > 0 && (
              <Alert variant="warning">
                <TriangleAlert className="h-4 w-4" />
                <AlertDescription>
                  Possible duplicate of {insights.duplicates[0].fileName}. It
                  has the same date, total, and supplier. Review the existing
                  document before creating another expense.
                </AlertDescription>
              </Alert>
            )}
            {insights.bankMatches.length > 0 && (
              <div className="rounded-md border p-3">
                <Label>Suggested bank match</Label>
                <Select
                  value={bankTransactionId || "none"}
                  onValueChange={(value) =>
                    setBankTransactionId(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Do not reconcile now</SelectItem>
                    {insights.bankMatches.map((match) => (
                      <SelectItem key={match.id} value={String(match.id)}>
                        {match.date} · {match.description} ·{" "}
                        {money.format(match.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-2 text-xs text-muted-foreground">
                  Creating the expense will also reconcile the selected bank
                  transaction. Suggested from amount, date, and supplier text.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Recognised text</Label>
              <Textarea
                rows={7}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </div>
            <div className="rounded-md border p-3">
              <Label>Link existing expense</Label>
              <div className="mt-2 flex gap-2">
                <Select
                  value={expenseId || "none"}
                  onValueChange={(value) =>
                    setExpenseId(value === "none" ? "" : value)
                  }
                >
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select expense</SelectItem>
                    {(expenses ?? []).map((expense) => (
                      <SelectItem key={expense.id} value={String(expense.id)}>
                        {expense.date} ·{" "}
                        {expense.supplier || expense.description} ·{" "}
                        {money.format(expense.amount)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={link}
                  disabled={!expenseId || linkExpense.isPending}
                >
                  <Link2 className="mr-2 h-4 w-4" />
                  Link
                </Button>
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={saveReview}
                disabled={updateOcr.isPending}
              >
                Save review
              </Button>
              <Button onClick={create} disabled={createExpense.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Create expense
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Viewer({
  document,
  open,
  onOpenChange,
  onEdit,
  onOcr,
}: {
  document: DocumentRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onOcr: () => void;
}) {
  if (!document) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{document.file_name}</DialogTitle>
          <DialogDescription>
            {categoryLabel(document.category)} ·{" "}
            {document.tax_year || "No tax year"}
            {document.client_name ? ` · ${document.client_name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-hidden rounded-md border">
          <DocumentPreview
            path={document.file_path}
            fileType={document.file_type}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => void openStoredReceipt(document.file_path)}
          >
            Open externally
          </Button>
          <Button variant="outline" onClick={onEdit}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button onClick={onOcr}>
            <ScanText className="mr-2 h-4 w-4" />
            OCR and expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const handledCreateIntent = useRef(false);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);
  const requestedView = searchParams.get("view");
  const [view, setView] = useState<EvidenceView>(
    ["not_started", "review", "failed", "complete"].includes(
      requestedView ?? "",
    )
      ? (requestedView as EvidenceView)
      : "all",
  );
  const [category, setCategory] = useState("all");
  const [taxYear, setTaxYear] = useState("all");
  const [clientId, setClientId] = useState(
    () => searchParams.get("clientId") ?? "all",
  );
  const [fileKind, setFileKind] = useState("all");
  const documentQuery = useDocuments({
    search,
    category,
    taxYear,
    clientId,
    fileKind,
  });
  const { data: documents, isLoading, error } = documentQuery;
  const taxYearQuery = useTaxYearConfigs();
  const clientQuery = useClients();
  const { data: taxYears } = taxYearQuery;
  const { data: clients } = clientQuery;
  const deleteDocument = useDeleteDocument();
  const restore = useRestoreDocument();
  const { confirm, toast } = useFeedback();
  const [pendingFile, setPendingFile] = useState<StoredReceipt | null>(null);
  const [editing, setEditing] = useState<DocumentRecord | null>(null);
  const [selected, setSelected] = useState<DocumentRecord | null>(null);
  const [ocrDocument, setOcrDocument] = useState<DocumentRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mobileCaptureOpen, setMobileCaptureOpen] = useState(false);
  const archiveDocument = async (document: DocumentRecord) => {
    if (
      !(await confirm({
        title: `Archive ${document.file_name}?`,
        description:
          "The file will leave the evidence inbox and can be restored from Activity.",
        confirmLabel: "Archive document",
        destructive: true,
      }))
    )
      return;
    await deleteDocument.mutateAsync(document.id);
    toast("Document archived", {
      actionLabel: "Undo",
      onAction: () => restore.mutateAsync(document.id),
    });
  };
  const remove = {
    mutate: (id: number) => {
      const document = (documents ?? []).find((item) => item.id === id);
      if (document) void archiveDocument(document);
    },
  };
  const upload = async () => {
    setUploading(true);
    try {
      const file = await chooseAndStoreDocument();
      if (file) setPendingFile(file);
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    if (searchParams.get("new") !== "document" || handledCreateIntent.current)
      return;
    handledCreateIntent.current = true;
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
    void upload();
  }, [searchParams, setSearchParams]);
  const rows = (documents ?? []).filter(
    (document) =>
      view === "all" ||
      document.ocr_status === view ||
      (view === "not_started" && document.ocr_status === "processing"),
  );
  const changeView = (nextView: EvidenceView) => {
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    setSearchParams(next, { replace: true });
  };
  const queries = [documentQuery, taxYearQuery, clientQuery];
  if (queries.some((query) => query.isError))
    return (
      <QueryErrorState
        title="Documents could not be loaded"
        onRetry={() => Promise.all(queries.map((query) => query.refetch()))}
        isRetrying={queries.some((query) => query.isFetching)}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Evidence inbox"
        title="Documents"
        description="File receipts and business records, clear OCR reviews, and connect evidence to transactions."
        primaryAction={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setMobileCaptureOpen(true)}
            >
              <Smartphone className="mr-2 h-4 w-4" />
              Capture from phone
            </Button>
            <Button onClick={upload} disabled={uploading}>
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Selecting" : "Upload document"}
            </Button>
          </div>
        }
      />
      <SavedViews
        value={view}
        onChange={changeView}
        views={[
          { value: "all", label: "All", count: documents?.length ?? 0 },
          {
            value: "not_started",
            label: "Not run",
            count:
              documents?.filter(
                (item) =>
                  item.ocr_status === "not_started" ||
                  item.ocr_status === "processing",
              ).length ?? 0,
          },
          {
            value: "review",
            label: "Needs review",
            count:
              documents?.filter((item) => item.ocr_status === "review")
                .length ?? 0,
          },
          {
            value: "failed",
            label: "Failed",
            count:
              documents?.filter((item) => item.ocr_status === "failed")
                .length ?? 0,
          },
          {
            value: "complete",
            label: "Complete",
            count:
              documents?.filter((item) => item.ocr_status === "complete")
                .length ?? 0,
          },
        ]}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Documents shown" value={rows.length} />
        <SummaryTile
          label="Linked to expenses"
          value={rows.filter((document) => document.linked_expense_id).length}
        />
        <SummaryTile
          label="Awaiting review"
          value={
            (documents ?? []).filter(
              (document) => document.ocr_status === "review",
            ).length
          }
          tone="attention"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-60 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search filenames, notes, suppliers, OCR text..."
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {(clients ?? []).map((client) => (
              <SelectItem key={client.id} value={String(client.id)}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fileKind} onValueChange={setFileKind}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All file types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="pdf">PDFs</SelectItem>
            <SelectItem value="other">Other files</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      {isLoading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed py-16 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
          <p className="mt-3 font-medium">No documents match this inbox view</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose another review state or upload new evidence.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((document) => {
            const ocr = ocrPresentation[document.ocr_status];
            return (
              <Card
                key={document.id}
                className="overflow-hidden rounded-lg shadow-sm"
              >
                <button
                  className="block h-36 w-full overflow-hidden bg-muted"
                  onClick={() => setSelected(document)}
                  aria-label={`View ${document.file_name}`}
                >
                  <DocumentPreview
                    path={document.file_path}
                    fileType={document.file_type}
                    className="h-36 w-full object-cover"
                  />
                </button>
                <CardHeader className="space-y-2 p-4 pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 truncate text-sm">
                      {document.file_name}
                    </CardTitle>
                    <Badge variant="outline">
                      {categoryLabel(document.category)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {document.document_date
                      ? new Date(
                          `${document.document_date.slice(0, 10)}T00:00:00`,
                        ).toLocaleDateString("en-GB")
                      : "No date"}{" "}
                    · {bytes.format(document.file_size / 1024)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-3 p-4 pt-2">
                  <div className="flex min-h-5 flex-wrap gap-1.5">
                    <Badge variant={ocr.variant}>
                      {document.ocr_status === "processing" && (
                        <LoaderCircle className="mr-1 h-3 w-3 animate-spin" />
                      )}
                      {document.ocr_status === "failed" && (
                        <TriangleAlert className="mr-1 h-3 w-3" />
                      )}
                      {document.ocr_status === "complete" && (
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                      )}
                      {document.ocr_status === "not_started" && (
                        <CircleDashed className="mr-1 h-3 w-3" />
                      )}
                      {ocr.label}
                    </Badge>
                    {document.tax_year && (
                      <Badge variant="secondary">{document.tax_year}</Badge>
                    )}
                    {document.client_name && (
                      <Badge variant="secondary">{document.client_name}</Badge>
                    )}
                    {document.linked_expense_id && (
                      <Badge variant="success">Expense linked</Badge>
                    )}
                  </div>
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="View document"
                      aria-label="View document"
                      onClick={() => setSelected(document)}
                    >
                      <FileSearch className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="OCR and expense"
                      aria-label="OCR and expense"
                      onClick={() => setOcrDocument(document)}
                    >
                      <ScanText className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Edit metadata"
                      aria-label="Edit metadata"
                      onClick={() => setEditing(document)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Archive document"
                      aria-label="Archive document"
                      onClick={() => remove.mutate(document.id)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <DocumentEditor
        file={pendingFile}
        open={!!pendingFile}
        onOpenChange={(open) => {
          if (!open) setPendingFile(null);
        }}
      />
      <DocumentEditor
        document={editing}
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
      <Viewer
        document={selected}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onEdit={() => {
          setEditing(selected);
          setSelected(null);
        }}
        onOcr={() => {
          setOcrDocument(selected);
          setSelected(null);
        }}
      />
      <OcrReview
        document={ocrDocument}
        open={!!ocrDocument}
        onOpenChange={(open) => {
          if (!open) setOcrDocument(null);
        }}
      />
      <MobileReceiptDialog
        open={mobileCaptureOpen}
        onOpenChange={setMobileCaptureOpen}
        onReceived={(file) => {
          setPendingFile(file);
          setMobileCaptureOpen(false);
        }}
      />
    </div>
  );
}

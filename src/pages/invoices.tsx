import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileCheck2,
  FilePlus2,
  FileText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyState,
  FilterToolbar,
  PageHeader,
  PageSkeleton,
  QueryErrorState,
  SavedViews,
  SummaryTile,
} from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";
import { InvoiceEditorDialog } from "@/components/invoices/invoice-editor-dialog";
import { InvoiceDetailDialog } from "@/components/invoices/invoice-detail-dialog";
import { SelfBilledInvoiceDialog } from "@/components/invoices/self-billed-invoice-dialog";
import { SelfBillingAgreementDialog } from "@/components/invoices/self-billing-agreement-dialog";
import {
  useDueRecurringInvoices,
  useInvoice,
  useInvoices,
  useProcessRecurringInvoices,
  type Invoice,
  type InvoiceDetail,
  type InvoiceStatus,
} from "@/lib/queries/invoices";
import { useTaxYearConfigs } from "@/lib/queries/settings";

type InvoiceView =
  "all" | "draft" | "outstanding" | "overdue" | "paid" | "quote";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const statusStyles: Record<
  InvoiceStatus,
  "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
> = {
  draft: "secondary",
  sent: "default",
  viewed: "outline",
  partially_paid: "warning",
  paid: "success",
  overdue: "destructive",
  cancelled: "outline",
};

function formatDate(value: string) {
  return date.format(new Date(`${value}T00:00:00`));
}

function InvoiceRow({
  invoice,
  onOpen,
}: {
  invoice: Invoice;
  onOpen: (invoice: Invoice) => void;
}) {
  return (
    <button
      className="grid w-full grid-cols-[minmax(130px,0.8fr)_minmax(180px,1.5fr)_110px_110px_120px_110px] items-center gap-4 border-b px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-muted/50"
      onClick={() => onOpen(invoice)}
    >
      <span className="font-medium">{invoice.display_reference}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {invoice.client_company || invoice.client_name}
        </span>
        {invoice.client_company && (
          <span className="block truncate text-xs text-muted-foreground">
            {invoice.client_name}
          </span>
        )}
      </span>
      <span className="text-muted-foreground">
        {formatDate(invoice.issue_date)}
      </span>
      <span className="text-muted-foreground">
        {formatDate(invoice.due_date)}
      </span>
      <span>
        <Badge
          variant={invoice.is_quote ? "outline" : statusStyles[invoice.status]}
        >
          {invoice.is_quote ? "Quote" : invoice.status.replace("_", " ")}
        </Badge>
      </span>
      <span className="text-right">
        <span className="block font-semibold">
          {money.format(invoice.total)}
        </span>
        {invoice.balance_due !== invoice.total && (
          <span className="block text-xs text-muted-foreground">
            {money.format(invoice.balance_due)} due
          </span>
        )}
      </span>
    </button>
  );
}

export function InvoicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view") ?? searchParams.get("status");
  const [view, setView] = useState<InvoiceView>(
    ["draft", "outstanding", "overdue", "paid", "quote"].includes(
      requestedView ?? "",
    )
      ? (requestedView as InvoiceView)
      : "all",
  );
  const [taxYear, setTaxYear] = useState(
    () => searchParams.get("taxYear") ?? "all",
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);
  const { toast } = useFeedback();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailAction, setDetailAction] = useState<"payment" | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInvoiceId, setEditorInvoiceId] = useState<number | null>(null);
  const [initialQuote, setInitialQuote] = useState(false);
  const [selfBilledOpen, setSelfBilledOpen] = useState(false);
  const [agreementsOpen, setAgreementsOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get("new") !== "invoice") return;
    setEditorInvoiceId(null);
    setInitialQuote(false);
    setEditorOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  useEffect(() => {
    const requestedId = Number(searchParams.get("open"));
    if (!Number.isInteger(requestedId) || requestedId <= 0) return;
    setSelectedId(requestedId);
    setDetailAction(
      searchParams.get("action") === "payment" ? "payment" : null,
    );
  }, [searchParams]);
  const requestedClientId = Number(searchParams.get("clientId"));
  const clientId =
    Number.isInteger(requestedClientId) && requestedClientId > 0
      ? requestedClientId
      : null;
  const queryStatus = view === "outstanding" ? "all" : view;
  const invoiceQuery = useInvoices({
    status: queryStatus,
    taxYear,
    search,
    clientId,
  });
  const { data: invoices, isLoading } = invoiceQuery;
  const { data: editorInvoice } = useInvoice(editorInvoiceId);
  const taxYearQuery = useTaxYearConfigs();
  const recurringQuery = useDueRecurringInvoices();
  const { data: taxYears } = taxYearQuery;
  const { data: recurringDue } = recurringQuery;
  const processRecurring = useProcessRecurringInvoices();

  const rows = (invoices ?? []).filter(
    (invoice) => view !== "outstanding" || invoice.balance_due > 0,
  );
  const total = rows.reduce((sum, invoice) => sum + invoice.total, 0);
  const outstanding = rows.reduce(
    (sum, invoice) => sum + invoice.balance_due,
    0,
  );
  const overdue = rows.filter((invoice) => invoice.status === "overdue");

  const openCreate = (quote: boolean) => {
    setEditorInvoiceId(null);
    setInitialQuote(quote);
    setEditorOpen(true);
  };

  const openEdit = (invoice: InvoiceDetail) => {
    setSelectedId(null);
    setEditorInvoiceId(invoice.id);
    setInitialQuote(invoice.is_quote === 1);
    setEditorOpen(true);
  };

  const changeView = (nextView: InvoiceView) => {
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    next.delete("status");
    setSearchParams(next, { replace: true });
  };

  const changeSearch = (value: string) => {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("search", value);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  };

  const changeTaxYear = (value: string) => {
    setTaxYear(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("taxYear");
    else next.set("taxYear", value);
    setSearchParams(next, { replace: true });
  };

  const queries = [invoiceQuery, taxYearQuery, recurringQuery];
  if (isLoading || queries.some((query) => query.isLoading))
    return <PageSkeleton />;
  if (queries.some((query) => query.isError))
    return (
      <QueryErrorState
        title="Invoices could not be loaded"
        onRetry={() => Promise.all(queries.map((query) => query.refetch()))}
        isRetrying={queries.some((query) => query.isFetching)}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Money in"
        title="Invoices & sales"
        description="Create invoices, record customer-issued self-bills, collect payments, and keep outstanding income visible."
        primaryAction={
          <Button onClick={() => openCreate(false)}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            New invoice
          </Button>
        }
        secondaryActions={
          <>
            <Button variant="outline" onClick={() => setAgreementsOpen(true)}>
              <FileCheck2 className="mr-2 h-4 w-4" />
              Agreements
            </Button>
            <Button variant="outline" onClick={() => setSelfBilledOpen(true)}>
              Record self-bill
            </Button>
            <Button variant="ghost" onClick={() => openCreate(true)}>
              <FileText className="mr-2 h-4 w-4" />
              Quote
            </Button>
          </>
        }
      />

      <SavedViews
        value={view}
        onChange={changeView}
        views={[
          { value: "all", label: "All", count: invoices?.length ?? 0 },
          { value: "draft", label: "Drafts" },
          { value: "outstanding", label: "Outstanding" },
          { value: "overdue", label: "Overdue" },
          { value: "paid", label: "Paid" },
          { value: "quote", label: "Quotes" },
        ]}
      />

      {(recurringDue ?? []).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            <span>
              <strong>{recurringDue?.length}</strong> recurring invoice
              {recurringDue?.length === 1 ? " is" : "s are"} due. Auto-create
              processes templates configured for automatic drafts.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={processRecurring.isPending}
            onClick={() =>
              processRecurring.mutate(undefined, {
                onSuccess: () => toast("Recurring invoices processed"),
              })
            }
          >
            {processRecurring.isPending
              ? "Processing..."
              : "Process auto-create"}
          </Button>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4" /> {overdue.length} overdue invoice
          {overdue.length === 1 ? "" : "s"} totalling{" "}
          {money.format(
            overdue.reduce((sum, invoice) => sum + invoice.balance_due, 0),
          )}
          .
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Records shown" value={rows.length} />
        <SummaryTile label="Gross value" value={money.format(total)} />
        <SummaryTile
          label="Still to collect"
          value={money.format(outstanding)}
          tone="attention"
        />
      </div>

      <FilterToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Search reference or client..."
        activeCount={
          (search ? 1 : 0) + (taxYear !== "all" ? 1 : 0) + (clientId ? 1 : 0)
        }
        onClear={() => {
          const next = new URLSearchParams(searchParams);
          next.delete("clientId");
          setSearchParams(next, { replace: true });
          changeSearch("");
          changeTaxYear("all");
        }}
      >
        <Select value={taxYear} onValueChange={changeTaxYear}>
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
      </FilterToolbar>

      <div className="overflow-x-auto rounded-md border bg-card">
        <div className="min-w-205">
          <div className="grid grid-cols-[minmax(130px,0.8fr)_minmax(180px,1.5fr)_110px_110px_120px_110px] gap-4 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Reference</span>
            <span>Client</span>
            <span>Issued</span>
            <span>Due</span>
            <span>Status</span>
            <span className="text-right">Total</span>
          </div>
          {rows.length > 0 ? (
            rows.map((invoice) => (
              <InvoiceRow
                invoice={invoice}
                onOpen={(selected) => setSelectedId(selected.id)}
                key={invoice.id}
              />
            ))
          ) : (
            <EmptyState
              icon={FileText}
              title={
                search || taxYear !== "all" || view !== "all"
                  ? "No invoices match this view"
                  : "Create your first invoice"
              }
              description={
                search || taxYear !== "all" || view !== "all"
                  ? "Clear filters or choose another saved view."
                  : "Create an invoice to start tracking money owed by customers."
              }
              action={
                !search && taxYear === "all" && view === "all" ? (
                  <Button onClick={() => openCreate(false)}>New invoice</Button>
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      <InvoiceDetailDialog
        invoiceId={selectedId}
        open={selectedId !== null}
        initialAction={detailAction}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null);
            setDetailAction(null);
            const next = new URLSearchParams(searchParams);
            next.delete("open");
            next.delete("action");
            setSearchParams(next, { replace: true });
          }
        }}
        onEdit={openEdit}
      />
      <InvoiceEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditorInvoiceId(null);
        }}
        invoice={editorInvoice ?? null}
        initialQuote={initialQuote}
        initialClientId={clientId}
        onSaved={(invoiceId) => {
          setSelectedId(invoiceId);
          toast("Draft saved", {
            description: "Review the document, then issue it when ready.",
          });
        }}
      />
      <SelfBilledInvoiceDialog
        open={selfBilledOpen}
        onOpenChange={setSelfBilledOpen}
      />
      <SelfBillingAgreementDialog
        open={agreementsOpen}
        onOpenChange={setAgreementsOpen}
      />
    </div>
  );
}

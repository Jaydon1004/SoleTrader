import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  FileText,
  FolderCog,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { DocumentPreview } from "@/components/document-preview";
import { ExpenseEditorDialog } from "@/components/expenses/expense-editor-dialog";
import { CategoryManagerDialog } from "@/components/expenses/category-manager-dialog";
import {
  useDeleteExpense,
  useBulkCategoriseExpenses,
  useBulkDeleteExpenses,
  useDueRecurringExpenses,
  useExpenseCategories,
  useExpenses,
  useProcessRecurringExpenses,
  useRestoreExpense,
  type Expense,
} from "@/lib/queries/expenses";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { openStoredReceipt } from "@/lib/receipt-storage";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
type ExpenseView =
  "all" | "needs-receipt" | "recurring" | "mixed-use" | "quarter";

function ExpenseRow({
  expense,
  deleted,
  selected,
  onToggle,
  onEdit,
  onDelete,
  onRestore,
}: {
  expense: Expense;
  deleted: boolean;
  onEdit: (expense: Expense) => void;
  selected: boolean;
  onToggle: (expense: Expense) => void;
  onDelete: (expense: Expense) => void;
  onRestore: (expense: Expense) => void;
}) {
  return (
    <div className="grid min-w-230 grid-cols-[32px_105px_minmax(150px,1fr)_minmax(200px,1.5fr)_140px_105px_105px_44px] items-center gap-3 border-b px-4 py-3 text-sm last:border-b-0 hover:bg-muted/40">
      <input
        type="checkbox"
        aria-label={`Select ${expense.description}`}
        checked={selected}
        disabled={deleted || expense.is_bad_debt === 1}
        onChange={() => onToggle(expense)}
      />
      <span className="text-muted-foreground">
        {dateFormatter.format(new Date(`${expense.date}T00:00:00`))}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium">
          {expense.supplier || "No supplier"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {expense.category_name}
        </span>
      </span>
      <button
        className="min-w-0 text-left"
        onClick={() => !deleted && expense.is_bad_debt === 0 && onEdit(expense)}
      >
        <span className="block truncate">{expense.description}</span>
        <span className="mt-1 flex gap-2">
          {expense.is_recurring === 1 && (
            <Badge variant="outline">Recurring</Badge>
          )}
          {expense.is_bad_debt === 1 && (
            <Badge variant="destructive">Bad debt</Badge>
          )}
          {expense.business_percent < 100 && (
            <Badge variant="secondary">
              {expense.business_percent}% business
            </Badge>
          )}
        </span>
      </button>
      <span>
        {expense.receipt_path ? (
          <button
            className="flex items-center gap-2 text-xs hover:underline"
            onClick={() => void openStoredReceipt(expense.receipt_path)}
          >
            <DocumentPreview path={expense.receipt_path} compact />
            <span>
              <Paperclip className="mr-1 inline h-3 w-3" />
              View receipt
            </span>
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">No receipt</span>
        )}
      </span>
      <span className="text-right">
        <span className="block font-medium">
          {money.format(expense.amount)}
        </span>
        {expense.vat_amount > 0 && (
          <span className="text-xs text-muted-foreground">
            {money.format(expense.vat_amount)} VAT
          </span>
        )}
      </span>
      <span className="text-right font-semibold">
        {money.format(expense.allowable_amount)}
      </span>
      {deleted ? (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => onRestore(expense)}
          aria-label="Restore expense"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          disabled={expense.is_bad_debt === 1}
          onClick={() => onDelete(expense)}
          aria-label="Move expense to recycle bin"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [view, setView] = useState<ExpenseView>(() =>
    ["needs-receipt", "recurring", "mixed-use", "quarter"].includes(
      searchParams.get("view") ?? "",
    )
      ? (searchParams.get("view") as ExpenseView)
      : "all",
  );
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);
  const [categoryId, setCategoryId] = useState("all");
  const [taxYear, setTaxYear] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  useEffect(() => {
    if (searchParams.get("new") !== "expense") return;
    setEditingExpense(null);
    setEditorOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [error, setError] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const { confirm, toast } = useFeedback();
  const needsReceipt = view === "needs-receipt";
  const expenseQuery = useExpenses({
    search,
    categoryId,
    taxYear,
    dateFrom,
    dateTo,
    deleted: showDeleted,
    receiptMissing: needsReceipt,
  });
  const { data: expenses, isLoading } = expenseQuery;
  const categoryQuery = useExpenseCategories();
  const taxYearQuery = useTaxYearConfigs();
  const recurringQuery = useDueRecurringExpenses();
  const { data: categories } = categoryQuery;
  const { data: taxYears } = taxYearQuery;
  const { data: dueRecurring } = recurringQuery;
  const processRecurring = useProcessRecurringExpenses();
  const processedAutoSchedule = useRef("");
  const deleteExpense = useDeleteExpense();
  const restoreExpense = useRestoreExpense();
  const bulkDelete = useBulkDeleteExpenses();
  const bulkCategorise = useBulkCategoriseExpenses();

  const quarterStartMonth = Math.floor(new Date().getMonth() / 3) * 3;
  const quarterStart = new Date(new Date().getFullYear(), quarterStartMonth, 1)
    .toISOString()
    .slice(0, 10);
  const rows = (expenses ?? [])
    .filter((expense) => view !== "recurring" || expense.is_recurring === 1)
    .filter((expense) => view !== "mixed-use" || expense.business_percent < 100)
    .filter((expense) => view !== "quarter" || expense.date >= quarterStart);
  const total = rows.reduce((sum, expense) => sum + expense.amount, 0);
  const vat = rows.reduce((sum, expense) => sum + expense.vat_amount, 0);
  const allowable = rows.reduce(
    (sum, expense) => sum + expense.allowable_amount,
    0,
  );
  const selectedRows = rows.filter((expense) => selectedIds.has(expense.id));

  useEffect(() => {
    const schedule = (dueRecurring ?? [])
      .filter((expense) => expense.recurring_auto_create === 1)
      .map((expense) => `${expense.id}:${expense.recurring_next_date}`)
      .join("|");
    if (
      schedule &&
      schedule !== processedAutoSchedule.current &&
      !processRecurring.isPending
    ) {
      processedAutoSchedule.current = schedule;
      processRecurring.mutate(false);
    }
    if (!schedule) processedAutoSchedule.current = "";
  }, [dueRecurring, processRecurring]);

  const remove = async (expense: Expense) => {
    if (
      !(await confirm({
        title: "Move expense to recycle bin?",
        description: `“${expense.description}” will leave your active expense list and can be restored later.`,
        confirmLabel: "Move to recycle bin",
        destructive: true,
      }))
    )
      return;
    setError("");
    try {
      await deleteExpense.mutateAsync(expense.id);
      toast("Expense moved to recycle bin", {
        actionLabel: "Undo",
        onAction: () => restoreExpense.mutateAsync(expense.id),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expense could not be deleted.",
      );
    }
  };

  const toggleSelected = (expense: Expense) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(expense.id)) next.delete(expense.id);
      else next.add(expense.id);
      return next;
    });
  const deleteSelected = async () => {
    if (
      !(await confirm({
        title: `Move ${selectedRows.length} expenses to recycle bin?`,
        description:
          "The selected expenses can be restored from the recycle bin.",
        confirmLabel: "Move expenses",
        destructive: true,
      }))
    )
      return;
    const removed = selectedRows.map((expense) => expense.id);
    try {
      await bulkDelete.mutateAsync(removed);
      setSelectedIds(new Set());
      toast(`${removed.length} expenses moved to recycle bin`, {
        actionLabel: "Undo",
        onAction: () =>
          Promise.all(removed.map((id) => restoreExpense.mutateAsync(id))),
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Expenses could not be deleted.",
      );
    }
  };
  const categoriseSelected = async () => {
    if (!bulkCategory) return;
    const previous = new Map<number, number[]>();
    selectedRows.forEach((expense) =>
      previous.set(expense.category_id, [
        ...(previous.get(expense.category_id) ?? []),
        expense.id,
      ]),
    );
    const count = selectedRows.length;
    await bulkCategorise.mutateAsync({
      ids: selectedRows.map((expense) => expense.id),
      categoryId: Number(bulkCategory),
    });
    setSelectedIds(new Set());
    setBulkCategory("");
    toast(`${count} expense${count === 1 ? "" : "s"} categorised`, {
      actionLabel: "Undo",
      onAction: () =>
        Promise.all(
          [...previous].map(([categoryId, ids]) =>
            bulkCategorise.mutateAsync({ ids, categoryId }),
          ),
        ),
    });
  };
  const exportSelected = async () => {
    const destination = await save({
      defaultPath: "expenses-export.csv",
      filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
    });
    if (!destination) return;
    await writeTextFile(
      destination,
      Papa.unparse(
        selectedRows.map((expense) => ({
          Date: expense.date,
          Supplier: expense.supplier,
          Category: expense.category_name,
          Description: expense.description,
          Amount: expense.amount,
          VAT: expense.vat_amount,
          "Business use %": expense.business_percent,
          Allowable: expense.allowable_amount,
          Notes: expense.notes,
        })),
        { escapeFormulae: true },
      ),
    );
    toast("Expense export saved", {
      description: `${selectedRows.length} records exported.`,
    });
  };

  const changeView = (nextView: ExpenseView) => {
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    setSearchParams(next, { replace: true });
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("search", value);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  };

  const queries = [expenseQuery, categoryQuery, taxYearQuery, recurringQuery];
  if (isLoading || queries.some((query) => query.isLoading))
    return <PageSkeleton />;
  if (queries.some((query) => query.isError))
    return (
      <QueryErrorState
        title="Expenses could not be loaded"
        onRetry={() => Promise.all(queries.map((query) => query.refetch()))}
        isRetrying={queries.some((query) => query.isFetching)}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Money out"
        title="Expenses & receipts"
        description="Capture receipts first, classify business costs, and keep allowable deductions complete."
        primaryAction={
          <Button
            onClick={() => {
              setEditingExpense(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add expense
          </Button>
        }
        secondaryActions={
          <>
            <Button
              variant="outline"
              onClick={() => setShowDeleted((current) => !current)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {showDeleted ? "Back to expenses" : "Recycle bin"}
            </Button>
            <Button variant="ghost" onClick={() => setCategoriesOpen(true)}>
              <FolderCog className="mr-2 h-4 w-4" />
              Categories
            </Button>
          </>
        }
      />

      {!showDeleted && (
        <SavedViews
          value={view}
          onChange={changeView}
          views={[
            { value: "all", label: "All" },
            { value: "needs-receipt", label: "Needs receipt" },
            { value: "recurring", label: "Recurring" },
            { value: "mixed-use", label: "Mixed use" },
            { value: "quarter", label: "This quarter" },
          ]}
        />
      )}

      {(dueRecurring ?? []).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4" />
            <span>
              <strong>{dueRecurring?.length}</strong> recurring expense
              {dueRecurring?.length === 1 ? " is" : "s are"} due. Automatic
              entries are being created; confirm reminder-only entries when they
              have been paid.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={processRecurring.isPending}
            onClick={() => processRecurring.mutate(true)}
          >
            {processRecurring.isPending
              ? "Processing..."
              : "Create all due entries"}
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile label="Entries shown" value={rows.length} />
        <SummaryTile label="Total paid" value={money.format(total)} />
        <SummaryTile label="VAT recorded" value={money.format(vat)} />
        <SummaryTile
          label="Allowable amount"
          value={money.format(allowable)}
          tone="positive"
        />
      </div>

      <FilterToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Search supplier, description, or notes..."
        activeCount={
          (search ? 1 : 0) +
          (categoryId !== "all" ? 1 : 0) +
          (taxYear !== "all" ? 1 : 0) +
          (dateFrom ? 1 : 0) +
          (dateTo ? 1 : 0)
        }
        onClear={() => {
          changeSearch("");
          setCategoryId("all");
          setTaxYear("all");
          setDateFrom("");
          setDateTo("");
        }}
      >
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categories ?? []).map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                {category.name}
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
        <Input
          className="w-36"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label="From date"
        />
        <Input
          className="w-36"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          aria-label="To date"
        />
      </FilterToolbar>

      {selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-3">
          <span className="mr-auto text-sm font-medium">
            {selectedRows.length} selected
          </span>
          <Select
            value={bulkCategory || "none"}
            onValueChange={(value) =>
              setBulkCategory(value === "none" ? "" : value)
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Choose category" />
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
          <Button
            size="sm"
            variant="outline"
            disabled={!bulkCategory || bulkCategorise.isPending}
            onClick={() => void categoriseSelected()}
          >
            Apply category
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void exportSelected()}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={bulkDelete.isPending}
            onClick={() => void deleteSelected()}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-md border bg-card">
        <div className="min-w-230">
          <div className="grid grid-cols-[32px_105px_minmax(150px,1fr)_minmax(200px,1.5fr)_140px_105px_105px_44px] gap-3 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <input
              type="checkbox"
              aria-label="Select all shown expenses"
              disabled={
                showDeleted ||
                rows.every((expense) => expense.is_bad_debt === 1)
              }
              checked={
                selectedRows.length > 0 &&
                selectedRows.length ===
                  rows.filter((expense) => expense.is_bad_debt === 0).length
              }
              onChange={(event) =>
                setSelectedIds(
                  event.target.checked
                    ? new Set(
                        rows
                          .filter((expense) => expense.is_bad_debt === 0)
                          .map((expense) => expense.id),
                      )
                    : new Set(),
                )
              }
            />
            <span>Date</span>
            <span>Supplier / category</span>
            <span>Description</span>
            <span>Receipt</span>
            <span className="text-right">Paid</span>
            <span className="text-right">Allowable</span>
            <span />
          </div>
          {rows.length > 0 ? (
            rows.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                deleted={showDeleted}
                selected={selectedIds.has(expense.id)}
                onToggle={toggleSelected}
                onEdit={(selected) => {
                  setEditingExpense(selected);
                  setEditorOpen(true);
                }}
                onDelete={(selected) => void remove(selected)}
                onRestore={(selected) => restoreExpense.mutate(selected.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={FileText}
              title={
                showDeleted
                  ? "Recycle bin is empty"
                  : "No expenses match this view"
              }
              description={
                showDeleted
                  ? "Expenses moved here can be restored before permanent cleanup."
                  : "Choose another view, clear filters, or record a new expense."
              }
            />
          )}
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <ExpenseEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingExpense(null);
        }}
        expense={editingExpense}
      />
      <CategoryManagerDialog
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
      />
    </div>
  );
}

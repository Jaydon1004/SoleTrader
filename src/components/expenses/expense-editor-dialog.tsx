import { useEffect, useState } from "react";
import { addMonths, format } from "date-fns";
import { ChevronDown, FileText, Paperclip, QrCode, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserProfile } from "@/lib/queries/settings";
import {
  useCreateExpense,
  useExpenseCategories,
  useExpenseSuppliers,
  useUpdateExpense,
  type Expense,
  type ExpenseFrequency,
  type StoredReceipt,
} from "@/lib/queries/expenses";
import {
  chooseAndStoreReceipt,
  deleteStoredFile,
  openStoredReceipt,
} from "@/lib/receipt-storage";
import { MobileReceiptDialog } from "@/components/expenses/mobile-receipt-dialog";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: Expense | null;
}

export function ExpenseEditorDialog({ open, onOpenChange, expense }: Props) {
  const { data: categories } = useExpenseCategories();
  const { data: suppliers } = useExpenseSuppliers();
  const { data: profile } = useUserProfile();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const [categoryId, setCategoryId] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [vatEcAcquisition, setVatEcAcquisition] = useState(false);
  const [vatCapitalAsset, setVatCapitalAsset] = useState(false);
  const [businessPercent, setBusinessPercent] = useState("100");
  const [notes, setNotes] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const [receipt, setReceipt] = useState<StoredReceipt | null | undefined>(
    undefined,
  );
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [nextDate, setNextDate] = useState("");
  const [autoCreate, setAutoCreate] = useState(false);
  const [error, setError] = useState("");
  const [selectingReceipt, setSelectingReceipt] = useState(false);
  const [mobileReceiptOpen, setMobileReceiptOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { closeAfterSave, dirtyCaptureProps, markDirty, requestClose } =
    useUnsavedDialog({
      open,
      onOpenChange,
      subject: "expense",
      onDiscard: async () => {
        if (receipt)
          await deleteStoredFile(receipt.path).catch(() => undefined);
      },
    });

  const vatRegistered = profile?.vat_status !== "unregistered";
  const isPending = createExpense.isPending || updateExpense.isPending;

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    setCategoryId(
      expense
        ? String(expense.category_id)
        : categories?.[0]
          ? String(categories[0].id)
          : "",
    );
    setExpenseDate(expense?.date ?? format(today, "yyyy-MM-dd"));
    setSupplier(expense?.supplier ?? "");
    setDescription(expense?.description ?? "");
    setAmount(expense ? String(expense.amount) : "");
    setVatAmount(expense?.vat_amount ? String(expense.vat_amount) : "");
    setVatEcAcquisition(expense?.vat_ec_acquisition === 1);
    setVatCapitalAsset(expense?.vat_capital_asset === 1);
    setBusinessPercent(String(expense?.business_percent ?? 100));
    setNotes(expense?.notes ?? "");
    setReceiptPath(expense?.receipt_path ?? "");
    setReceipt(undefined);
    setIsRecurring(expense?.is_recurring === 1);
    setFrequency(expense?.recurring_frequency ?? "monthly");
    setNextDate(
      expense?.recurring_next_date ?? format(addMonths(today, 1), "yyyy-MM-dd"),
    );
    setAutoCreate(expense?.recurring_auto_create === 1);
    setShowMore(
      Boolean(
        expense &&
        (expense.business_percent < 100 ||
          expense.is_recurring === 1 ||
          expense.notes ||
          expense.vat_ec_acquisition === 1 ||
          expense.vat_capital_asset === 1),
      ),
    );
    setError("");
  }, [categories, expense, open]);

  const pickReceipt = async () => {
    setSelectingReceipt(true);
    setError("");
    try {
      const selected = await chooseAndStoreReceipt();
      if (selected) {
        if (receipt)
          await deleteStoredFile(receipt.path).catch(() => undefined);
        markDirty();
        setReceipt(selected);
        setReceiptPath(selected.path);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Receipt could not be stored.",
      );
    } finally {
      setSelectingReceipt(false);
    }
  };

  const receiveMobileReceipt = async (selected: StoredReceipt) => {
    if (receipt) await deleteStoredFile(receipt.path).catch(() => undefined);
    markDirty();
    setReceipt(selected);
    setReceiptPath(selected.path);
  };

  const handleSave = async () => {
    setError("");
    const parsedAmount = Number(amount);
    const parsedVat = vatRegistered ? Number(vatAmount || 0) : 0;
    const parsedBusiness = Number(businessPercent);
    if (!categoryId) return setError("Select an expense category.");
    if (!expenseDate) return setError("Enter the expense date.");
    if (!description.trim()) return setError("Enter a description.");
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return setError("Amount must be greater than zero.");
    if (
      !Number.isFinite(parsedVat) ||
      parsedVat < 0 ||
      parsedVat > parsedAmount
    )
      return setError("VAT must be between zero and the total amount.");
    if (
      !Number.isFinite(parsedBusiness) ||
      parsedBusiness < 1 ||
      parsedBusiness > 100
    )
      return setError("Business use must be between 1% and 100%.");
    if (isRecurring && !nextDate)
      return setError("Choose the next recurring date.");

    const payload = {
      category_id: Number(categoryId),
      date: expenseDate,
      supplier: supplier.trim(),
      description: description.trim(),
      amount: parsedAmount,
      vat_amount: parsedVat,
      vat_ec_acquisition: vatRegistered && vatEcAcquisition,
      vat_capital_asset: vatRegistered && vatCapitalAsset,
      business_percent: parsedBusiness,
      receipt_path: receiptPath,
      receipt_file: receipt,
      notes: notes.trim(),
      is_recurring: isRecurring,
      recurring_frequency: isRecurring ? frequency : null,
      recurring_next_date: isRecurring ? nextDate : null,
      recurring_auto_create: isRecurring && autoCreate,
    };
    try {
      if (expense)
        await updateExpense.mutateAsync({ id: expense.id, ...payload });
      else await createExpense.mutateAsync(payload);
      setReceipt(undefined);
      closeAfterSave();
    } catch (caught) {
      if (receipt) {
        setReceipt(undefined);
        setReceiptPath(expense?.receipt_path ?? "");
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Expense could not be saved.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
    >
      <DialogContent
        className="max-h-[94vh] max-w-3xl overflow-y-auto"
        {...dirtyCaptureProps}
      >
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Add expense"}</DialogTitle>
          <DialogDescription>
            Record the amount paid, allowable business use, VAT, and supporting
            receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-md border bg-muted/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label>Receipt</Label>
                <p className="text-xs text-muted-foreground">
                  Start with the evidence. Add a local file or send a photo from
                  your phone.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setMobileReceiptOpen(true)}
                >
                  <QrCode className="mr-2 h-4 w-4" />
                  From phone
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={pickReceipt}
                  disabled={selectingReceipt}
                >
                  <Paperclip className="mr-2 h-4 w-4" />
                  {selectingReceipt
                    ? "Selecting..."
                    : receiptPath
                      ? "Replace receipt"
                      : "Choose file"}
                </Button>
              </div>
            </div>
            {receiptPath && (
              <div className="mt-3 flex items-center justify-between rounded-md bg-card p-3 text-sm">
                <button
                  className="flex min-w-0 items-center gap-2 hover:underline"
                  onClick={() => void openStoredReceipt(receiptPath)}
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {receipt?.fileName ?? receiptPath.split("/").pop()}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (receipt)
                      void deleteStoredFile(receipt.path).catch(
                        () => undefined,
                      );
                    setReceiptPath("");
                    setReceipt(null);
                  }}
                  aria-label="Remove receipt"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Use the date the expense was paid, including an earlier date
                from before you installed SoleTrader. It will be assigned to
                that UK tax year automatically.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((category) => (
                    <SelectItem key={category.id} value={String(category.id)}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Supplier</Label>
              <Input
                list="expense-suppliers"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Supplier or shop"
              />
              <datalist id="expense-suppliers">
                {(suppliers ?? []).map((name) => (
                  <option value={name} key={name} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What was purchased?"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Total amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>VAT included</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={vatAmount}
                onChange={(event) => setVatAmount(event.target.value)}
                placeholder="0.00"
                disabled={!vatRegistered}
              />
              <p className="text-xs text-muted-foreground">
                {vatRegistered
                  ? "VAT shown on the receipt"
                  : "Enable VAT registration in Settings"}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between border"
            onClick={() => setShowMore((current) => !current)}
            aria-expanded={showMore}
          >
            More options
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showMore ? "rotate-180" : ""}`}
            />
          </Button>
          {showMore && (
            <div className="space-y-5 rounded-md border p-4">
              <div className="space-y-2">
                <Label>Business use %</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={businessPercent}
                  onChange={(event) => setBusinessPercent(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Reduce this only for mixed personal and business costs.
                </p>
              </div>
              {vatRegistered && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div>
                      <Label htmlFor="vat-ec-acquisition">
                        EC goods acquisition
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Include acquisition VAT in Box 2 and net goods in Box 9.
                      </p>
                    </div>
                    <Switch
                      id="vat-ec-acquisition"
                      checked={vatEcAcquisition}
                      onCheckedChange={setVatEcAcquisition}
                    />
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                    <div>
                      <Label htmlFor="vat-capital-asset">
                        Flat-rate capital goods
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Mark eligible capital goods whose VAT may be reclaimed
                        under the Flat Rate Scheme.
                      </p>
                    </div>
                    <Switch
                      id="vat-capital-asset"
                      checked={vatCapitalAsset}
                      onCheckedChange={setVatCapitalAsset}
                    />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional accounting notes"
                />
              </div>
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="recurring-expense">Recurring expense</Label>
                    <p className="text-xs text-muted-foreground">
                      Track repeating subscriptions, rent, insurance, and
                      similar costs.
                    </p>
                  </div>
                  <Switch
                    id="recurring-expense"
                    checked={isRecurring}
                    onCheckedChange={setIsRecurring}
                  />
                </div>
                {isRecurring && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Frequency</Label>
                      <Select
                        value={frequency}
                        onValueChange={(value) =>
                          setFrequency(value as ExpenseFrequency)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="fortnightly">
                            Fortnightly
                          </SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="quarterly">Quarterly</SelectItem>
                          <SelectItem value="yearly">Yearly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Next date</Label>
                      <Input
                        type="date"
                        value={nextDate}
                        onChange={(event) => setNextDate(event.target.value)}
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="auto-create-expense"
                          checked={autoCreate}
                          onCheckedChange={setAutoCreate}
                        />
                        <Label htmlFor="auto-create-expense">
                          Auto-create entry
                        </Label>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => void requestClose()}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || (categories ?? []).length === 0}
          >
            {isPending ? "Saving..." : "Save expense"}
          </Button>
        </DialogFooter>
        <MobileReceiptDialog
          open={mobileReceiptOpen}
          onOpenChange={setMobileReceiptOpen}
          onReceived={receiveMobileReceipt}
        />
      </DialogContent>
    </Dialog>
  );
}

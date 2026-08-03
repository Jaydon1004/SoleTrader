import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
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
import { useClients } from "@/lib/queries/clients";
import {
  useInvoiceSettings,
  useTaxYearConfig,
  useUserProfile,
} from "@/lib/queries/settings";
import {
  useCreateInvoice,
  useUpdateInvoice,
  type InvoiceDetail,
  type InvoiceInput,
  type RecurringFrequency,
} from "@/lib/queries/invoices";
import { useFeedback } from "@/components/feedback-provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice?: InvoiceDetail | null;
  initialQuote?: boolean;
  initialClientId?: number | null;
  onSaved?: (invoiceId: number) => void;
}

type EditableItem = InvoiceInput["line_items"][number] & { key: string };

const newLine = (): EditableItem => ({
  key: crypto.randomUUID(),
  description: "",
  quantity: 1,
  unit_price: 0,
  vat_rate: null,
});

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function taxYearForDate(value: string) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const startYear = date >= new Date(year, 3, 6) ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function InvoiceEditorDialog({
  open,
  onOpenChange,
  invoice,
  initialQuote = false,
  initialClientId = null,
  onSaved,
}: Props) {
  const { data: clients } = useClients(false);
  const { data: settings } = useInvoiceSettings();
  const { data: profile } = useUserProfile();
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();
  const { confirm } = useFeedback();
  const [clientId, setClientId] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<EditableItem[]>([newLine()]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFrequency>("monthly");
  const [nextDate, setNextDate] = useState("");
  const [autoCreate, setAutoCreate] = useState(false);
  const [vatEcSupply, setVatEcSupply] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const { data: taxConfig } = useTaxYearConfig(taxYearForDate(issueDate));

  const isQuote = invoice ? invoice.is_quote === 1 : initialQuote;
  const isEditing = Boolean(invoice);
  const vatEnabled = profile?.vat_status !== "unregistered";

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    const defaultIssue = format(today, "yyyy-MM-dd");
    const terms = settings?.payment_terms_days ?? 30;
    setClientId(
      invoice
        ? String(invoice.client_id)
        : initialClientId
          ? String(initialClientId)
          : "",
    );
    setIssueDate(invoice?.issue_date ?? defaultIssue);
    setDueDate(
      invoice?.due_date ?? format(addDays(today, terms), "yyyy-MM-dd"),
    );
    setNotes(invoice?.notes ?? "");
    setInternalNotes(invoice?.internal_notes ?? "");
    setItems(
      invoice?.line_items.map((item) => ({
        key: String(item.id),
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        vat_rate: item.vat_rate,
      })) ?? [newLine()],
    );
    setIsRecurring(invoice?.is_recurring === 1);
    setFrequency(invoice?.recurring_frequency ?? "monthly");
    setNextDate(
      invoice?.recurring_next_date ??
        format(addDays(today, terms), "yyyy-MM-dd"),
    );
    setAutoCreate(invoice?.recurring_auto_create === 1);
    setVatEcSupply(invoice?.vat_ec_supply === 1);
    setError("");
    setFieldErrors({});
    setDirty(false);
  }, [initialClientId, invoice, open, settings?.payment_terms_days]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (open && dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, open]);

  const requestClose = async () => {
    if (
      dirty &&
      !(await confirm({
        title: `Discard unsaved ${isQuote ? "quote" : "invoice"}?`,
        description: "The changes in this editor have not been saved.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    setDirty(false);
    onOpenChange(false);
  };

  const updateItem = (
    key: string,
    field: keyof EditableItem,
    value: string | number | null,
  ) => {
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  };

  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const vatAmount = items.reduce(
    (sum, item) =>
      sum + item.quantity * item.unit_price * ((item.vat_rate ?? 0) / 100),
    0,
  );
  const isPending = createInvoice.isPending || updateInvoice.isPending;
  const vatRates = Array.from(
    new Set(
      [
        0,
        taxConfig?.vat_reduced_rate_percent,
        taxConfig?.vat_standard_rate_percent,
      ].filter((rate): rate is number => rate !== undefined),
    ),
  );
  const selectedClient = (clients ?? []).find(
    (client) => client.id === Number(clientId),
  );

  const handleIssueDate = (value: string) => {
    setIssueDate(value);
    if (value)
      setDueDate(
        format(
          addDays(
            new Date(`${value}T00:00:00`),
            settings?.payment_terms_days ?? 30,
          ),
          "yyyy-MM-dd",
        ),
      );
  };

  const handleSave = async () => {
    setError("");
    setFieldErrors({});
    const validItems = items.filter((item) => item.description.trim());
    if (!clientId) {
      setFieldErrors({ client: "Select a client." });
      return setError("Select a client.");
    }
    if (!issueDate || !dueDate) {
      setFieldErrors({ dates: "Enter an issue date and due date." });
      return setError("Enter an issue date and due date.");
    }
    if (dueDate < issueDate) {
      const message = `${isQuote ? "Valid until" : "Due date"} cannot be before the issue date.`;
      setFieldErrors({ dates: message });
      return setError(message);
    }
    if (validItems.length === 0) {
      setFieldErrors({
        items: "Add at least one line item with a description.",
      });
      return setError("Add at least one line item with a description.");
    }
    if (validItems.some((item) => item.quantity <= 0 || item.unit_price < 0)) {
      setFieldErrors({
        items:
          "Line quantities must be positive and prices cannot be negative.",
      });
      return setError(
        "Line quantities must be positive and prices cannot be negative.",
      );
    }
    if (isRecurring && !nextDate) {
      setFieldErrors({ recurring: "Choose the next recurring date." });
      return setError("Choose the next recurring date.");
    }

    const payload: InvoiceInput = {
      client_id: Number(clientId),
      issue_date: issueDate,
      due_date: dueDate,
      vat_ec_supply: vatEnabled && !isQuote && vatEcSupply,
      notes: notes.trim(),
      internal_notes: internalNotes.trim(),
      is_quote: isQuote,
      is_recurring: !isQuote && isRecurring,
      recurring_frequency: !isQuote && isRecurring ? frequency : null,
      recurring_next_date: !isQuote && isRecurring ? nextDate : null,
      recurring_auto_create: !isQuote && isRecurring && autoCreate,
      line_items: validItems.map(
        ({ description, quantity, unit_price, vat_rate }) => ({
          description: description.trim(),
          quantity,
          unit_price,
          vat_rate: vatEnabled ? vat_rate : null,
        }),
      ),
    };

    try {
      const savedId = invoice?.id ?? (await createInvoice.mutateAsync(payload));
      if (invoice)
        await updateInvoice.mutateAsync({ id: invoice.id, ...payload });
      setDirty(false);
      onOpenChange(false);
      onSaved?.(savedId);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Invoice could not be saved.",
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
        className="flex h-[calc(100vh-2rem)] max-h-none max-w-7xl flex-col overflow-hidden p-0"
        onInputCapture={() => setDirty(true)}
      >
        <div className="border-b px-6 pb-4 pt-6">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit" : "Create"} {isQuote ? "quote" : "invoice"}
            </DialogTitle>
            <DialogDescription>
              {isQuote
                ? "Prepare a quote that can later be converted into an invoice."
                : "Draft the invoice, review the totals, then issue it from the invoice list."}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(340px,0.72fr)] lg:overflow-hidden">
          <div className="space-y-5 p-6 lg:overflow-y-auto">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-1">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger aria-invalid={Boolean(fieldErrors.client)}>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((client) => (
                      <SelectItem value={String(client.id)} key={client.id}>
                        {client.company || client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.client && (
                  <p className="text-xs text-destructive" role="alert">
                    {fieldErrors.client}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Issue date</Label>
                <Input
                  type="date"
                  value={issueDate}
                  onChange={(event) => handleIssueDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{isQuote ? "Valid until" : "Due date"}</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            </div>
            {fieldErrors.dates && (
              <p className="text-xs text-destructive" role="alert">
                {fieldErrors.dates}
              </p>
            )}

            <div>
              <div className="mb-2 grid grid-cols-[minmax(180px,1fr)_75px_110px_95px_40px] gap-2 text-xs font-medium text-muted-foreground">
                <span>Description</span>
                <span>Quantity</span>
                <span>Unit price</span>
                <span>VAT rate</span>
                <span />
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div
                    className="grid grid-cols-[minmax(180px,1fr)_75px_110px_95px_40px] gap-2"
                    key={item.key}
                  >
                    <Input
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.key, "description", event.target.value)
                      }
                      placeholder="Work or service supplied"
                    />
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(
                          item.key,
                          "quantity",
                          Number(event.target.value),
                        )
                      }
                    />
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unit_price}
                      onChange={(event) =>
                        updateItem(
                          item.key,
                          "unit_price",
                          Number(event.target.value),
                        )
                      }
                    />
                    <Select
                      disabled={!vatEnabled}
                      value={
                        item.vat_rate === null ? "none" : String(item.vat_rate)
                      }
                      onValueChange={(value) =>
                        updateItem(
                          item.key,
                          "vat_rate",
                          value === "none" ? null : Number(value),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No VAT</SelectItem>
                        {vatRates.map((rate) => (
                          <SelectItem value={String(rate)} key={rate}>
                            {rate}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={items.length === 1}
                      onClick={() =>
                        setItems((current) =>
                          current.filter(
                            (candidate) => candidate.key !== item.key,
                          ),
                        )
                      }
                      aria-label="Remove line item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              {fieldErrors.items && (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {fieldErrors.items}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setItems((current) => [...current, newLine()])}
              >
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Notes printed on {isQuote ? "quote" : "invoice"}</Label>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Thank you for your business."
                />
              </div>
              <div className="space-y-2">
                <Label>Internal notes</Label>
                <Textarea
                  rows={3}
                  value={internalNotes}
                  onChange={(event) => setInternalNotes(event.target.value)}
                  placeholder="Not shown to the client"
                />
              </div>
            </div>

            {!isQuote && (
              <div className="rounded-md border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="recurring">Recurring invoice</Label>
                    <p className="text-xs text-muted-foreground">
                      Create future drafts from this invoice.
                    </p>
                  </div>
                  <Switch
                    id="recurring"
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
                          setFrequency(value as RecurringFrequency)
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
                          id="auto-create"
                          checked={autoCreate}
                          onCheckedChange={setAutoCreate}
                        />
                        <Label htmlFor="auto-create">Auto-create draft</Label>
                      </div>
                    </div>
                  </div>
                )}
                {fieldErrors.recurring && (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    {fieldErrors.recurring}
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="border-t bg-muted/40 p-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Live preview
            </p>
            <div className="mx-auto min-h-140 max-w-md rounded-md border bg-white p-6 text-neutral-900 shadow-sm">
              <div className="flex items-start justify-between gap-4 border-b pb-5">
                <div>
                  <p className="text-xl font-bold">
                    {isQuote ? "QUOTE" : "INVOICE"}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    {invoice?.display_reference ??
                      (isQuote ? "Draft quote" : "Draft invoice")}
                  </p>
                </div>
                <div className="text-right text-xs text-neutral-600">
                  <p>Issued {issueDate || "Not set"}</p>
                  <p className="mt-1">
                    {isQuote ? "Valid until" : "Due"} {dueDate || "Not set"}
                  </p>
                </div>
              </div>
              <div className="py-5">
                <p className="text-[11px] font-semibold uppercase text-neutral-500">
                  For
                </p>
                <p className="mt-1 font-semibold">
                  {selectedClient?.company ||
                    selectedClient?.name ||
                    "Choose a client"}
                </p>
                {selectedClient?.company && (
                  <p className="text-sm text-neutral-600">
                    {selectedClient.name}
                  </p>
                )}
              </div>
              <div className="border-y">
                <div className="grid grid-cols-[1fr_55px_80px] gap-2 py-2 text-[11px] font-semibold uppercase text-neutral-500">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Amount</span>
                </div>
                {items
                  .filter((item) => item.description.trim())
                  .map((item) => (
                    <div
                      className="grid grid-cols-[1fr_55px_80px] gap-2 border-t py-2 text-sm"
                      key={item.key}
                    >
                      <span>{item.description}</span>
                      <span className="text-right tabular-nums">
                        {item.quantity}
                      </span>
                      <span className="text-right tabular-nums">
                        {money.format(item.quantity * item.unit_price)}
                      </span>
                    </div>
                  ))}
                {items.every((item) => !item.description.trim()) && (
                  <p className="border-t py-8 text-center text-sm text-neutral-400">
                    Line items appear here
                  </p>
                )}
              </div>
              <div className="ml-auto mt-5 w-52 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span className="tabular-nums">{money.format(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">VAT</span>
                  <span className="tabular-nums">
                    {money.format(vatAmount)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2 text-lg font-bold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {money.format(subtotal + vatAmount)}
                  </span>
                </div>
              </div>
              {notes && (
                <p className="mt-8 whitespace-pre-wrap border-t pt-4 text-xs text-neutral-600">
                  {notes}
                </p>
              )}
            </div>
            {!vatEnabled && (
              <p className="mx-auto mt-3 max-w-md text-xs text-muted-foreground">
                VAT is disabled because the business is marked unregistered in
                Settings.
              </p>
            )}
            {vatEnabled && !isQuote && (
              <div className="mx-auto mt-3 flex max-w-md items-start justify-between gap-3 rounded-md border bg-card p-3">
                <div>
                  <Label htmlFor="vat-ec-supply">EC goods supply</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Include the net value in VAT return Box 8.
                  </p>
                </div>
                <Switch
                  id="vat-ec-supply"
                  checked={vatEcSupply}
                  onCheckedChange={setVatEcSupply}
                />
              </div>
            )}
          </aside>
        </div>

        <div className="border-t bg-card px-6 py-4">
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
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
              disabled={isPending || (clients ?? []).length === 0}
            >
              {isPending
                ? "Saving..."
                : `Save & review ${isQuote ? "quote" : "invoice"}`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

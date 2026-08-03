import { useEffect, useState } from "react";
import { addDays, format } from "date-fns";
import { FileCheck2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/lib/queries/clients";
import {
  useCreateSelfBilledInvoice,
  type SelfBilledInvoiceInput,
} from "@/lib/queries/invoices";
import {
  useActiveSelfBillingAgreements,
  useSelfBillingDocuments,
} from "@/lib/queries/self-billing";
import {
  useInvoiceSettings,
  useTaxYearConfig,
  useUserProfile,
} from "@/lib/queries/settings";
import { SelfBillingAgreementDialog } from "@/components/invoices/self-billing-agreement-dialog";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
type Line = SelfBilledInvoiceInput["line_items"][number] & { key: string };
const newLine = (): Line => ({
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

export function SelfBilledInvoiceDialog({ open, onOpenChange }: Props) {
  const { data: clients } = useClients(false);
  const { data: settings } = useInvoiceSettings();
  const { data: profile } = useUserProfile();
  const create = useCreateSelfBilledInvoice();
  const [clientId, setClientId] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [agreementId, setAgreementId] = useState("none");
  const [checksConfirmed, setChecksConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<Line[]>([newLine()]);
  const [agreementsOpen, setAgreementsOpen] = useState(false);
  const [error, setError] = useState("");
  const { closeAfterSave, dirtyCaptureProps, markDirty, requestClose } =
    useUnsavedDialog({ open, onOpenChange, subject: "self-billed invoice" });
  const numericClientId = clientId ? Number(clientId) : null;
  const { data: documents } = useSelfBillingDocuments(
    numericClientId,
    "invoice",
  );
  const { data: agreements } = useActiveSelfBillingAgreements(
    numericClientId,
    issueDate,
  );
  const { data: taxConfig } = useTaxYearConfig(taxYearForDate(issueDate));
  const vatEnabled = profile?.vat_status !== "unregistered";

  useEffect(() => {
    if (!open) return;
    const today = new Date();
    setClientId("");
    setReference("");
    setIssueDate(format(today, "yyyy-MM-dd"));
    setDueDate(
      format(addDays(today, settings?.payment_terms_days ?? 30), "yyyy-MM-dd"),
    );
    setDocumentId("");
    setAgreementId("none");
    setChecksConfirmed(false);
    setNotes("");
    setInternalNotes("");
    setItems([newLine()]);
    setError("");
  }, [open, settings?.payment_terms_days]);

  useEffect(() => {
    if (
      agreementId !== "none" &&
      !(agreements ?? []).some(
        (agreement) => String(agreement.id) === agreementId,
      )
    )
      setAgreementId("none");
  }, [agreementId, agreements]);

  const updateLine = (
    key: string,
    field: keyof Line,
    value: string | number | null,
  ) =>
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, [field]: value } : item,
      ),
    );
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const vatAmount = items.reduce(
    (sum, item) =>
      sum + item.quantity * item.unit_price * ((item.vat_rate ?? 0) / 100),
    0,
  );
  const vatRates = Array.from(
    new Set(
      [
        0,
        taxConfig?.vat_reduced_rate_percent,
        taxConfig?.vat_standard_rate_percent,
      ].filter((rate): rate is number => rate !== undefined),
    ),
  );

  const save = async () => {
    setError("");
    const validItems = items.filter((item) => item.description.trim());
    if (!clientId)
      return setError("Select the customer who issued the self-bill.");
    if (!reference.trim())
      return setError("Enter the customer's self-billed invoice reference.");
    if (!issueDate || !dueDate || dueDate < issueDate)
      return setError("Enter valid issue and due dates.");
    if (!documentId)
      return setError("Select the original self-billed invoice document.");
    if (
      !validItems.length ||
      validItems.some((item) => item.quantity <= 0 || item.unit_price < 0)
    )
      return setError("Add at least one valid line item.");
    if (vatAmount > 0.005 && agreementId === "none")
      return setError(
        "VAT self-bills require an active written agreement covering the invoice date.",
      );
    if (vatAmount > 0.005 && !checksConfirmed)
      return setError(
        "Confirm that the customer invoice contains the required self-billing and VAT details.",
      );
    try {
      await create.mutateAsync({
        client_id: Number(clientId),
        external_reference: reference.trim(),
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes.trim(),
        internal_notes: internalNotes.trim(),
        source_document_id: Number(documentId),
        self_billing_agreement_id:
          agreementId === "none" ? null : Number(agreementId),
        self_billing_checks_confirmed: checksConfirmed,
        line_items: validItems.map(
          ({ description, quantity, unit_price, vat_rate }) => ({
            description: description.trim(),
            quantity,
            unit_price,
            vat_rate: vatEnabled ? vat_rate : null,
          }),
        ),
      });
      closeAfterSave();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The self-billed invoice could not be recorded.",
      );
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) void requestClose();
        }}
      >
        <DialogContent
          className="max-h-[94vh] max-w-5xl overflow-y-auto"
          {...dirtyCaptureProps}
        >
          <DialogHeader>
            <DialogTitle>Record self-billed invoice</DialogTitle>
            <DialogDescription>
              Record the customer's original reference and document. This
              creates a sales record without issuing another invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <Select
                    value={clientId}
                    onValueChange={(value) => {
                      setClientId(value);
                      setDocumentId("");
                      setAgreementId("none");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {(clients ?? []).map((client) => (
                        <SelectItem key={client.id} value={String(client.id)}>
                          {client.company || client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Customer's invoice reference</Label>
                  <Input
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="As printed on the self-bill"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Issue date</Label>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(event) => {
                      const value = event.target.value;
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
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Original self-bill document</Label>
                  <Select
                    value={documentId}
                    onValueChange={setDocumentId}
                    disabled={!numericClientId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select document" />
                    </SelectTrigger>
                    <SelectContent>
                      {(documents ?? []).map((document) => (
                        <SelectItem
                          key={document.id}
                          value={String(document.id)}
                        >
                          {document.file_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Upload the customer's PDF or image in Documents first.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Agreement covering issue date</Label>
                  <Select
                    value={agreementId}
                    onValueChange={setAgreementId}
                    disabled={!numericClientId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        No agreement selected
                      </SelectItem>
                      {(agreements ?? []).map((agreement) => (
                        <SelectItem
                          key={agreement.id}
                          value={String(agreement.id)}
                        >
                          {agreement.expiry_date} expiry
                          {agreement.document_name
                            ? ` · ${agreement.document_name}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-xs"
                    disabled={!numericClientId}
                    onClick={() => setAgreementsOpen(true)}
                  >
                    Manage agreements
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-155">
                  <div className="mb-2 grid grid-cols-[minmax(180px,1fr)_75px_110px_95px_40px] gap-2 text-xs font-medium text-muted-foreground">
                    <span>Description</span>
                    <span>Quantity</span>
                    <span>Unit price</span>
                    <span>VAT rate</span>
                    <span />
                  </div>
                  {items.map((item) => (
                    <div
                      className="mb-2 grid grid-cols-[minmax(180px,1fr)_75px_110px_95px_40px] gap-2"
                      key={item.key}
                    >
                      <Input
                        value={item.description}
                        onChange={(event) =>
                          updateLine(
                            item.key,
                            "description",
                            event.target.value,
                          )
                        }
                        placeholder="Work or service supplied"
                      />
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) =>
                          updateLine(
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
                          updateLine(
                            item.key,
                            "unit_price",
                            Number(event.target.value),
                          )
                        }
                      />
                      <Select
                        disabled={!vatEnabled}
                        value={
                          item.vat_rate === null
                            ? "none"
                            : String(item.vat_rate)
                        }
                        onValueChange={(value) =>
                          updateLine(
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
                            <SelectItem key={rate} value={String(rate)}>
                              {rate}%
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Remove ${item.description || "line item"}`}
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) =>
                            current.filter(
                              (candidate) => candidate.key !== item.key,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  markDirty();
                  setItems((current) => [...current, newLine()]);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add line
              </Button>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Record notes</Label>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Internal notes</Label>
                  <Textarea
                    rows={3}
                    value={internalNotes}
                    onChange={(event) => setInternalNotes(event.target.value)}
                  />
                </div>
              </div>
            </div>
            <aside className="h-fit space-y-4 rounded-md border bg-muted/30 p-4">
              <h3 className="text-sm font-semibold">Customer-issued total</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Net</span>
                  <span>{money.format(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{money.format(vatAmount)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Gross</span>
                  <span>{money.format(subtotal + vatAmount)}</span>
                </div>
              </div>
              {vatAmount > 0.005 && (
                <div className="border-t pt-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label htmlFor="self-bill-checks">
                        VAT wording checked
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        The original includes the required self-billing wording,
                        supplier VAT details and customer reference.
                      </p>
                    </div>
                    <Switch
                      id="self-bill-checks"
                      checked={checksConfirmed}
                      onCheckedChange={setChecksConfirmed}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-2 border-t pt-4 text-xs text-muted-foreground">
                <FileCheck2 className="h-4 w-4 shrink-0" />
                <span>
                  The original customer document remains the authoritative
                  invoice evidence.
                </span>
              </div>
            </aside>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void requestClose()}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={create.isPending}>
              {create.isPending ? "Recording..." : "Record self-billed invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <SelfBillingAgreementDialog
        open={agreementsOpen}
        onOpenChange={setAgreementsOpen}
        initialClientId={numericClientId}
      />
    </>
  );
}

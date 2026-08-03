import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  Archive,
  BadgePoundSterling,
  Download,
  FileCheck2,
  Pencil,
  ReceiptText,
  Repeat2,
  Send,
  TriangleAlert,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/loading";
import { useInvoiceSettings, useUserProfile } from "@/lib/queries/settings";
import {
  useArchiveInvoice,
  useConvertQuote,
  useCreateCreditNote,
  useInvoice,
  useRecordPayment,
  useRestoreInvoice,
  useSetInvoicePdfPath,
  useSetInvoiceStatus,
  useWriteOffBadDebt,
  type InvoiceDetail,
  type InvoiceStatus,
} from "@/lib/queries/invoices";
import { archiveInvoicePdf, saveInvoicePdf } from "@/lib/invoice-pdf";
import { SelfBilledSettlementForm } from "@/components/invoices/self-billed-settlement-form";
import { useFeedback } from "@/components/feedback-provider";

interface Props {
  invoiceId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (invoice: InvoiceDetail) => void;
  initialAction?: "payment" | "credit" | "self_billed_settlement" | null;
}

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
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

export function InvoiceDetailDialog({
  invoiceId,
  open,
  onOpenChange,
  onEdit,
  initialAction = null,
}: Props) {
  const { data: invoice, isLoading } = useInvoice(open ? invoiceId : null);
  const { data: profile } = useUserProfile();
  const { data: settings } = useInvoiceSettings();
  const setStatus = useSetInvoiceStatus();
  const setPdfPath = useSetInvoicePdfPath();
  const recordPayment = useRecordPayment();
  const createCredit = useCreateCreditNote();
  const convertQuote = useConvertQuote();
  const writeOff = useWriteOffBadDebt();
  const archive = useArchiveInvoice();
  const restore = useRestoreInvoice();
  const { confirm, toast } = useFeedback();
  const [action, setAction] = useState<
    "payment" | "credit" | "self_billed_settlement" | null
  >(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState("Bank transfer");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [actionDirty, setActionDirty] = useState(false);

  useEffect(() => {
    setAction(initialAction);
    setAmount("");
    setNotes("");
    setError("");
    setActionDirty(false);
  }, [initialAction, invoiceId, open]);

  if (!open) return null;

  const run = async (operation: () => Promise<unknown>) => {
    setError("");
    setWorking(true);
    try {
      await operation();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The action could not be completed.",
      );
    } finally {
      setWorking(false);
    }
  };

  const issueInvoice = async () => {
    if (!invoice) return;
    if (
      !(await confirm({
        title: `Issue ${invoice.display_reference}?`,
        description: `This will archive an immutable PDF and lock the ${invoice.is_quote ? "quote" : "invoice"} content. Review the client, dates, line items, VAT and payment details before continuing.`,
        confirmLabel: `Issue ${invoice.is_quote ? "quote" : "invoice"}`,
      }))
    )
      return;
    void run(async () => {
      const path = await archiveInvoicePdf(
        invoice,
        profile ?? null,
        settings ?? null,
      );
      await setPdfPath.mutateAsync({ invoiceId: invoice.id, path });
      await setStatus.mutateAsync({ id: invoice.id, status: "sent" });
      toast(`${invoice.is_quote ? "Quote" : "Invoice"} issued`, {
        description: "An immutable PDF has been archived with the record.",
      });
    });
  };

  const exportPdf = () => {
    if (!invoice) return;
    void run(() => saveInvoicePdf(invoice, profile ?? null, settings ?? null));
  };

  const submitAction = () => {
    if (!invoice) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return setError("Enter an amount greater than zero.");
    if (action === "payment") {
      void run(async () => {
        await recordPayment.mutateAsync({
          invoiceId: invoice.id,
          amount: parsedAmount,
          paymentDate: date,
          paymentMethod: method,
          notes,
        });
        setAction(null);
        setAmount("");
        setNotes("");
        setActionDirty(false);
      });
    } else if (action === "credit") {
      void run(async () => {
        await createCredit.mutateAsync({
          invoiceId: invoice.id,
          amount: parsedAmount,
          issueDate: date,
          reason: notes,
        });
        setAction(null);
        setAmount("");
        setNotes("");
        setActionDirty(false);
      });
    }
  };

  const requestActionCancel = async () => {
    if (
      actionDirty &&
      !(await confirm({
        title: "Discard this unsaved action?",
        description:
          "The payment, credit, or settlement details have not been saved.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    setAction(null);
    setActionDirty(false);
  };

  const requestClose = async () => {
    if (
      actionDirty &&
      !(await confirm({
        title: "Close with an unsaved action?",
        description:
          "The payment, credit, or settlement details have not been saved.",
        confirmLabel: "Discard and close",
        destructive: true,
      }))
    )
      return;
    setActionDirty(false);
    onOpenChange(false);
  };

  const archiveInvoice = async () => {
    if (
      !invoice ||
      !(await confirm({
        title: `Archive ${invoice.display_reference}?`,
        description:
          "It will be removed from the active invoice list while its accounting history remains intact.",
        confirmLabel: "Archive invoice",
        destructive: true,
      }))
    )
      return;
    void run(async () => {
      await archive.mutateAsync(invoice.id);
      onOpenChange(false);
      toast("Invoice archived", {
        actionLabel: "Undo",
        onAction: () => restore.mutateAsync(invoice.id),
      });
    });
  };
  const writeOffInvoice = async () => {
    if (
      !invoice ||
      !(await confirm({
        title: `Write off ${money.format(invoice.balance_due)}?`,
        description:
          "This will mark the remaining balance as bad debt and create the corresponding expense.",
        confirmLabel: "Write off balance",
        destructive: true,
      }))
    )
      return;
    void run(() => writeOff.mutateAsync(invoice.id));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
    >
      <DialogContent className="left-auto right-0 top-0 h-screen max-h-none w-full max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-r-0">
        {isLoading || !invoice ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2 pr-8">
                <DialogTitle>{invoice.display_reference}</DialogTitle>
                {invoice.source_type === "self_billed" && (
                  <Badge variant="secondary">Self-billed</Badge>
                )}
                <Badge variant={statusStyles[invoice.status]}>
                  {invoice.is_quote
                    ? "Quote"
                    : invoice.status.replace("_", " ")}
                </Badge>
                {invoice.bad_debt_written_off === 1 && (
                  <Badge variant="destructive">Bad debt written off</Badge>
                )}
              </div>
              <DialogDescription>
                {invoice.client_company || invoice.client_name} · Issued{" "}
                {invoice.issue_date}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2 border-y py-3">
              {invoice.source_type === "issued" &&
                invoice.status === "draft" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEdit(invoice)}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit draft
                  </Button>
                )}
              {invoice.source_type === "issued" &&
                invoice.status === "draft" && (
                  <Button
                    size="sm"
                    onClick={() => void issueInvoice()}
                    disabled={working}
                  >
                    <Send className="mr-2 h-4 w-4" /> Issue{" "}
                    {invoice.is_quote ? "quote" : "invoice"}
                  </Button>
                )}
              {invoice.is_quote === 1 && (
                <Button
                  size="sm"
                  onClick={() =>
                    void run(() => convertQuote.mutateAsync(invoice.id))
                  }
                  disabled={working}
                >
                  <Repeat2 className="mr-2 h-4 w-4" /> Convert to invoice
                </Button>
              )}
              {invoice.source_type === "issued" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={exportPdf}
                  disabled={working}
                >
                  <Download className="mr-2 h-4 w-4" /> Save PDF
                </Button>
              )}
              {invoice.source_type === "issued" &&
                invoice.is_quote === 0 &&
                invoice.status !== "draft" &&
                invoice.credited_amount < invoice.total &&
                invoice.bad_debt_written_off === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAction("payment");
                      setAmount(invoice.balance_due.toFixed(2));
                      setActionDirty(false);
                    }}
                  >
                    <BadgePoundSterling className="mr-2 h-4 w-4" /> Record
                    payment
                  </Button>
                )}
              {invoice.source_type === "self_billed" &&
                invoice.balance_due > 0 &&
                invoice.bad_debt_written_off === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAction("self_billed_settlement");
                      setActionDirty(true);
                    }}
                  >
                    <BadgePoundSterling className="mr-2 h-4 w-4" /> Record
                    settlement
                  </Button>
                )}
              {invoice.source_type === "issued" &&
                invoice.is_quote === 0 &&
                invoice.status !== "draft" &&
                invoice.balance_due > 0 &&
                invoice.bad_debt_written_off === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAction("credit");
                      setAmount(
                        Math.max(
                          0,
                          invoice.total - invoice.credited_amount,
                        ).toFixed(2),
                      );
                      setActionDirty(false);
                    }}
                  >
                    <ReceiptText className="mr-2 h-4 w-4" /> Credit note
                  </Button>
                )}
              {invoice.is_quote === 0 &&
                ["sent", "viewed", "partially_paid", "overdue"].includes(
                  invoice.status,
                ) &&
                invoice.balance_due > 0 &&
                invoice.bad_debt_written_off === 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void writeOffInvoice()}
                  >
                    <TriangleAlert className="mr-2 h-4 w-4" /> Write off
                  </Button>
                )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void archiveInvoice()}
              >
                <Archive className="mr-2 h-4 w-4" /> Archive
              </Button>
            </div>

            {invoice.status !== "draft" && invoice.is_quote === 0 && (
              <div className="flex items-start gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" /> Issued
                invoices are locked. Use a credit note to correct the amount
                while preserving the accounting record.
              </div>
            )}

            {invoice.source_type === "self_billed" && (
              <div className="grid gap-3 rounded-md border p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Original customer document
                  </p>
                  <p className="mt-1">
                    {invoice.source_document_name ||
                      `Document ${invoice.source_document_id}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Self-billing agreement
                  </p>
                  <p className="mt-1">
                    {invoice.self_billing_agreement_id
                      ? `${invoice.agreement_start_date} to ${invoice.agreement_expiry_date}${invoice.agreement_document_name ? ` · ${invoice.agreement_document_name}` : ""}`
                      : "No agreement linked"}
                  </p>
                </div>
              </div>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
              <div>
                <div className="overflow-hidden rounded-md border">
                  <div className="grid grid-cols-[minmax(0,1fr)_65px_95px_100px] gap-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Description</span>
                    <span className="text-right">Qty</span>
                    <span className="text-right">Rate</span>
                    <span className="text-right">Total</span>
                  </div>
                  {invoice.line_items.map((item) => (
                    <div
                      className="grid grid-cols-[minmax(0,1fr)_65px_95px_100px] gap-2 border-t px-3 py-3 text-sm"
                      key={item.id}
                    >
                      <span>
                        {item.description}
                        {item.vat_rate ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            VAT {item.vat_rate}%
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right">{item.quantity}</span>
                      <span className="text-right">
                        {money.format(item.unit_price)}
                      </span>
                      <span className="text-right font-medium">
                        {money.format(item.line_total)}
                      </span>
                    </div>
                  ))}
                </div>
                {(invoice.notes || invoice.internal_notes) && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    {invoice.notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Client notes
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {invoice.notes}
                        </p>
                      </div>
                    )}
                    {invoice.internal_notes && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          Internal notes
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">
                          {invoice.internal_notes}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <aside className="space-y-3 rounded-md border bg-muted/30 p-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{money.format(invoice.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT</span>
                  <span>{money.format(invoice.vat_amount)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total</span>
                  <span>{money.format(invoice.total)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Paid</span>
                    <span>-{money.format(invoice.amount_paid)}</span>
                  </div>
                )}
                {invoice.credited_amount > 0 && (
                  <div className="flex justify-between">
                    <span>Credited</span>
                    <span>-{money.format(invoice.credited_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-2 text-base font-semibold">
                  <span>Balance</span>
                  <span>{money.format(invoice.balance_due)}</span>
                </div>
                <div className="border-t pt-3 text-xs text-muted-foreground">
                  <p>Due {invoice.due_date}</p>
                  {invoice.is_recurring === 1 && (
                    <p className="mt-1">
                      Repeats {invoice.recurring_frequency?.replace("ly", "ly")}{" "}
                      · next {invoice.recurring_next_date}
                    </p>
                  )}
                </div>
              </aside>
            </div>

            {action === "self_billed_settlement" && (
              <SelfBilledSettlementForm
                invoice={invoice}
                onCancel={() => void requestActionCancel()}
              />
            )}

            {action && action !== "self_billed_settlement" && (
              <div className="rounded-md border p-4">
                <h3 className="mb-3 text-sm font-semibold">
                  {action === "payment"
                    ? "Record payment"
                    : "Create credit note"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input
                      type="number"
                      min="0.01"
                      max={invoice.balance_due}
                      step="0.01"
                      value={amount}
                      onChange={(event) => {
                        setAmount(event.target.value);
                        setActionDirty(true);
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(event) => {
                        setDate(event.target.value);
                        setActionDirty(true);
                      }}
                    />
                  </div>
                  {action === "payment" && (
                    <div className="space-y-2">
                      <Label>Method</Label>
                      <Select
                        value={method}
                        onValueChange={(value) => {
                          setMethod(value);
                          setActionDirty(true);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bank transfer">
                            Bank transfer
                          </SelectItem>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Card">Card</SelectItem>
                          <SelectItem value="Cheque">Cheque</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div
                    className={`space-y-2 ${action === "credit" ? "sm:col-span-2" : ""}`}
                  >
                    <Label>{action === "payment" ? "Notes" : "Reason"}</Label>
                    <Textarea
                      rows={1}
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        setActionDirty(true);
                      }}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void requestActionCancel()}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={submitAction} disabled={working}>
                    {working
                      ? "Saving..."
                      : action === "payment"
                        ? "Record payment"
                        : "Create credit"}
                  </Button>
                </div>
              </div>
            )}

            {(invoice.payments.length > 0 ||
              invoice.credit_notes.length > 0) && (
              <div className="grid gap-4 sm:grid-cols-2">
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Payments</h3>
                  <div className="space-y-2">
                    {invoice.payments.map((payment) => (
                      <div
                        className="rounded-md border p-3 text-sm"
                        key={payment.id}
                      >
                        <div className="flex justify-between">
                          <span>
                            {payment.payment_date}
                            <span className="ml-2 text-muted-foreground">
                              {payment.payment_method}
                            </span>
                          </span>
                          <span className="font-medium text-green-600 dark:text-green-400">
                            {money.format(payment.amount)}
                          </span>
                        </div>
                        {payment.cis_deduction_amount > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cash {money.format(payment.cash_amount)} · CIS
                            withheld{" "}
                            {money.format(payment.cis_deduction_amount)}
                          </p>
                        )}
                      </div>
                    ))}
                    {invoice.payments.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No payments.
                      </p>
                    )}
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold">Credit notes</h3>
                  <div className="space-y-2">
                    {invoice.credit_notes.map((credit) => (
                      <div
                        className="rounded-md border p-3 text-sm"
                        key={credit.id}
                      >
                        <div className="flex justify-between">
                          <span>{credit.credit_number}</span>
                          <span className="font-medium">
                            {money.format(credit.amount)}
                          </span>
                        </div>
                        {credit.reason && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {credit.reason}
                          </p>
                        )}
                      </div>
                    ))}
                    {invoice.credit_notes.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No credit notes.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
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
import {
  useRecordSelfBilledSettlement,
  type InvoiceDetail,
} from "@/lib/queries/invoices";
import { useSelfBillingDocuments } from "@/lib/queries/self-billing";

interface Props {
  invoice: InvoiceDetail;
  bankTransaction?: {
    id: number;
    amount_in: number;
    transaction_date: string;
  } | null;
  onCancel: () => void;
  onSaved?: () => void;
}

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function SelfBilledSettlementForm({
  invoice,
  bankTransaction = null,
  onCancel,
  onSaved,
}: Props) {
  const record = useRecordSelfBilledSettlement();
  const { data: documents } = useSelfBillingDocuments(
    invoice.client_id,
    "invoice",
  );
  const [paymentDate, setPaymentDate] = useState("");
  const [cash, setCash] = useState("");
  const [gross, setGross] = useState("");
  const [materials, setMaterials] = useState("0");
  const [rate, setRate] = useState("20");
  const [utr, setUtr] = useState("");
  const [documentId, setDocumentId] = useState("none");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const defaultCash = bankTransaction?.amount_in ?? invoice.balance_due;
    setPaymentDate(
      bankTransaction?.transaction_date ?? format(new Date(), "yyyy-MM-dd"),
    );
    setCash(defaultCash.toFixed(2));
    setGross("0");
    setMaterials("0");
    setRate("20");
    setUtr("");
    setDocumentId("none");
    setNotes("");
    setError("");
  }, [bankTransaction, invoice.balance_due]);

  const cashAmount = Number(cash) || 0;
  const grossAmount = Number(gross) || 0;
  const materialsAmount = Number(materials) || 0;
  const deductionRate = Number(rate) || 0;
  const cisAmount = Math.max(
    0,
    ((grossAmount - materialsAmount) * deductionRate) / 100,
  );
  const settledAmount = cashAmount + cisAmount;

  const save = async () => {
    setError("");
    if (!paymentDate) return setError("Enter the settlement date.");
    if (
      cashAmount < 0 ||
      grossAmount < 0 ||
      materialsAmount < 0 ||
      materialsAmount > grossAmount
    )
      return setError(
        "Enter valid non-negative cash, gross and materials amounts.",
      );
    if (deductionRate < 0 || deductionRate > 100)
      return setError("The CIS deduction rate must be between 0% and 100%.");
    if (settledAmount <= 0 || settledAmount > invoice.balance_due + 0.005)
      return setError(
        "The settlement must be positive and cannot exceed the invoice balance.",
      );
    if (
      bankTransaction &&
      Math.abs(cashAmount - bankTransaction.amount_in) > 0.005
    )
      return setError("Cash received must equal the selected bank receipt.");
    try {
      await record.mutateAsync({
        invoice_id: invoice.id,
        payment_date: paymentDate,
        cash_amount: cashAmount,
        cis_deduction_amount: cisAmount,
        cis_gross_amount: grossAmount,
        materials_amount: materialsAmount,
        deduction_rate: cisAmount > 0 ? deductionRate : 0,
        party_utr: utr.trim(),
        notes: notes.trim(),
        source_document_id: documentId === "none" ? null : Number(documentId),
        bank_transaction_id: bankTransaction?.id ?? null,
      });
      onSaved?.();
      onCancel();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The settlement could not be recorded.",
      );
    }
  };

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div>
        <h3 className="text-sm font-semibold">Record self-billed settlement</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Record gross settlement even when the customer withholds CIS from the
          bank payment.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            disabled={Boolean(bankTransaction)}
          />
        </div>
        <div className="space-y-2">
          <Label>Cash received</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={cash}
            onChange={(event) => setCash(event.target.value)}
            disabled={Boolean(bankTransaction)}
          />
        </div>
        <div className="space-y-2">
          <Label>CIS gross labour</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={gross}
            onChange={(event) => setGross(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Materials excluded</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={materials}
            onChange={(event) => setMaterials(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Deduction rate</Label>
          <Select value={rate} onValueChange={setRate}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">No CIS</SelectItem>
              <SelectItem value="20">20%</SelectItem>
              <SelectItem value="30">30%</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Customer UTR</Label>
          <Input value={utr} onChange={(event) => setUtr(event.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>CIS statement document</Label>
          <Select value={documentId} onValueChange={setDocumentId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No document selected</SelectItem>
              {(documents ?? []).map((document) => (
                <SelectItem key={document.id} value={String(document.id)}>
                  {document.file_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Textarea
            rows={1}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Cash</p>
          <p className="font-semibold">{money.format(cashAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">CIS withheld</p>
          <p className="font-semibold">{money.format(cisAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Settled</p>
          <p className="font-semibold">{money.format(settledAmount)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Remaining after</p>
          <p className="font-semibold">
            {money.format(Math.max(0, invoice.balance_due - settledAmount))}
          </p>
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={record.isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={record.isPending}
        >
          {record.isPending ? "Recording..." : "Record settlement"}
        </Button>
      </div>
    </div>
  );
}

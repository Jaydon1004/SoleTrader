import { useEffect, useState } from "react";
import { Banknote, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useFeedback } from "@/components/feedback-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type AccrualAdjustment,
  type AccrualAdjustmentInput,
  type SupplierBill,
  type SupplierBillInput,
  useAccrualAccounting,
  useDeleteAccrualAdjustment,
  useDeleteSupplierBill,
  useDeleteSupplierBillPayment,
  useRecordSupplierBillPayment,
  useSaveAccrualAdjustment,
  useSaveSupplierBill,
} from "@/lib/accrual-accounting";
import { useExpenseCategories } from "@/lib/queries/expenses";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function nextDay(date: string) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + 1);
  return value.toISOString().slice(0, 10);
}

function dateInYear(yearStart: string, yearEnd: string) {
  const today = new Date().toISOString().slice(0, 10);
  return today >= yearStart && today <= yearEnd ? today : yearEnd;
}

export function AccrualAccountingPanel({
  accountingBasis,
  taxYear,
  yearEnd,
  yearStart,
}: {
  accountingBasis: "cash" | "accrual";
  taxYear: string;
  yearEnd: string;
  yearStart: string;
}) {
  const { confirm, toast } = useFeedback();
  const dataQuery = useAccrualAccounting(taxYear);
  const categoryQuery = useExpenseCategories();
  const saveBill = useSaveSupplierBill();
  const removeBill = useDeleteSupplierBill();
  const addPayment = useRecordSupplierBillPayment();
  const removePayment = useDeleteSupplierBillPayment();
  const saveAdjustment = useSaveAccrualAdjustment();
  const removeAdjustment = useDeleteAccrualAdjustment();
  const categories = categoryQuery.data ?? [];
  const defaultCategoryId = categories[0]?.id ?? 0;
  const defaultDate = dateInYear(yearStart, yearEnd);
  const emptyBill = (): SupplierBillInput => ({
    category_id: defaultCategoryId,
    supplier: "",
    reference: "",
    bill_date: defaultDate,
    due_date: defaultDate,
    gross_amount: 0,
    vat_amount: 0,
    business_percent: 100,
    vat_capital_asset: 0,
    notes: "",
    tax_year: taxYear,
  });
  const emptyAdjustment = (): AccrualAdjustmentInput => ({
    tax_year: taxYear,
    category_id: defaultCategoryId,
    adjustment_type: "accrual",
    description: "",
    amount: 0,
    adjustment_date: yearEnd,
    reversal_date: nextDay(yearEnd),
    notes: "",
  });
  const [bill, setBill] = useState<SupplierBillInput>(emptyBill);
  const [adjustment, setAdjustment] =
    useState<AccrualAdjustmentInput>(emptyAdjustment);
  const [paymentBill, setPaymentBill] = useState<SupplierBill | null>(null);
  const [paymentDate, setPaymentDate] = useState(defaultDate);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentNotes, setPaymentNotes] = useState("");

  useEffect(() => {
    setBill({
      category_id: defaultCategoryId,
      supplier: "",
      reference: "",
      bill_date: defaultDate,
      due_date: defaultDate,
      gross_amount: 0,
      vat_amount: 0,
      business_percent: 100,
      vat_capital_asset: 0,
      notes: "",
      tax_year: taxYear,
    });
    setAdjustment({
      tax_year: taxYear,
      category_id: defaultCategoryId,
      adjustment_type: "accrual",
      description: "",
      amount: 0,
      adjustment_date: yearEnd,
      reversal_date: nextDay(yearEnd),
      notes: "",
    });
    setPaymentBill(null);
  }, [defaultCategoryId, defaultDate, taxYear, yearEnd]);

  const bills = dataQuery.data?.bills ?? [];
  const payments = dataQuery.data?.payments ?? [];
  const adjustments = dataQuery.data?.adjustments ?? [];
  const outstanding = bills.reduce(
    (sum, item) => sum + item.outstanding_amount,
    0,
  );
  const showError = (title: string, caught: unknown) =>
    toast(title, {
      tone: "error",
      description:
        caught instanceof Error ? caught.message : "Please try again.",
    });
  const submitBill = async () => {
    try {
      await saveBill.mutateAsync(bill);
      toast(bill.id ? "Supplier bill updated" : "Supplier bill added");
      setBill(emptyBill());
    } catch (caught) {
      showError("Supplier bill was not saved", caught);
    }
  };
  const editBill = (item: SupplierBill) =>
    setBill({
      id: item.id,
      category_id: item.category_id,
      supplier: item.supplier,
      reference: item.reference,
      bill_date: item.bill_date,
      due_date: item.due_date,
      gross_amount: item.gross_amount,
      vat_amount: item.vat_amount,
      business_percent: item.business_percent,
      vat_capital_asset: item.vat_capital_asset,
      notes: item.notes,
      tax_year: item.tax_year,
    });
  const deleteBill = async (item: SupplierBill) => {
    if (
      !(await confirm({
        title: "Remove supplier bill?",
        description: `${item.supplier} ${item.reference || item.bill_date} will be removed from the creditor ledger.`,
        confirmLabel: "Remove bill",
        destructive: true,
      }))
    )
      return;
    try {
      await removeBill.mutateAsync(item.id);
      toast("Supplier bill removed");
    } catch (caught) {
      showError("Supplier bill was not removed", caught);
    }
  };
  const startPayment = (item: SupplierBill) => {
    setPaymentBill(item);
    setPaymentAmount(item.outstanding_amount);
    setPaymentDate(defaultDate);
    setPaymentNotes("");
  };
  const submitPayment = async () => {
    if (!paymentBill) return;
    try {
      await addPayment.mutateAsync({
        billId: paymentBill.id,
        paymentDate,
        amount: paymentAmount,
        notes: paymentNotes,
      });
      toast("Supplier payment recorded");
      setPaymentBill(null);
    } catch (caught) {
      showError("Supplier payment was not recorded", caught);
    }
  };
  const deletePayment = async (id: number) => {
    try {
      await removePayment.mutateAsync(id);
      toast("Supplier payment removed");
    } catch (caught) {
      showError("Supplier payment was not removed", caught);
    }
  };
  const submitAdjustment = async () => {
    try {
      await saveAdjustment.mutateAsync(adjustment);
      toast(adjustment.id ? "Adjustment updated" : "Adjustment added");
      setAdjustment(emptyAdjustment());
    } catch (caught) {
      showError("Adjustment was not saved", caught);
    }
  };
  const editAdjustment = (item: AccrualAdjustment) =>
    setAdjustment({
      id: item.id,
      tax_year: item.tax_year,
      category_id: item.category_id,
      adjustment_type: item.adjustment_type,
      description: item.description,
      amount: item.amount,
      adjustment_date: item.adjustment_date,
      reversal_date: item.reversal_date,
      notes: item.notes,
    });
  const deleteAdjustment = async (item: AccrualAdjustment) => {
    if (
      !(await confirm({
        title: "Remove adjustment?",
        description: `${item.description} and its reversal will leave the ledger.`,
        confirmLabel: "Remove adjustment",
        destructive: true,
      }))
    )
      return;
    try {
      await removeAdjustment.mutateAsync(item.id);
      toast("Adjustment removed");
    } catch (caught) {
      showError("Adjustment was not removed", caught);
    }
  };

  if (dataQuery.isLoading || categoryQuery.isLoading)
    return (
      <p className="text-sm text-muted-foreground">
        Loading accrual records...
      </p>
    );
  if (dataQuery.error || categoryQuery.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Accrual records unavailable</AlertTitle>
        <AlertDescription>
          {(dataQuery.error ?? categoryQuery.error) instanceof Error
            ? (dataQuery.error ?? categoryQuery.error)?.message
            : "The records could not be loaded."}
        </AlertDescription>
      </Alert>
    );

  const billValid =
    bill.category_id > 0 &&
    bill.supplier.trim() !== "" &&
    bill.bill_date >= yearStart &&
    bill.bill_date <= yearEnd &&
    bill.due_date >= bill.bill_date &&
    bill.gross_amount > 0 &&
    bill.vat_amount >= 0 &&
    bill.vat_amount <= bill.gross_amount &&
    bill.business_percent > 0 &&
    bill.business_percent <= 100;
  const adjustmentValid =
    adjustment.category_id > 0 &&
    adjustment.description.trim() !== "" &&
    adjustment.amount > 0 &&
    adjustment.adjustment_date >= yearStart &&
    adjustment.adjustment_date <= yearEnd &&
    adjustment.reversal_date > adjustment.adjustment_date;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Accrual accounting</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Supplier bills, creditors and reversing adjustments. Tax reporting
            currently uses the{" "}
            {accountingBasis === "cash"
              ? "receipts basis (cash basis)"
              : "accrual basis"}
            .
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Outstanding creditors</p>
          <p className="text-lg font-semibold">{money.format(outstanding)}</p>
        </div>
      </div>

      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Supplier bills</TabsTrigger>
          <TabsTrigger value="adjustments">Accruals & prepayments</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="space-y-6 border-y py-5">
          <div>
            <h4 className="font-semibold">
              {bill.id ? "Edit supplier bill" : "Add supplier bill"}
            </h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Input
                  value={bill.supplier}
                  onChange={(event) =>
                    setBill({ ...bill, supplier: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input
                  value={bill.reference}
                  onChange={(event) =>
                    setBill({ ...bill, reference: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={String(bill.category_id || "")}
                  onValueChange={(value) =>
                    setBill({ ...bill, category_id: Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Bill date</Label>
                <Input
                  type="date"
                  min={yearStart}
                  max={yearEnd}
                  value={bill.bill_date}
                  onChange={(event) =>
                    setBill({ ...bill, bill_date: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Due date</Label>
                <Input
                  type="date"
                  min={bill.bill_date}
                  value={bill.due_date}
                  onChange={(event) =>
                    setBill({ ...bill, due_date: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Gross amount</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={bill.gross_amount || ""}
                  onChange={(event) =>
                    setBill({
                      ...bill,
                      gross_amount: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>VAT included</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bill.vat_amount || ""}
                  onChange={(event) =>
                    setBill({
                      ...bill,
                      vat_amount: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Business use %</Label>
                <Input
                  type="number"
                  min="0.01"
                  max="100"
                  step="0.01"
                  value={bill.business_percent}
                  onChange={(event) =>
                    setBill({
                      ...bill,
                      business_percent: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2 xl:col-span-3">
                <Label>Notes</Label>
                <Input
                  value={bill.notes}
                  onChange={(event) =>
                    setBill({ ...bill, notes: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={bill.vat_capital_asset === 1}
                  onCheckedChange={(checked) =>
                    setBill({ ...bill, vat_capital_asset: checked ? 1 : 0 })
                  }
                />
                <Label>VAT capital asset</Label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {bill.id && (
                <Button variant="outline" onClick={() => setBill(emptyBill())}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                disabled={!billValid || saveBill.isPending}
                onClick={() => void submitBill()}
              >
                <Save className="mr-2 h-4 w-4" />
                {bill.id ? "Update bill" : "Add bill"}
              </Button>
            </div>
          </div>

          {paymentBill && (
            <div className="border-l-4 border-primary bg-muted/45 p-4">
              <h4 className="font-semibold">
                Record payment to {paymentBill.supplier}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                Outstanding {money.format(paymentBill.outstanding_amount)}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Payment date</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(event) => setPaymentDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    min="0.01"
                    max={paymentBill.outstanding_amount}
                    step="0.01"
                    value={paymentAmount || ""}
                    onChange={(event) =>
                      setPaymentAmount(Number(event.target.value) || 0)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Input
                    value={paymentNotes}
                    onChange={(event) => setPaymentNotes(event.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPaymentBill(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={
                    paymentAmount <= 0 ||
                    paymentAmount > paymentBill.outstanding_amount ||
                    !paymentDate ||
                    addPayment.isPending
                  }
                  onClick={() => void submitPayment()}
                >
                  <Banknote className="mr-2 h-4 w-4" />
                  Record payment
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto border-y">
            <div className="grid min-w-210 grid-cols-[1fr_110px_110px_110px_110px_150px] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
              <span>Supplier / bill</span>
              <span>Bill date</span>
              <span className="text-right">Gross</span>
              <span className="text-right">Paid</span>
              <span className="text-right">Outstanding</span>
              <span>Actions</span>
            </div>
            {bills.map((item) => (
              <div
                key={item.id}
                className="grid min-w-210 grid-cols-[1fr_110px_110px_110px_110px_150px] items-center gap-3 border-b px-3 py-3 text-sm last:border-0"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {item.supplier}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.reference || item.category_name}
                  </span>
                </span>
                <span>{item.bill_date}</span>
                <span className="text-right">
                  {money.format(item.gross_amount)}
                </span>
                <span className="text-right">
                  {money.format(item.amount_paid)}
                </span>
                <span className="text-right font-semibold">
                  {money.format(item.outstanding_amount)}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit supplier bill"
                    onClick={() => editBill(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Record supplier payment"
                    disabled={item.outstanding_amount <= 0}
                    onClick={() => startPayment(item)}
                  >
                    <Banknote className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove supplier bill"
                    onClick={() => void deleteBill(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            ))}
            {bills.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No supplier bills for this tax year.
              </p>
            )}
          </div>
          {payments.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold">Recorded payments</h4>
              <div className="space-y-1">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between gap-3 border-b py-2 text-sm"
                  >
                    <span>
                      {payment.payment_date} · Bill #{payment.bill_id} ·{" "}
                      {money.format(payment.amount)}
                      {payment.notes ? ` · ${payment.notes}` : ""}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove supplier payment"
                      onClick={() => void deletePayment(payment.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="adjustments" className="space-y-6 border-y py-5">
          <div>
            <h4 className="font-semibold">
              {adjustment.id ? "Edit adjustment" : "Add reversing adjustment"}
            </h4>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={adjustment.adjustment_type}
                  onValueChange={(value) =>
                    setAdjustment({
                      ...adjustment,
                      adjustment_type: value as "accrual" | "prepayment",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accrual">Accrued expense</SelectItem>
                    <SelectItem value="prepayment">Prepayment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={String(adjustment.category_id || "")}
                  onValueChange={(value) =>
                    setAdjustment({ ...adjustment, category_id: Number(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={String(category.id)}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description</Label>
                <Input
                  value={adjustment.description}
                  onChange={(event) =>
                    setAdjustment({
                      ...adjustment,
                      description: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={adjustment.amount || ""}
                  onChange={(event) =>
                    setAdjustment({
                      ...adjustment,
                      amount: Number(event.target.value) || 0,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Adjustment date</Label>
                <Input
                  type="date"
                  min={yearStart}
                  max={yearEnd}
                  value={adjustment.adjustment_date}
                  onChange={(event) =>
                    setAdjustment({
                      ...adjustment,
                      adjustment_date: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reversal date</Label>
                <Input
                  type="date"
                  min={nextDay(adjustment.adjustment_date)}
                  value={adjustment.reversal_date}
                  onChange={(event) =>
                    setAdjustment({
                      ...adjustment,
                      reversal_date: event.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={adjustment.notes}
                  onChange={(event) =>
                    setAdjustment({ ...adjustment, notes: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              {adjustment.id && (
                <Button
                  variant="outline"
                  onClick={() => setAdjustment(emptyAdjustment())}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              <Button
                disabled={!adjustmentValid || saveAdjustment.isPending}
                onClick={() => void submitAdjustment()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {adjustment.id ? "Update adjustment" : "Add adjustment"}
              </Button>
            </div>
          </div>
          <div className="space-y-1 border-y">
            {adjustments.map((item) => (
              <div
                key={item.id}
                className="grid gap-3 border-b px-3 py-3 text-sm last:border-0 sm:grid-cols-[100px_1fr_120px_120px_80px] sm:items-center"
              >
                <Badge
                  variant={
                    item.adjustment_type === "accrual" ? "default" : "secondary"
                  }
                >
                  {item.adjustment_type}
                </Badge>
                <span>
                  <span className="block font-medium">{item.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.category_name} · reverses {item.reversal_date}
                  </span>
                </span>
                <span className="text-right font-semibold">
                  {money.format(item.amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {item.adjustment_date}
                </span>
                <span className="flex justify-end gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Edit adjustment"
                    onClick={() => editAdjustment(item)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove adjustment"
                    onClick={() => void deleteAdjustment(item)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            ))}
            {adjustments.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                No accrual or prepayment adjustments for this tax year.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

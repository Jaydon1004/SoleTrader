import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Trash2, WalletCards } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EmptyState,
  PageHeader,
  QueryErrorState,
  SummaryTile,
} from "@/components/page-shell";
import { useAppStore } from "@/stores/app-store";
import { useClients } from "@/lib/queries/clients";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useUserProfile } from "@/lib/queries/settings";
import {
  calculateCisSettlement,
  useCreateDirectIncome,
  useDeleteDirectIncome,
  useDirectIncome,
  useDueRecurringDirectIncome,
  useProcessRecurringDirectIncome,
  useUpdateDirectIncome,
  type DirectIncome,
  type DirectIncomeInput,
  type DirectIncomeType,
} from "@/lib/queries/direct-income";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const labels: Record<DirectIncomeType, string> = {
  sale: "Direct sale",
  cis_subcontractor: "CIS subcontractor payment",
  other_business_income: "Other business income",
  grant: "Grant",
  refund: "Refund",
  other: "Other",
};
type Frequency = "weekly" | "fortnightly" | "monthly" | "quarterly" | "yearly";

function IncomeEditor({
  open,
  onOpenChange,
  income,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  income: DirectIncome | null;
}) {
  const profile = useUserProfile();
  const clients = useClients();
  const create = useCreateDirectIncome();
  const update = useUpdateDirectIncome();
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("none");
  const [type, setType] = useState<DirectIncomeType>("sale");
  const [amount, setAmount] = useState("");
  const [incomeMode, setIncomeMode] = useState<"after_cis" | "gross">(
    "after_cis",
  );
  const [cisRate, setCisRate] = useState("20");
  const [contractor, setContractor] = useState("");
  const [contractorUtr, setContractorUtr] = useState("");
  const [vat, setVat] = useState("0");
  const [method, setMethod] = useState("Bank transfer");
  const [notes, setNotes] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [nextDate, setNextDate] = useState("");
  const [error, setError] = useState("");
  const isCis = type === "cis_subcontractor";
  const inputAmount = Number(amount) || 0;
  const rate = isCis ? Number(cisRate) : 0;
  const settlement = isCis
    ? calculateCisSettlement(inputAmount, rate, incomeMode)
    : { cash: inputAmount, gross: inputAmount, deduction: 0 };
  const grossPreview = settlement.gross;
  const cashPreview = settlement.cash;
  const cisPreview = settlement.deduction;

  useEffect(() => {
    if (!open) return;
    setDate(income?.income_date ?? new Date().toISOString().slice(0, 10));
    setDescription(income?.description ?? "");
    setClientId(income?.client_id ? String(income.client_id) : "none");
    setType(
      income?.cis_rate
        ? "cis_subcontractor"
        : (income?.income_type ??
            (profile.data?.cis_status !== "none"
              ? "cis_subcontractor"
              : "sale")),
    );
    setAmount(
      income
        ? String(income.cis_rate ? income.amount : income.gross_amount)
        : "",
    );
    setIncomeMode("after_cis");
    setCisRate(income?.cis_rate ? String(income.cis_rate) : "20");
    setContractor(income?.cis_party_name ?? "");
    setContractorUtr(income?.cis_party_utr ?? "");
    setVat(income?.vat_amount ? String(income.vat_amount) : "0");
    setMethod(income?.payment_method ?? "Bank transfer");
    setNotes(income?.notes ?? "");
    setRecurring(income?.is_recurring === 1);
    setFrequency(income?.recurring_frequency ?? "monthly");
    setNextDate(income?.recurring_next_date ?? "");
    setError("");
  }, [income, open, profile.data?.cis_status]);

  const save = async () => {
    if (!description.trim()) return setError("Enter a description.");
    if (!Number.isFinite(inputAmount) || inputAmount <= 0)
      return setError("Enter an amount greater than zero.");
    const vatAmount = Number(vat) || 0;
    if (vatAmount < 0 || vatAmount > cashPreview)
      return setError("VAT must be between zero and the cash received.");
    if (isCis && ![20, 30].includes(rate))
      return setError("Choose a CIS deduction rate.");
    const payload: DirectIncomeInput = {
      income_date: date,
      description: description.trim(),
      income_type: isCis ? "sale" : type,
      amount: cashPreview,
      gross_amount: grossPreview,
      cis_rate: rate,
      cis_deduction_amount: cisPreview,
      cis_party_name: contractor.trim(),
      cis_party_utr: contractorUtr.trim(),
      vat_amount: vatAmount,
      vat_rate: vatAmount ? 20 : null,
      payment_method: method,
      client_id: clientId === "none" ? null : Number(clientId),
      notes: notes.trim(),
      is_recurring: recurring,
      recurring_frequency: recurring ? frequency : null,
      recurring_next_date: recurring ? nextDate || date : null,
      recurring_auto_create: recurring,
    };
    try {
      if (income) await update.mutateAsync({ id: income.id, ...payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {income ? "Edit direct income" : "Record direct income"}
          </DialogTitle>
          <DialogDescription>
            Record income without an invoice. Historical dates are allowed. CIS
            deductions are tax already paid, not expenses.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Date received</Label>
            <Input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <Label>Income type</Label>
            <Select
              value={type}
              onValueChange={(value) => setType(value as DirectIncomeType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(labels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Job paid on completion"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Client (optional)</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client linked</SelectItem>
                {(clients.data ?? []).map((client) => (
                  <SelectItem key={client.id} value={String(client.id)}>
                    {client.company || client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{isCis ? "Cash received" : "Amount received"}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          {isCis && (
            <div className="grid gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30 sm:col-span-2 sm:grid-cols-2">
              <div>
                <Label>Amount mode</Label>
                <Select
                  value={incomeMode}
                  onValueChange={(value) =>
                    setIncomeMode(value as typeof incomeMode)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_cis">After CIS income</SelectItem>
                    <SelectItem value="gross">Gross income</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>CIS rate</Label>
                <Select value={cisRate} onValueChange={setCisRate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20% registered</SelectItem>
                    <SelectItem value="30">30% unregistered</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contractor</Label>
                <Select
                  value={clientId}
                  onValueChange={(value) => {
                    setClientId(value);
                    const client = clients.data?.find(
                      (item) => String(item.id) === value,
                    );
                    if (client) setContractor(client.company || client.name);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a client</SelectItem>
                    {(clients.data ?? []).map((client) => (
                      <SelectItem key={client.id} value={String(client.id)}>
                        {client.company || client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Contractor UTR (optional)</Label>
                <Input
                  value={contractorUtr}
                  onChange={(event) => setContractorUtr(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2 border-t border-amber-300 pt-2 text-sm dark:border-amber-700 sm:col-span-2">
                <span>Gross income</span>
                <strong>{money.format(grossPreview)}</strong>
                <span>CIS deducted</span>
                <strong>{money.format(cisPreview)}</strong>
              </div>
              <p className="text-xs text-amber-900 dark:text-amber-200 sm:col-span-2">
                CIS deducted is tax already paid on your behalf, not an expense.
              </p>
            </div>
          )}
          <div>
            <Label>VAT included</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={vat}
              onChange={(event) => setVat(event.target.value)}
            />
          </div>
          <div>
            <Label>Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "Bank transfer",
                  "Card",
                  "Cash",
                  "Online platform",
                  "Other",
                ].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="income-recurring"
              type="checkbox"
              checked={recurring}
              onChange={(event) => setRecurring(event.target.checked)}
            />
            <Label htmlFor="income-recurring">Repeat this income</Label>
          </div>
          {recurring && (
            <>
              <div>
                <Label>Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(value) => setFrequency(value as Frequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "weekly",
                      "fortnightly",
                      "monthly",
                      "quarterly",
                      "yearly",
                    ].map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Next expected date</Label>
                <Input
                  type="date"
                  value={nextDate}
                  onChange={(event) => setNextDate(event.target.value)}
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Label>Notes</Label>
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={create.isPending || update.isPending}
          >
            {income ? "Save changes" : "Save income"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function IncomePage() {
  const taxYear = useAppStore((state) => state.currentTaxYear);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DirectIncome | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const income = useDirectIncome({ taxYear, search });
  const years = useTaxYearConfigs();
  const remove = useDeleteDirectIncome();
  const due = useDueRecurringDirectIncome();
  const processRecurring = useProcessRecurringDirectIncome();
  useEffect(() => {
    if (due.data?.length && !processRecurring.isPending)
      void processRecurring.mutateAsync(due.data);
  }, [due.data, processRecurring]);
  useEffect(() => {
    if (searchParams.get("new") !== "income") return;
    setOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  if (income.isLoading) return <div>Loading income...</div>;
  if (income.error) return <QueryErrorState onRetry={() => income.refetch()} />;
  const rows = income.data ?? [];
  const total = rows.reduce((sum, row) => sum + row.gross_amount, 0);
  const vat = rows.reduce((sum, row) => sum + row.vat_amount, 0);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales"
        title="Direct income"
        description="Record business money received when there is no invoice to settle."
        primaryAction={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Record income
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Gross income"
          value={money.format(total)}
          detail={`${rows.length} entries`}
          tone="positive"
        />
        <SummaryTile
          label="VAT included"
          value={money.format(vat)}
          detail="Review before filing"
        />
        <SummaryTile
          label="Tax year"
          value={taxYear}
          detail={
            years.data?.length
              ? `${years.data.length} years configured`
              : undefined
          }
        />
      </div>
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search direct income"
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={WalletCards}
          title="No direct income recorded"
          description="Use this ledger for cash sales, card receipts, platform payouts, and other business income that has no invoice."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record income
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <div className="grid min-w-190 grid-cols-[120px_minmax(220px,1fr)_170px_130px_44px] gap-3 border-b bg-muted/50 px-4 py-3 text-xs font-semibold text-muted-foreground">
            <span>Date</span>
            <span>Description</span>
            <span>Type / client</span>
            <span className="text-right">Gross</span>
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid min-w-190 grid-cols-[120px_minmax(220px,1fr)_170px_130px_44px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
            >
              <span>{row.income_date}</span>
              <span>
                <span className="block font-medium">{row.description}</span>
                {row.cis_deduction_amount > 0 && (
                  <span className="text-xs text-amber-700">
                    {money.format(row.cis_deduction_amount)} CIS deducted
                  </span>
                )}
              </span>
              <span>
                <span className="block">
                  {row.cis_rate > 0
                    ? labels.cis_subcontractor
                    : labels[row.income_type]}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.client_name || row.payment_method}
                </span>
              </span>
              <span className="text-right font-semibold">
                {money.format(row.gross_amount)}
              </span>
              <span className="flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Edit income"
                  onClick={() => {
                    setEditing(row);
                    setOpen(true);
                  }}
                >
                  ✎
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete income"
                  onClick={() => void remove.mutateAsync(row.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <IncomeEditor
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setEditing(null);
        }}
        income={editing}
      />
    </div>
  );
}

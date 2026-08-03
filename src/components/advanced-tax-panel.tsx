import { useEffect, useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  type AdvancedTaxData,
  type CapitalAssetInput,
  type CisTransactionInput,
  useDeleteCapitalAsset,
  useDeleteCisTransaction,
  useSaveCapitalAsset,
  useSaveCisTransaction,
} from "@/lib/queries/advanced-tax";
import type {
  CapitalAsset,
  CisTransaction,
  TaxYearConfig,
  UserProfile,
} from "@/types/database";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const today = () => new Date().toISOString().slice(0, 10);

const emptyAsset = (): CapitalAssetInput => ({
  name: "",
  asset_type: "equipment",
  description: "",
  purchase_date: today(),
  purchase_price: 0,
  business_percent: 100,
  pool_type: "main",
  claim_method: "aia",
  disposal_date: null,
  disposal_proceeds: 0,
  notes: "",
});

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function PoolTable({
  title,
  pool,
}: {
  title: string;
  pool: AdvancedTaxData["schedule"]["mainPool"];
}) {
  const rows = [
    ["Opening pool", pool.openingValue],
    ["Additions after AIA", pool.additions],
    ["Disposal value", -pool.disposals],
    ["Balancing charge", pool.balancingCharge],
    ["Writing Down Allowance", -pool.writingDownAllowance],
    ["Closing pool", pool.closingValue],
  ] as const;
  return (
    <Card className="rounded-lg shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={`flex justify-between border-b py-2 text-sm last:border-0 ${index === rows.length - 1 ? "font-semibold" : ""}`}
          >
            <span>{label}</span>
            <span className="tabular-nums">{money.format(value)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function CapitalAllowancesPanel({ data }: { data: AdvancedTaxData }) {
  const save = useSaveCapitalAsset();
  const remove = useDeleteCapitalAsset();
  const [editingId, setEditingId] = useState<number>();
  const [form, setForm] = useState<CapitalAssetInput>(emptyAsset());
  const set = <K extends keyof CapitalAssetInput>(
    key: K,
    value: CapitalAssetInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const edit = (asset: CapitalAsset) => {
    setEditingId(asset.id);
    setForm({
      name: asset.name,
      asset_type: asset.asset_type,
      description: asset.description,
      purchase_date: asset.purchase_date,
      purchase_price: asset.purchase_price,
      business_percent: asset.business_percent,
      pool_type: asset.pool_type,
      claim_method: asset.claim_method,
      disposal_date: asset.disposal_date,
      disposal_proceeds: asset.disposal_proceeds,
      notes: asset.notes,
    });
  };
  const reset = () => {
    setEditingId(undefined);
    setForm(emptyAsset());
  };
  const submit = async () => {
    await save.mutateAsync({ id: editingId, ...form });
    reset();
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit asset" : "Add capital asset"}
          </CardTitle>
          <CardDescription>
            Asset purchases stay separate from ordinary expenses and enter the
            selected allowance pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Asset name">
              <Input
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
              />
            </Field>
            <Field label="Type">
              <Select
                value={form.asset_type}
                onValueChange={(value) =>
                  set("asset_type", value as CapitalAssetInput["asset_type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equipment">Equipment</SelectItem>
                  <SelectItem value="plant">Plant</SelectItem>
                  <SelectItem value="machinery">Machinery</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="integral_feature">
                    Integral feature
                  </SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Purchase date">
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(event) => set("purchase_date", event.target.value)}
              />
            </Field>
            <Field label="Purchase price">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.purchase_price || ""}
                onChange={(event) =>
                  set("purchase_price", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Business use %">
              <Input
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={form.business_percent}
                onChange={(event) =>
                  set("business_percent", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Pool">
              <Select
                value={form.pool_type}
                onValueChange={(value) =>
                  set("pool_type", value as CapitalAssetInput["pool_type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Main pool</SelectItem>
                  <SelectItem value="special">Special rate pool</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Claim">
              <Select
                value={form.claim_method}
                onValueChange={(value) =>
                  set(
                    "claim_method",
                    value as CapitalAssetInput["claim_method"],
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aia">
                    Annual Investment Allowance
                  </SelectItem>
                  <SelectItem value="wda">Writing Down Allowance</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Disposal date">
              <Input
                type="date"
                value={form.disposal_date ?? ""}
                onChange={(event) =>
                  set("disposal_date", event.target.value || null)
                }
              />
            </Field>
            <Field label="Disposal proceeds">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.disposal_proceeds || ""}
                onChange={(event) =>
                  set("disposal_proceeds", Number(event.target.value) || 0)
                }
              />
            </Field>
            <div className="md:col-span-3">
              <Field label="Notes">
                <Textarea
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={submit}
              disabled={!form.name || !form.purchase_price || save.isPending}
            >
              <Save className="mr-2 h-4 w-4" />
              Save asset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Asset register</CardTitle>
          <CardDescription>
            {data.assets.length} active asset
            {data.assets.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.assets.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No capital assets recorded.
            </p>
          ) : (
            data.assets.map((asset) => (
              <div
                key={asset.id}
                className="flex flex-col gap-3 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{asset.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {asset.purchase_date} · {money.format(asset.purchase_price)}{" "}
                    · {asset.business_percent}% business ·{" "}
                    {asset.pool_type === "main"
                      ? "Main pool"
                      : "Special rate pool"}
                    {asset.disposal_date
                      ? ` · Disposed ${asset.disposal_date}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`Edit ${asset.name}`}
                    onClick={() => edit(asset)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    aria-label={`Archive ${asset.name}`}
                    onClick={() => remove.mutate(asset.id)}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <PoolTable title="Main pool schedule" pool={data.schedule.mainPool} />
        <PoolTable
          title="Special rate pool schedule"
          pool={data.schedule.specialPool}
        />
      </div>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Capital allowance summary</CardTitle>
          <CardDescription>
            {data.schedule.taxYear} accountant schedule
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">AIA claimed</p>
            <p className="text-xl font-semibold">
              {money.format(data.schedule.aiaClaim)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">WDA claimed</p>
            <p className="text-xl font-semibold">
              {money.format(
                data.schedule.mainPool.writingDownAllowance +
                  data.schedule.specialPool.writingDownAllowance,
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Balancing charges</p>
            <p className="text-xl font-semibold">
              {money.format(data.schedule.balancingCharge)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              Net profit deduction
            </p>
            <p className="text-xl font-semibold">
              {money.format(data.schedule.netAllowance)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function defaultCis(rate: number): CisTransactionInput {
  return {
    direction: "received",
    date: today(),
    party_name: "",
    party_utr: "",
    gross_amount: 0,
    materials_amount: 0,
    deduction_rate: rate,
    deduction_amount: 0,
    notes: "",
  };
}

export function CisPanel({
  data,
  config,
  cisStatus,
}: {
  data: AdvancedTaxData;
  config: TaxYearConfig;
  cisStatus: UserProfile["cis_status"];
}) {
  const defaultRate =
    cisStatus === "gross"
      ? 0
      : cisStatus === "unregistered"
        ? config.cis_unregistered_rate
        : config.cis_standard_rate;
  const save = useSaveCisTransaction();
  const remove = useDeleteCisTransaction();
  const [editingId, setEditingId] = useState<number>();
  const [form, setForm] = useState<CisTransactionInput>(() =>
    defaultCis(defaultRate),
  );
  useEffect(() => {
    if (!editingId)
      setForm((current) => ({ ...current, deduction_rate: defaultRate }));
  }, [defaultRate, editingId]);
  const set = <K extends keyof CisTransactionInput>(
    key: K,
    value: CisTransactionInput[K],
  ) => setForm((current) => ({ ...current, [key]: value }));
  const setBasis = (
    key: "gross_amount" | "materials_amount" | "deduction_rate",
    value: number,
  ) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      return {
        ...next,
        deduction_amount:
          (Math.max(0, next.gross_amount - next.materials_amount) *
            next.deduction_rate) /
          100,
      };
    });
  const reset = () => {
    setEditingId(undefined);
    setForm(defaultCis(defaultRate));
  };
  const edit = (entry: CisTransaction) => {
    setEditingId(entry.id);
    setForm({
      direction: entry.direction,
      date: entry.date,
      party_name: entry.party_name,
      party_utr: entry.party_utr,
      gross_amount: entry.gross_amount,
      materials_amount: entry.materials_amount,
      deduction_rate: entry.deduction_rate,
      deduction_amount: entry.deduction_amount,
      notes: entry.notes,
    });
  };
  const submit = async () => {
    await save.mutateAsync({ id: editingId, ...form });
    reset();
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Deductions received, reducing your bill
            </p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {money.format(data.cisReceived)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              Deductions made to subcontractors
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {money.format(data.cisMade)}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">
            {editingId ? "Edit CIS entry" : "Add CIS entry"}
          </CardTitle>
          <CardDescription>
            Deductions use the active tax-year rate and can be matched to the
            actual statement amount.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Direction">
              <Select
                value={form.direction}
                onValueChange={(value) =>
                  set("direction", value as CisTransactionInput["direction"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">
                    Received from contractor
                  </SelectItem>
                  <SelectItem value="made">Made to subcontractor</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={(event) => set("date", event.target.value)}
              />
            </Field>
            <Field label="Party name">
              <Input
                value={form.party_name}
                onChange={(event) => set("party_name", event.target.value)}
              />
            </Field>
            <Field label="UTR">
              <Input
                value={form.party_utr}
                onChange={(event) => set("party_utr", event.target.value)}
              />
            </Field>
            <Field label="Gross amount">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.gross_amount || ""}
                onChange={(event) =>
                  setBasis("gross_amount", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Materials">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.materials_amount || ""}
                onChange={(event) =>
                  setBasis("materials_amount", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Deduction rate %">
              <Input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.deduction_rate}
                onChange={(event) =>
                  setBasis("deduction_rate", Number(event.target.value) || 0)
                }
              />
            </Field>
            <Field label="Actual deduction">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.deduction_amount || ""}
                onChange={(event) =>
                  set("deduction_amount", Number(event.target.value) || 0)
                }
              />
            </Field>
            <div className="md:col-span-4">
              <Field label="Notes">
                <Textarea
                  value={form.notes}
                  onChange={(event) => set("notes", event.target.value)}
                />
              </Field>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingId && (
              <Button variant="outline" onClick={reset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button
              onClick={submit}
              disabled={
                !form.party_name || !form.gross_amount || save.isPending
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Save entry
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">CIS ledger</CardTitle>
          <CardDescription>
            {data.cisTransactions.length} entr
            {data.cisTransactions.length === 1 ? "y" : "ies"} in{" "}
            {data.schedule.taxYear}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.cisTransactions.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              No CIS deductions recorded for this tax year.
            </p>
          ) : (
            data.cisTransactions.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-3 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{entry.party_name}</p>
                    {entry.invoice_payment_id && (
                      <Badge variant="secondary">Invoice settlement</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {entry.date} ·{" "}
                    {entry.direction === "received" ? "Received" : "Made"} ·{" "}
                    {money.format(entry.gross_amount)} gross ·{" "}
                    {money.format(entry.deduction_amount)} deducted
                    {entry.invoice_reference
                      ? ` · ${entry.invoice_reference}`
                      : ""}
                  </p>
                </div>
                {!entry.invoice_payment_id && (
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Edit CIS entry for ${entry.party_name}`}
                      onClick={() => edit(entry)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      aria-label={`Delete CIS entry for ${entry.party_name}`}
                      onClick={() => remove.mutate(entry.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

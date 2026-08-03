import { useCallback, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  useUserProfile,
  useUpdateUserProfile,
  useInvoiceSettings,
  useUpdateInvoiceSettings,
  useTaxYearConfigs,
  useUpdateTaxYearConfig,
  useCreateTaxYearConfig,
  useAppSetting,
  useSetAppSetting,
} from "@/lib/queries/settings";
import { hashPin, verifyPin } from "@/lib/crypto";
import { LoadingSpinner } from "@/components/loading";
import { useAppStore } from "@/stores/app-store";
import { ReminderSettingsPanel } from "@/components/reminder-settings-panel";
import { MigrationImportPanel } from "@/components/migration-import-panel";
import { UpdateSettingsPanel } from "@/components/update-settings-panel";
import type { TaxYearConfig } from "@/types/database";
import { PlusCircle, Save, ShieldCheck } from "lucide-react";
import { PageHeader, QueryErrorState } from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";

interface DirtyTabProps {
  onDirtyChange: (dirty: boolean) => void;
}

// ─── Personal & Business Tab ─────────────────────────────────────────────────

function PersonalTab({ onDirtyChange }: DirtyTabProps) {
  const profileQuery = useUserProfile();
  const { data: profile, isLoading } = profileQuery;
  const update = useUpdateUserProfile();
  const [form, setForm] = useState<Record<string, string>>({});
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (profile) {
      const next = profile as unknown as Record<string, string>;
      setForm(next);
      setBaseline(next);
    }
  }, [profile]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaveError("");
    try {
      await update.mutateAsync(form as never);
      setBaseline(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Settings could not be saved.");
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (profileQuery.isError)
    return (
      <QueryErrorState
        title="Business settings could not be loaded"
        onRetry={profileQuery.refetch}
        isRetrying={profileQuery.isFetching}
      />
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Personal Details</CardTitle>
          <CardDescription>
            Your name, contact information, and HMRC identifiers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>First Name</Label>
              <Input
                value={form.first_name ?? ""}
                onChange={(e) => set("first_name", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Last Name</Label>
              <Input
                value={form.last_name ?? ""}
                onChange={(e) => set("last_name", e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>UTR Number</Label>
              <Input
                value={form.utr ?? ""}
                onChange={(e) => set("utr", e.target.value)}
                maxLength={10}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label>NI Number</Label>
              <Input
                value={form.ni_number ?? ""}
                onChange={(e) => set("ni_number", e.target.value.toUpperCase())}
                maxLength={9}
                placeholder="AB123456C"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address Line 1</Label>
            <Input
              value={form.address_line_1 ?? ""}
              onChange={(e) => set("address_line_1", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Address Line 2</Label>
            <Input
              value={form.address_line_2 ?? ""}
              onChange={(e) => set("address_line_2", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Town / City</Label>
              <Input
                value={form.city ?? ""}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>County</Label>
              <Input
                value={form.county ?? ""}
                onChange={(e) => set("county", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input
                value={form.postcode ?? ""}
                onChange={(e) => set("postcode", e.target.value.toUpperCase())}
                maxLength={8}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Business Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trading Name</Label>
            <Input
              value={form.trading_name ?? ""}
              onChange={(e) => set("trading_name", e.target.value)}
              placeholder="Leave blank to use your full name"
            />
          </div>
          <div className="space-y-2">
            <Label>Business Description</Label>
            <Textarea
              value={form.business_description ?? ""}
              onChange={(e) => set("business_description", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="font-semibold">Accounting Basis</Label>
            <RadioGroup
              value={form.accounting_basis ?? "cash"}
              onValueChange={(v) => set("accounting_basis", v)}
              className="flex gap-4"
            >
              {[
                { value: "cash", label: "Cash Basis" },
                { value: "accrual", label: "Accrual Basis" },
              ].map((o) => (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 hover:bg-accent has-data-[state=checked]:border-primary"
                >
                  <RadioGroupItem value={o.value} />
                  <span className="text-sm font-medium">{o.label}</span>
                </label>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="font-semibold">VAT Status</Label>
            <Select
              value={form.vat_status ?? "unregistered"}
              onValueChange={(v) => set("vat_status", v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unregistered">Not VAT Registered</SelectItem>
                <SelectItem value="voluntary">
                  Voluntarily Registered
                </SelectItem>
                <SelectItem value="compulsory">
                  Compulsorily Registered
                </SelectItem>
              </SelectContent>
            </Select>
            {form.vat_status !== "unregistered" && (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>VAT Number</Label>
                  <Input
                    value={form.vat_number ?? ""}
                    onChange={(e) => set("vat_number", e.target.value)}
                    placeholder="GB123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label>VAT Scheme</Label>
                  <Select
                    value={form.vat_scheme ?? "standard"}
                    onValueChange={(value) => set("vat_scheme", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Standard</SelectItem>
                      <SelectItem value="flat_rate">
                        Flat Rate Scheme
                      </SelectItem>
                      <SelectItem value="cash_accounting">
                        Cash Accounting
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.vat_scheme === "flat_rate" && (
                  <div className="space-y-2">
                    <Label>Industry flat rate %</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={form.vat_flat_rate_percent ?? ""}
                      onChange={(event) =>
                        set("vat_flat_rate_percent", event.target.value)
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Use the HMRC percentage for your trade sector.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label className="font-semibold">Student Loan</Label>
            <Select
              value={form.student_loan_plan ?? "none"}
              onValueChange={(v) => set("student_loan_plan", v)}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="plan_1">Plan 1</SelectItem>
                <SelectItem value="plan_2">Plan 2</SelectItem>
                <SelectItem value="plan_4">Plan 4 (Scotland)</SelectItem>
                <SelectItem value="postgrad">Postgraduate</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold">
              Construction Industry Scheme status
            </Label>
            <Select
              value={form.cis_status ?? "none"}
              onValueChange={(value) => set("cis_status", value)}
            >
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not using CIS</SelectItem>
                <SelectItem value="registered">
                  Registered subcontractor
                </SelectItem>
                <SelectItem value="unregistered">
                  Unregistered subcontractor
                </SelectItem>
                <SelectItem value="gross">Gross payment status</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Sets the default deduction rate for new CIS ledger entries.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-md border bg-card/95 p-3 shadow-sm backdrop-blur">
        <span className={`text-sm ${saveError ? "text-destructive" : "text-muted-foreground"}`} role="status">
          {saveError ||
            (saved
              ? "Personal and business settings saved."
              : dirty
                ? "You have unsaved changes."
                : "All changes saved.")}
        </span>
        <Button onClick={handleSave} disabled={update.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saved ? "Saved!" : update.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ─── Invoice Template Tab ─────────────────────────────────────────────────────

function InvoiceTemplateTab({ onDirtyChange }: DirtyTabProps) {
  const settingsQuery = useInvoiceSettings();
  const { data: settings, isLoading } = settingsQuery;
  const update = useUpdateInvoiceSettings();
  const [form, setForm] = useState<Record<string, string | number>>({});
  const [baseline, setBaseline] = useState<Record<string, string | number>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (settings) {
      const next = settings as unknown as Record<string, string | number>;
      setForm(next);
      setBaseline(next);
    }
  }, [settings]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (k: string, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    setSaveError("");
    try {
      await update.mutateAsync(form as never);
      setBaseline(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Invoice settings could not be saved.");
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (settingsQuery.isError)
    return (
      <QueryErrorState
        title="Invoice settings could not be loaded"
        onRetry={settingsQuery.refetch}
        isRetrying={settingsQuery.isFetching}
      />
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Invoice Numbering</CardTitle>
          <CardDescription>
            Format and starting number for invoice references
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Number Prefix</Label>
              <Input
                value={(form.number_prefix as string) ?? "INV-"}
                onChange={(e) => set("number_prefix", e.target.value)}
                placeholder="INV-"
              />
              <p className="text-xs text-muted-foreground">
                e.g. INV-, 2025-, ST-
              </p>
            </div>
            <div className="space-y-2">
              <Label>Next Invoice Number</Label>
              <Input
                type="number"
                min="1"
                value={(form.number_next as number) ?? 1}
                onChange={(e) => set("number_next", parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Preview: {form.number_prefix ?? "INV-"}
                {String(form.number_next ?? 1).padStart(3, "0")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Default Payment Terms (days)</Label>
            <Input
              type="number"
              min="1"
              className="w-32"
              value={(form.payment_terms_days as number) ?? 30}
              onChange={(e) =>
                set("payment_terms_days", parseInt(e.target.value))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
          <CardDescription>
            Printed on invoices so clients know where to pay
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Bank Name</Label>
            <Input
              value={(form.bank_name as string) ?? ""}
              onChange={(e) => set("bank_name", e.target.value)}
              placeholder="Barclays"
            />
          </div>
          <div className="space-y-2">
            <Label>Account Name</Label>
            <Input
              value={(form.account_name as string) ?? ""}
              onChange={(e) => set("account_name", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Sort Code</Label>
              <Input
                value={(form.sort_code as string) ?? ""}
                onChange={(e) => set("sort_code", e.target.value)}
                placeholder="00-00-00"
                maxLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label>Account Number</Label>
              <Input
                value={(form.account_number as string) ?? ""}
                onChange={(e) => set("account_number", e.target.value)}
                placeholder="12345678"
                maxLength={8}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Footer</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={(form.footer_text as string) ?? ""}
            onChange={(e) => set("footer_text", e.target.value)}
            rows={3}
            placeholder="Thank you for your business. Payment is due within 30 days."
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-md border bg-card/95 p-3 shadow-sm backdrop-blur">
        <span className={`text-sm ${saveError ? "text-destructive" : "text-muted-foreground"}`} role="status">
          {saveError ||
            (saved
              ? "Invoice settings saved."
              : dirty
                ? "You have unsaved changes."
                : "All changes saved.")}
        </span>
        <Button onClick={handleSave} disabled={update.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saved ? "Saved!" : update.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ─── Tax Year Configuration Tab ───────────────────────────────────────────────

const TAX_YEAR_SECTIONS = [
  {
    title: "Income Tax",
    fields: [
      { key: "personal_allowance", label: "Personal Allowance", prefix: "£" },
      { key: "basic_rate_percent", label: "Basic Rate %", suffix: "%" },
      {
        key: "basic_rate_upper",
        label: "Basic Rate Upper Threshold",
        prefix: "£",
      },
      { key: "higher_rate_percent", label: "Higher Rate %", suffix: "%" },
      {
        key: "higher_rate_upper",
        label: "Higher Rate Upper Threshold",
        prefix: "£",
      },
      {
        key: "additional_rate_percent",
        label: "Additional Rate %",
        suffix: "%",
      },
      { key: "pa_taper_start", label: "PA Taper Starts At", prefix: "£" },
      {
        key: "blind_persons_allowance",
        label: "Blind Person's Allowance",
        prefix: "£",
      },
      {
        key: "marriage_allowance_percent",
        label: "Marriage Allowance Transfer %",
        suffix: "%",
      },
    ],
  },
  {
    title: "National Insurance",
    fields: [
      { key: "class2_weekly_rate", label: "Class 2 Weekly Rate", prefix: "£" },
      {
        key: "class2_small_profits_threshold",
        label: "Class 2 Small Profits Threshold",
        prefix: "£",
      },
      {
        key: "class4_lower_threshold",
        label: "Class 4 Lower Profits Threshold",
        prefix: "£",
      },
      {
        key: "class4_upper_threshold",
        label: "Class 4 Upper Profits Threshold",
        prefix: "£",
      },
      {
        key: "class4_main_rate_percent",
        label: "Class 4 Main Rate %",
        suffix: "%",
      },
      {
        key: "class4_upper_rate_percent",
        label: "Class 4 Upper Rate %",
        suffix: "%",
      },
    ],
  },
  {
    title: "VAT",
    fields: [
      {
        key: "vat_registration_threshold",
        label: "Registration Threshold",
        prefix: "£",
      },
      {
        key: "vat_deregistration_threshold",
        label: "Deregistration Threshold",
        prefix: "£",
      },
      {
        key: "vat_standard_rate_percent",
        label: "Standard Rate %",
        suffix: "%",
      },
      { key: "vat_reduced_rate_percent", label: "Reduced Rate %", suffix: "%" },
      {
        key: "vat_payment_deadline_days",
        label: "Payment Deadline (days after quarter)",
        suffix: "days",
      },
    ],
  },
  {
    title: "Mileage",
    fields: [
      {
        key: "mileage_car_first_tier_rate",
        label: "Car/Van First Tier Rate (per mile)",
        prefix: "£",
      },
      {
        key: "mileage_car_first_tier_limit",
        label: "First Tier Mileage Limit",
        suffix: "miles",
      },
      {
        key: "mileage_car_second_tier_rate",
        label: "Car/Van Second Tier Rate (per mile)",
        prefix: "£",
      },
      {
        key: "mileage_motorcycle_rate",
        label: "Motorcycle Rate (per mile)",
        prefix: "£",
      },
      {
        key: "mileage_bicycle_rate",
        label: "Bicycle Rate (per mile)",
        prefix: "£",
      },
      {
        key: "mileage_passenger_rate",
        label: "Passenger Rate (per mile)",
        prefix: "£",
      },
    ],
  },
  {
    title: "Capital Allowances",
    fields: [
      {
        key: "aia_limit",
        label: "Annual Investment Allowance Limit",
        prefix: "£",
      },
      { key: "main_pool_wda_percent", label: "Main Pool WDA %", suffix: "%" },
      {
        key: "special_rate_wda_percent",
        label: "Special Rate Pool WDA %",
        suffix: "%",
      },
      {
        key: "first_year_allowance_percent",
        label: "First Year Allowance %",
        suffix: "%",
      },
    ],
  },
  {
    title: "Payments on Account",
    fields: [
      { key: "poa_threshold", label: "Minimum Tax Bill for POA", prefix: "£" },
      {
        key: "poa_rate_percent",
        label: "POA Rate (% of prior year bill)",
        suffix: "%",
      },
    ],
  },
  {
    title: "Miscellaneous Allowances",
    fields: [
      { key: "trading_allowance", label: "Trading Allowance", prefix: "£" },
      { key: "dividend_allowance", label: "Dividend Allowance", prefix: "£" },
      {
        key: "dividend_basic_rate",
        label: "Dividend Basic Rate %",
        suffix: "%",
      },
      {
        key: "dividend_higher_rate",
        label: "Dividend Higher Rate %",
        suffix: "%",
      },
      {
        key: "dividend_additional_rate",
        label: "Dividend Additional Rate %",
        suffix: "%",
      },
      {
        key: "savings_allowance_basic",
        label: "Savings Allowance (Basic Rate)",
        prefix: "£",
      },
      {
        key: "savings_allowance_higher",
        label: "Savings Allowance (Higher Rate)",
        prefix: "£",
      },
      {
        key: "pension_annual_allowance",
        label: "Pension Annual Allowance",
        prefix: "£",
      },
    ],
  },
  {
    title: "Student Loan Thresholds",
    fields: [
      {
        key: "student_loan_plan1_threshold",
        label: "Plan 1 Threshold",
        prefix: "£",
      },
      {
        key: "student_loan_plan2_threshold",
        label: "Plan 2 Threshold",
        prefix: "£",
      },
      {
        key: "student_loan_plan4_threshold",
        label: "Plan 4 Threshold",
        prefix: "£",
      },
      {
        key: "student_loan_postgrad_threshold",
        label: "Postgrad Threshold",
        prefix: "£",
      },
    ],
  },
];

function TaxYearTab({ onDirtyChange }: DirtyTabProps) {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const configQuery = useTaxYearConfigs();
  const { data: configs, isLoading } = configQuery;
  const update = useUpdateTaxYearConfig();
  const create = useCreateTaxYearConfig();
  const [selectedYear, setSelectedYear] = useState("2025/26");
  const [form, setForm] = useState<Partial<TaxYearConfig>>({});
  const [baseline, setBaseline] = useState<Partial<TaxYearConfig>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newYear, setNewYear] = useState("");

  useEffect(() => {
    const config = configs?.find((c) => c.tax_year === selectedYear);
    if (config) {
      setForm(config);
      setBaseline(config);
    }
  }, [configs, selectedYear]);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const set = (k: string, v: string) =>
    setForm((f) => ({ ...f, [k]: parseFloat(v) || v }));

  const handleSave = async () => {
    setSaveError("");
    try {
      await update.mutateAsync({
        ...form,
        tax_year: selectedYear,
      } as TaxYearConfig);
      setBaseline(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Tax year settings could not be saved.");
    }
  };

  const handleAddYear = async () => {
    if (!newYear.match(/^\d{4}\/\d{2}$/)) return;
    const startYear = parseInt(newYear.split("/")[0]);
    await create.mutateAsync({
      tax_year: newYear,
      year_start: `${startYear}-04-06`,
      year_end: `${startYear + 1}-04-05`,
    });
    setSelectedYear(newYear);
    setNewYear("");
  };

  if (isLoading) return <LoadingSpinner />;
  if (configQuery.isError)
    return (
      <QueryErrorState
        title="Tax-year settings could not be loaded"
        onRetry={configQuery.refetch}
        isRetrying={configQuery.isFetching}
      />
    );

  return (
    <div className="space-y-6">
      <Alert variant="warning">
        <AlertDescription>
          These rates are used for all tax estimates. Update them after each
          HMRC Budget announcement. Historical years are never affected by
          changes to other years.
        </AlertDescription>
      </Alert>

      <div className="flex items-end gap-4">
        <div className="space-y-1">
          <Label>Tax Year</Label>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {configs?.map((c) => (
                <SelectItem key={c.tax_year} value={c.tax_year}>
                  {c.tax_year}
                  {c.tax_year === currentTaxYear && (
                    <Badge variant="success" className="ml-2 text-xs">
                      Current
                    </Badge>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Add New Tax Year</Label>
          <div className="flex gap-2">
            <Input
              className="w-32"
              placeholder="2026/27"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
              maxLength={7}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Add tax year"
              onClick={handleAddYear}
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {TAX_YEAR_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {section.fields.map((field) => (
                <div key={field.key} className="space-y-1">
                  <Label className="text-xs">{field.label}</Label>
                  <div className="relative">
                    {field.prefix && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                        {field.prefix}
                      </span>
                    )}
                    <Input
                      type="number"
                      step="any"
                      className={
                        field.prefix ? "pl-7" : field.suffix ? "pr-14" : ""
                      }
                      value={
                        ((form as Record<string, unknown>)[
                          field.key
                        ] as string) ?? ""
                      }
                      onChange={(e) => set(field.key, e.target.value)}
                    />
                    {field.suffix && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {field.suffix}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-0 z-10 flex items-center justify-between rounded-md border bg-card/95 p-3 shadow-sm backdrop-blur">
        <span className={`text-sm ${saveError ? "text-destructive" : "text-muted-foreground"}`} role="status">
          {saveError ||
            (saved
              ? `${selectedYear} rates saved.`
              : dirty
                ? "You have unsaved tax rate changes."
                : "All changes saved.")}
        </span>
        <Button onClick={handleSave} disabled={update.isPending}>
          <Save className="mr-2 h-4 w-4" />
          {saved ? "Saved!" : update.isPending ? "Saving..." : "Save Tax Year"}
        </Button>
      </div>
    </div>
  );
}

// ─── Security Tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const { data: pinEnabled } = useAppSetting("pin_enabled");
  const { data: pinHash } = useAppSetting("pin_hash");
  const setAppSetting = useSetAppSetting();
  const [enabled, setEnabled] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setEnabled(pinEnabled === "true");
  }, [pinEnabled]);

  const handleTogglePin = async (v: boolean) => {
    if (!v) {
      await setAppSetting.mutateAsync({ key: "pin_enabled", value: "false" });
      await setAppSetting.mutateAsync({ key: "pin_hash", value: "" });
      setEnabled(false);
    } else {
      setEnabled(true);
    }
  };

  const handleSetPin = async () => {
    setError("");
    if (newPin.length < 4) {
      setError("PIN must be at least 4 digits");
      return;
    }
    if (newPin !== confirmPin) {
      setError("PINs do not match");
      return;
    }
    if (pinHash && pinHash !== "") {
      const valid = await verifyPin(currentPin, pinHash);
      if (!valid) {
        setError("Current PIN is incorrect");
        return;
      }
    }
    const hash = await hashPin(newPin);
    await setAppSetting.mutateAsync({ key: "pin_hash", value: hash });
    await setAppSetting.mutateAsync({ key: "pin_enabled", value: "true" });
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setSuccess("PIN updated successfully");
    setTimeout(() => setSuccess(""), 3000);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            PIN Protection
          </CardTitle>
          <CardDescription>Require a PIN to open the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Enable PIN Lock</p>
              <p className="text-sm text-muted-foreground">
                App will prompt for PIN on launch
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleTogglePin} />
          </div>
          {enabled && (
            <div className="space-y-4 border-t pt-4">
              {pinHash && pinHash !== "" && (
                <div className="space-y-2">
                  <Label>Current PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(e) =>
                      setCurrentPin(e.target.value.replace(/\D/g, ""))
                    }
                    maxLength={8}
                    placeholder="••••"
                    className="w-32"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>{pinHash ? "New PIN" : "Set PIN"}</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  maxLength={8}
                  placeholder="••••"
                  className="w-32"
                />
              </div>
              <div className="space-y-2">
                <Label>Confirm PIN</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) =>
                    setConfirmPin(e.target.value.replace(/\D/g, ""))
                  }
                  maxLength={8}
                  placeholder="••••"
                  className="w-32"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-green-600">{success}</p>}
              <Button onClick={handleSetPin}>Set PIN</Button>
            </div>
          )}
        </CardContent>
      </Card>
      <Alert variant="info">
        <AlertDescription>
          All data is stored locally on this device. No financial information is
          ever transmitted to any server or third party.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs = [
    { value: "personal", label: "Personal & business" },
    { value: "invoice", label: "Invoice template" },
    { value: "tax", label: "Tax year rates" },
    { value: "reminders", label: "Reminders" },
    { value: "import", label: "Data import" },
    { value: "updates", label: "Updates" },
    { value: "security", label: "Security" },
  ];
  const requestedSection = searchParams.get("section");
  const [section, setSection] = useState(
    tabs.some((tab) => tab.value === requestedSection)
      ? requestedSection!
      : "personal",
  );
  const [navigationSearch, setNavigationSearch] = useState("");
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>(
    {},
  );
  const dirty = Boolean(dirtySections[section]);
  const setPersonalDirty = useCallback(
    (value: boolean) =>
      setDirtySections((current) =>
        current.personal === value ? current : { ...current, personal: value },
      ),
    [],
  );
  const setInvoiceDirty = useCallback(
    (value: boolean) =>
      setDirtySections((current) =>
        current.invoice === value ? current : { ...current, invoice: value },
      ),
    [],
  );
  const setTaxDirty = useCallback(
    (value: boolean) =>
      setDirtySections((current) =>
        current.tax === value ? current : { ...current, tax: value },
      ),
    [],
  );
  const { confirm } = useFeedback();
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const changeSection = async (value: string) => {
    if (value === section) return;
    if (
      dirty &&
      !(await confirm({
        title: "Discard unsaved settings?",
        description: "Changes in this settings section have not been saved.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    setDirtySections((current) => ({ ...current, [section]: false }));
    setSection(value);
    const next = new URLSearchParams(searchParams);
    if (value === "personal") next.delete("section");
    else next.set("section", value);
    setSearchParams(next, { replace: true });
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application"
        title="Settings"
        description="Manage business identity, tax rules, documents, security and local application preferences."
      />
      <Tabs
        value={section}
        onValueChange={(value) => void changeSection(value)}
        className="grid items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]"
      >
        <div className="space-y-2 lg:sticky lg:top-20">
          <Input
            value={navigationSearch}
            onChange={(event) => setNavigationSearch(event.target.value)}
            placeholder="Find a setting..."
            aria-label="Find a settings section"
          />
          <TabsList className="flex h-auto flex-col items-stretch gap-1 bg-transparent p-0">
            {tabs
              .filter((tab) =>
                tab.label
                  .toLowerCase()
                  .includes(navigationSearch.trim().toLowerCase()),
              )
              .map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="justify-start rounded-md border-0 px-3 py-2 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    {tab.label}
                    {dirty && tab.value === section && (
                      <Badge variant="warning">Unsaved</Badge>
                    )}
                  </span>
                </TabsTrigger>
              ))}
          </TabsList>
        </div>
        <div className="min-w-0">
          <TabsContent value="personal" className="m-0">
            <PersonalTab onDirtyChange={setPersonalDirty} />
          </TabsContent>
          <TabsContent value="invoice" className="m-0">
            <InvoiceTemplateTab onDirtyChange={setInvoiceDirty} />
          </TabsContent>
          <TabsContent value="tax" className="m-0">
            <TaxYearTab onDirtyChange={setTaxDirty} />
          </TabsContent>
          <TabsContent value="reminders" className="m-0">
            <ReminderSettingsPanel />
          </TabsContent>
          <TabsContent value="import" className="m-0">
            <MigrationImportPanel />
          </TabsContent>
          <TabsContent value="updates" className="m-0">
            <UpdateSettingsPanel />
          </TabsContent>
          <TabsContent value="security" className="m-0">
            <SecurityTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

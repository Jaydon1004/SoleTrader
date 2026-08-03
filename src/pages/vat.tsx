import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CircleCheckBig,
  Clock3,
  Landmark,
  LockKeyhole,
  Save,
  Settings2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { LoadingSpinner } from "@/components/loading";
import { VatAdjustments } from "@/components/vat/vat-adjustments";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import {
  useFileVatReturn,
  useSaveVatSettings,
  useVatOverview,
  type VatReturnSummary,
} from "@/lib/queries/vat";
import { useAppStore } from "@/stores/app-store";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const months = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2026, index, 1).toLocaleDateString("en-GB", {
    month: "long",
  }),
}));

const boxDescriptions: Array<{
  key: keyof Pick<
    VatReturnSummary,
    | "box1"
    | "box2"
    | "box3"
    | "box4"
    | "box5"
    | "box6"
    | "box7"
    | "box8"
    | "box9"
  >;
  title: string;
  description: string;
}> = [
  {
    key: "box1",
    title: "Box 1",
    description: "VAT due on sales and other outputs",
  },
  { key: "box2", title: "Box 2", description: "VAT due on EC acquisitions" },
  { key: "box3", title: "Box 3", description: "Total VAT due" },
  { key: "box4", title: "Box 4", description: "VAT reclaimed on purchases" },
  { key: "box5", title: "Box 5", description: "Net VAT to pay or reclaim" },
  { key: "box6", title: "Box 6", description: "Total sales excluding VAT" },
  { key: "box7", title: "Box 7", description: "Total purchases excluding VAT" },
  {
    key: "box8",
    title: "Box 8",
    description: "EC goods supplies excluding VAT",
  },
  {
    key: "box9",
    title: "Box 9",
    description: "EC goods acquisitions excluding VAT",
  },
];

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function schemeName(value: string) {
  if (value === "flat_rate") return "Flat Rate Scheme";
  if (value === "cash_accounting") return "Cash Accounting";
  return "Standard VAT Accounting";
}

export function VatPage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const { data: taxYears } = useTaxYearConfigs();
  const { data, isLoading, error } = useVatOverview(currentTaxYear);
  const saveSettings = useSaveVatSettings();
  const fileVatReturn = useFileVatReturn();
  const [periodStart, setPeriodStart] = useState("");
  const [quarterStartMonth, setQuarterStartMonth] = useState(1);
  const [mtdEnabled, setMtdEnabled] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmFiling, setConfirmFiling] = useState(false);
  const [filingError, setFilingError] = useState("");

  useEffect(() => {
    if (!data) return;
    const today = new Date().toISOString().slice(0, 10);
    const current = data.returns.find(
      (period) => today >= period.start && today <= period.end,
    );
    if (!data.returns.some((period) => period.start === periodStart))
      setPeriodStart(
        (current ?? data.returns[data.returns.length - 1])?.start ?? "",
      );
    setQuarterStartMonth(data.settings.quarter_start_month);
    setMtdEnabled(data.settings.mtd_enabled === 1);
    setRemindersEnabled(data.settings.reminders_enabled === 1);
  }, [data, periodStart]);

  if (isLoading) return <LoadingSpinner />;
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertTitle>VAT data unavailable</AlertTitle>
        <AlertDescription>
          {error?.message ?? "VAT configuration could not be loaded."}
        </AlertDescription>
      </Alert>
    );

  const selectedReturn =
    data.returns.find((period) => period.start === periodStart) ??
    data.returns[0];
  const registered = data.profile.vat_status !== "unregistered";
  const atThreshold =
    data.rollingTurnover >= data.config.vat_registration_threshold;
  const nearThreshold = !atThreshold && data.thresholdPercent >= 90;
  const deadlineAlert =
    selectedReturn &&
    remindersEnabled &&
    selectedReturn.daysUntilDeadline <= 30;
  const readinessChecks = registered
    ? [
        Boolean(data.profile.vat_number),
        data.settings.mtd_enabled === 1,
        selectedReturn?.box5 !== undefined,
      ]
    : [];
  const readinessCount = readinessChecks.filter(Boolean).length;

  const handleSaveSettings = async () => {
    setSaveError("");
    try {
      await saveSettings.mutateAsync({
        quarter_start_month: quarterStartMonth,
        mtd_enabled: mtdEnabled ? 1 : 0,
        reminders_enabled: remindersEnabled ? 1 : 0,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "VAT settings could not be saved.",
      );
    }
  };

  const handleFileReturn = async () => {
    if (!selectedReturn) return;
    setFilingError("");
    try {
      await fileVatReturn.mutateAsync({
        taxYear: currentTaxYear,
        scheme: data.profile.vat_scheme,
        vatReturn: selectedReturn,
      });
      setConfirmFiling(false);
    } catch (caught) {
      setFilingError(
        caught instanceof Error
          ? caught.message
          : "The VAT return could not be locked.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            VAT management
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            Returns and registration
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live VAT position from issued invoices, payments, credits, expenses,
            and vehicle purchases.
          </p>
        </div>
        <Select value={currentTaxYear} onValueChange={setCurrentTaxYear}>
          <SelectTrigger className="w-40">
            <CalendarDays className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {taxYears?.map((year) => (
              <SelectItem key={year.tax_year} value={year.tax_year}>
                {year.tax_year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Rolling 12-month turnover
            </p>
            <p className="mt-2 text-2xl font-semibold">
              {money.format(data.rollingTurnover)}
            </p>
            <Progress
              className="mt-3"
              value={Math.min(100, data.thresholdPercent)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {data.thresholdPercent.toFixed(1)}% of{" "}
              {money.format(data.config.vat_registration_threshold)}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Registration
            </p>
            <p className="mt-2 text-xl font-semibold">
              {registered ? "VAT registered" : "Not registered"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {registered
                ? data.profile.vat_number || "No VAT number saved"
                : "Threshold monitoring remains active"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Accounting scheme
            </p>
            <p className="mt-2 text-xl font-semibold">
              {schemeName(data.profile.vat_scheme)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              {data.profile.vat_scheme === "flat_rate"
                ? `${data.profile.vat_flat_rate_percent ?? 0}% industry rate`
                : "Configured in Business Settings"}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Making Tax Digital
            </p>
            <p className="mt-2 text-xl font-semibold">
              {data.settings.mtd_enabled === 1 ? "Enabled" : "Disabled"}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Digital record preference
            </p>
          </CardContent>
        </Card>
      </section>

      {atThreshold && (
        <Alert variant="destructive">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            VAT registration threshold reached
          </AlertTitle>
          <AlertDescription>
            Rolling taxable turnover is {money.format(data.rollingTurnover)},
            above the configured{" "}
            {money.format(data.config.vat_registration_threshold)} threshold.
            Review registration obligations immediately.
          </AlertDescription>
        </Alert>
      )}
      {nearThreshold && (
        <Alert variant="warning">
          <AlertTitle>Approaching VAT registration threshold</AlertTitle>
          <AlertDescription>
            {money.format(
              data.config.vat_registration_threshold - data.rollingTurnover,
            )}{" "}
            remains before the configured threshold is reached.
          </AlertDescription>
        </Alert>
      )}
      {!registered && (
        <Alert variant="info">
          <AlertTitle>VAT returns are inactive</AlertTitle>
          <AlertDescription>
            Turnover monitoring remains available. Enable VAT registration,
            enter the VAT number, and select a scheme in{" "}
            <Link className="font-medium underline" to="/settings">
              Business Settings
            </Link>{" "}
            to calculate returns.
          </AlertDescription>
        </Alert>
      )}
      {registered && (
        <Alert variant="info">
          <AlertTitle>Estimate only</AlertTitle>
          <AlertDescription>
            VAT boxes and scheme comparisons are working estimates from current
            records. Review tax points, VAT treatment, evidence, and adjustments
            before submitting figures to HMRC.
          </AlertDescription>
        </Alert>
      )}

      {registered && selectedReturn && (
        <section
          className={`border-l-4 p-4 ${selectedReturn.filedAt ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" : selectedReturn.daysUntilDeadline < 0 ? "border-destructive bg-red-50 dark:bg-red-950/30" : "border-amber-500 bg-amber-50 dark:bg-amber-950/30"}`}
          aria-labelledby="vat-filing-status"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 id="vat-filing-status" className="font-semibold">
                  {selectedReturn.label}
                </h3>
                <Badge
                  variant={
                    selectedReturn.filedAt
                      ? "success"
                      : readinessCount === readinessChecks.length
                        ? "warning"
                        : "destructive"
                  }
                >
                  {selectedReturn.filedAt
                    ? "Filed and locked"
                    : `${readinessCount} of ${readinessChecks.length} readiness checks clear`}
                </Badge>
              </div>
              <p className="mt-1 text-sm">
                Filing and payment deadline:{" "}
                <strong>{formatDate(selectedReturn.deadline)}</strong>
                {!selectedReturn.filedAt &&
                  ` · ${selectedReturn.daysUntilDeadline < 0 ? `${Math.abs(selectedReturn.daysUntilDeadline)} days overdue` : `${selectedReturn.daysUntilDeadline} days remaining`}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                VAT number {data.profile.vat_number ? "recorded" : "missing"} ·
                MTD {data.settings.mtd_enabled === 1 ? "enabled" : "disabled"} ·
                Boxes 1–9 calculated
              </p>
            </div>
            {!selectedReturn.filedAt && (
              <Button onClick={() => setConfirmFiling(true)}>
                <LockKeyhole className="mr-2 h-4 w-4" />
                Review and lock return
              </Button>
            )}
          </div>
        </section>
      )}

      {registered && selectedReturn && (
        <Tabs defaultValue="return" className="space-y-4">
          <TabsList>
            <TabsTrigger value="return">VAT return</TabsTrigger>
            <TabsTrigger value="comparison">Scheme comparison</TabsTrigger>
            <TabsTrigger value="settings">Period and MTD settings</TabsTrigger>
          </TabsList>
          <TabsContent value="return" className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold">Quarterly return</h3>
                <p className="text-sm text-muted-foreground">
                  Choose a period to read off Boxes 1–9.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={periodStart}
                  onValueChange={(value) => {
                    setPeriodStart(value);
                    setConfirmFiling(false);
                    setFilingError("");
                  }}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.returns.map((period) => (
                      <SelectItem key={period.start} value={period.start}>
                        {period.label}
                        {period.filedAt ? " · Filed" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedReturn.filedAt && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmFiling(true)}
                  >
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Lock return
                  </Button>
                )}
              </div>
            </div>
            {selectedReturn.filedAt && (
              <Alert variant="success">
                <AlertTitle>Filed return locked</AlertTitle>
                <AlertDescription>
                  Boxes 1–9 are the immutable snapshot filed on{" "}
                  {new Date(`${selectedReturn.filedAt}Z`).toLocaleString(
                    "en-GB",
                  )}
                  .
                </AlertDescription>
              </Alert>
            )}
            {confirmFiling && !selectedReturn.filedAt && (
              <Alert variant="warning">
                <AlertTitle>Lock this VAT return?</AlertTitle>
                <AlertDescription className="mt-2 space-y-3">
                  <p>
                    This stores Boxes 1–9 as an immutable filed snapshot. Review
                    the figures and HMRC submission before continuing.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => void handleFileReturn()}
                      disabled={fileVatReturn.isPending}
                    >
                      {fileVatReturn.isPending
                        ? "Locking..."
                        : "Confirm and lock"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmFiling(false)}
                      disabled={fileVatReturn.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            {filingError && (
              <Alert variant="destructive">
                <AlertDescription>{filingError}</AlertDescription>
              </Alert>
            )}
            {deadlineAlert && (
              <Alert
                variant={
                  selectedReturn.daysUntilDeadline < 0
                    ? "destructive"
                    : "warning"
                }
              >
                <AlertTitle className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4" />
                  {selectedReturn.daysUntilDeadline < 0
                    ? "VAT deadline passed"
                    : "VAT deadline approaching"}
                </AlertTitle>
                <AlertDescription>
                  Payment and filing deadline:{" "}
                  {formatDate(selectedReturn.deadline)}
                  {selectedReturn.daysUntilDeadline >= 0
                    ? ` (${selectedReturn.daysUntilDeadline} days remaining)`
                    : ` (${Math.abs(selectedReturn.daysUntilDeadline)} days ago)`}
                  .
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {boxDescriptions.map((box) => {
                const value = selectedReturn[box.key];
                const isNet = box.key === "box5";
                return (
                  <Card
                    key={box.key}
                    className={`rounded-lg shadow-sm ${isNet ? "border-primary" : ""}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          {box.title}
                        </p>
                        {isNet &&
                          (value <= 0 ? (
                            <CircleCheckBig className="h-4 w-4 text-emerald-700" />
                          ) : (
                            <Landmark className="h-4 w-4 text-amber-700" />
                          ))}
                      </div>
                      <p className="mt-2 text-2xl font-semibold">
                        {money.format(Math.abs(value))}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isNet
                          ? value < 0
                            ? "Net VAT reclaimable"
                            : "Net VAT payable"
                          : box.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            {selectedReturn.filedReturnId !== null && (
              <VatAdjustments
                filedReturnId={selectedReturn.filedReturnId}
                defaultDate={
                  data.returns.find(
                    (period) =>
                      period.start > selectedReturn.end && !period.filedAt,
                  )?.start ?? new Date().toISOString().slice(0, 10)
                }
              />
            )}
            <p className="text-xs text-muted-foreground">
              Period {formatDate(selectedReturn.start)} to{" "}
              {formatDate(selectedReturn.end)} · deadline{" "}
              {formatDate(selectedReturn.deadline)} · calculated using{" "}
              {schemeName(data.profile.vat_scheme)}.
            </p>
          </TabsContent>

          <TabsContent value="comparison" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="rounded-lg shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">Selected scheme</CardTitle>
                  <CardDescription>
                    {schemeName(data.profile.vat_scheme)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">
                    {money.format(selectedReturn.box5)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Net position for {selectedReturn.label}
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-lg shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Standard accounting comparison
                  </CardTitle>
                  <CardDescription>
                    Output VAT less normal input VAT
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-semibold">
                    {money.format(selectedReturn.standardNetVat)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Uses the same recorded transactions
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-lg shadow-sm">
                <CardHeader>
                  <CardTitle className="text-base">
                    Flat-rate difference
                  </CardTitle>
                  <CardDescription>
                    Positive means Flat Rate is lower
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p
                    className={`text-3xl font-semibold ${selectedReturn.flatRateDifference >= 0 ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {money.format(selectedReturn.flatRateDifference)}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Comparison only, before eligibility adjustments
                  </p>
                </CardContent>
              </Card>
            </div>
            {data.profile.vat_scheme === "flat_rate" &&
              (data.profile.vat_flat_rate_percent ?? 0) === 0 && (
                <Alert variant="warning">
                  <AlertTitle>Flat-rate percentage is missing</AlertTitle>
                  <AlertDescription>
                    Enter the HMRC industry percentage in Business Settings
                    before relying on this return.
                  </AlertDescription>
                </Alert>
              )}
          </TabsContent>

          <TabsContent value="settings">
            <Card className="max-w-3xl rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings2 className="h-4 w-4" />
                  VAT return preferences
                </CardTitle>
                <CardDescription>
                  Changing the quarter start regenerates the periods shown for
                  every tax year.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label>Quarter cycle starts in</Label>
                  <Select
                    value={String(quarterStartMonth)}
                    onValueChange={(value) =>
                      setQuarterStartMonth(Number(value))
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((month) => (
                        <SelectItem
                          key={month.value}
                          value={String(month.value)}
                        >
                          {month.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div>
                    <Label htmlFor="mtd">Making Tax Digital</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Record that VAT returns are maintained for digital
                      submission.
                    </p>
                  </div>
                  <Switch
                    id="mtd"
                    checked={mtdEnabled}
                    onCheckedChange={setMtdEnabled}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div>
                    <Label htmlFor="vat-reminders">Deadline reminders</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Show alerts during the 30 days before payment and filing
                      are due.
                    </p>
                  </div>
                  <Switch
                    id="vat-reminders"
                    checked={remindersEnabled}
                    onCheckedChange={setRemindersEnabled}
                  />
                </div>
                <Button
                  onClick={handleSaveSettings}
                  disabled={saveSettings.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {saveSettings.isPending
                    ? "Saving"
                    : saved
                      ? "Saved"
                      : "Save VAT settings"}
                </Button>
                {saveError && (
                  <p className="text-sm text-destructive" role="alert">
                    {saveError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

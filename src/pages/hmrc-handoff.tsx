import { useState } from "react";
import { Link } from "react-router-dom";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FolderOpen,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { LoadingSpinner } from "@/components/loading";
import { HmrcFilingPanel } from "@/components/hmrc-filing-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  accountantExportErrorMessage,
  exportHmrcHandoffPackage,
  type AccountantPackageResult,
} from "@/lib/accountant-package";
import { buildHmrcReadiness } from "@/lib/hmrc-handoff";
import {
  buildHmrcBusinessCalculation,
  buildSa103Schedule,
  useHmrcFilingDetails,
} from "@/lib/hmrc-filing";
import { rebuildShadowLedger, useYearEndStatus } from "@/lib/ledger";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useTaxCalculatorInput } from "@/lib/queries/tax-calculator";
import { calculateFullTaxEstimate } from "@/lib/tax-estimate";
import { useYearEndHandoff } from "@/lib/year-end-handoff";
import { useAppStore } from "@/stores/app-store";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function HmrcHandoffPage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const { data: taxYears } = useTaxYearConfigs();
  const dashboardQuery = useDashboardData(currentTaxYear);
  const handoffQuery = useYearEndHandoff(currentTaxYear);
  const filingQuery = useHmrcFilingDetails(currentTaxYear);
  const taxInputQuery = useTaxCalculatorInput(currentTaxYear);
  const advancedTaxQuery = useAdvancedTaxData(currentTaxYear);
  const yearEndQuery = useYearEndStatus(currentTaxYear);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<AccountantPackageResult | null>(null);
  const [error, setError] = useState("");

  if (
    dashboardQuery.isLoading ||
    handoffQuery.isLoading ||
    filingQuery.isLoading ||
    taxInputQuery.isLoading ||
    advancedTaxQuery.isLoading
  )
    return <LoadingSpinner />;
  const dashboard = dashboardQuery.data;
  const filing = filingQuery.data;
  const taxInput = taxInputQuery.data;
  const advancedTax = advancedTaxQuery.data;
  const loadError =
    dashboardQuery.error ??
    handoffQuery.error ??
    filingQuery.error ??
    taxInputQuery.error ??
    advancedTaxQuery.error;
  if (loadError || !dashboard || !filing || !taxInput || !advancedTax)
    return (
      <Alert variant="destructive">
        <AlertTitle>HMRC handoff unavailable</AlertTitle>
        <AlertDescription>
          {loadError?.message ?? "The tax-year records could not be loaded."}
        </AlertDescription>
      </Alert>
    );

  const calculation = buildHmrcBusinessCalculation({
    dashboard,
    taxInput,
    advancedTax,
    filing,
    closingStock: handoffQuery.data?.details.stock_value,
  });
  const schedule = buildSa103Schedule({ dashboard, filing, calculation });
  const taxEstimate = calculateFullTaxEstimate(
    calculation.totalTaxableProfit,
    {
      ...taxInput,
      home_office_method: "none",
      home_office_hours_per_month: 0,
      home_office_months: 0,
      home_office_actual_cost: 0,
      other_tax_deducted:
        taxInput.other_tax_deducted + filing.other_tax_taken_off,
    },
    dashboard.config,
    dashboard.profile,
    dashboard.taxPaid,
    { cisDeductionsReceived: calculation.cisDeductions },
  );
  const readiness = buildHmrcReadiness({
    dashboard,
    handoff: handoffQuery.data,
    filing,
    schedule,
    calculation,
    taxInputsSaved: Boolean(taxInput.created_at || taxInput.updated_at),
    yearClosed: yearEndQuery.data?.status === "closed",
  });
  const createPackage = async () => {
    setExporting(true);
    setError("");
    setResult(null);
    try {
      const ledger = await rebuildShadowLedger();
      if (!ledger.balanced)
        throw new Error(
          "The ledger is not balanced. Resolve the ledger control before creating an HMRC handoff.",
        );
      setResult(
        await exportHmrcHandoffPackage(currentTaxYear, dashboard, {
          filing,
          calculation,
          schedule,
          taxEstimate,
        }),
      );
    } catch (caught) {
      setError(accountantExportErrorMessage(caught));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Self Assessment preparation
          </p>
          <h2 className="mt-1 text-2xl font-semibold">HMRC handoff</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Review the figures, declarations and source evidence needed to file
            through HMRC-recognised software or an authorised agent.
          </p>
        </div>
        <Select
          value={currentTaxYear}
          onValueChange={(value) => {
            setCurrentTaxYear(value);
            setResult(null);
            setError("");
          }}
        >
          <SelectTrigger className="w-44">
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

      <Alert variant="info">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>
          This prepares evidence; it does not file a return
        </AlertTitle>
        <AlertDescription>
          SoleTrader does not currently connect to HMRC. Only an HMRC receipt
          and submission reference prove that a return was received.
        </AlertDescription>
      </Alert>

      <section className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-7">
          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Records readiness</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  These controls establish whether the records and calculation
                  are ready for final review in filing software.
                </p>
              </div>
              <Badge variant={readiness.ready ? "success" : "warning"}>
                {readiness.ready
                  ? "Records ready for final review"
                  : `${readiness.reviewCount} to review`}
              </Badge>
            </div>
            <div className="border-y">
              {readiness.checks.map((check) => {
                const clear = check.status === "clear";
                const Icon = clear ? CheckCircle2 : AlertCircle;
                return (
                  <div
                    key={check.key}
                    className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-b py-3 last:border-0"
                  >
                    <Icon
                      className={`mt-0.5 h-5 w-5 ${clear ? "text-primary" : "text-amber-600"}`}
                    />
                    <div>
                      <p className="text-sm font-semibold">{check.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {check.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/accountant">Complete declarations and controls</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/tax">Review whole-return tax inputs</Link>
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold">Self-employment figures</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Derived from the selected accounting basis and the records dated
              {` ${dashboard.config.year_start} to ${dashboard.config.year_end}`}
              .
            </p>
            <dl className="mt-4 grid gap-px overflow-hidden border bg-border sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Turnover / recognised income", dashboard.income],
                ["Allowable business expenses", dashboard.expenses],
                ["Bookkeeping profit", calculation.bookkeepingProfit],
                ["Taxable business profit", calculation.totalTaxableProfit],
              ].map(([label, value]) => (
                <div className="bg-background p-4" key={String(label)}>
                  <dt className="text-xs font-medium text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 text-xl font-semibold tabular-nums">
                    {money.format(Number(value))}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-y">
              {dashboard.expenseCategories.length ? (
                dashboard.expenseCategories.map((category) => (
                  <div
                    className="flex justify-between gap-4 border-b py-2.5 text-sm last:border-0"
                    key={category.name}
                  >
                    <span>{category.name}</span>
                    <span className="font-medium tabular-nums">
                      {money.format(category.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  No allowable expenses are recorded for this tax year.
                </p>
              )}
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              The taxable figure includes saved use-of-home, capital allowance,
              balancing charge, private-use, loss and basis adjustments. It is
              still not a complete Self Assessment return.
            </p>
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3 border-y py-3">
              <span className="text-sm font-semibold">
                Estimated whole-return amount due
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {money.format(taxEstimate.amountDue)}
              </span>
              <span className="w-full text-xs text-muted-foreground">
                Estimate using saved employment, property, savings, dividend,
                pension, Gift Aid, student-loan and tax-deducted inputs.
              </span>
            </div>
          </section>

          <HmrcFilingPanel details={filing} />

          <section>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">
                  {schedule.form} working schedule
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {schedule.formVersion}. {schedule.reason}
                </p>
              </div>
              <Badge variant={schedule.verified ? "success" : "warning"}>
                {schedule.verified ? "Official form checked" : "Not verified"}
              </Badge>
            </div>
            {schedule.reviewItems.length > 0 && (
              <Alert className="mt-4" variant="warning">
                <AlertTitle>Form review required</AlertTitle>
                <AlertDescription>
                  {schedule.reviewItems.map((item) => (
                    <p className="mt-1 first:mt-0" key={item}>
                      {item}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
            <div className="mt-4 overflow-x-auto border-y">
              <table className="w-full min-w-[42rem] text-left text-sm">
                <thead className="border-b bg-muted/45 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Box</th>
                    <th className="px-3 py-2 font-semibold">Field</th>
                    <th className="px-3 py-2 text-right font-semibold">
                      Value
                    </th>
                    <th className="px-3 py-2 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.boxes.map((row) => (
                    <tr className="border-b last:border-0" key={row.box}>
                      <td className="px-3 py-2 font-semibold">{row.box}</td>
                      <td className="px-3 py-2">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {typeof row.value === "number"
                          ? money.format(row.value)
                          : row.value || "Not entered"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {row.source}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold">Evidence package</h3>
            <div className="mt-3 grid gap-x-8 md:grid-cols-2">
              {[
                "Business identity and accounting basis",
                "Sales, payments and credit notes",
                "Expenses and category totals",
                "Bank reconciliation and statement controls",
                "CIS, VAT and capital asset records",
                "Year-end and personal tax declarations",
                "Trial balance and general ledger",
                "Supporting files with SHA-256 checksums",
              ].map((item) => (
                <p className="border-t py-3 text-sm" key={item}>
                  {item}
                </p>
              ))}
            </div>
          </section>
        </div>

        <aside className="h-fit border-l-4 border-primary bg-muted/45 p-5 xl:sticky xl:top-6">
          <FileCheck2 className="h-6 w-6 text-primary" />
          <h3 className="mt-3 font-semibold">
            Create {currentTaxYear} package
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {readiness.ready
              ? "All recorded controls are clear. Perform a final review before filing."
              : "The package will be marked as requiring review and will list unresolved controls."}
          </p>
          <div className="mt-4 flex items-center gap-2 border-y py-3 text-sm">
            <LockKeyhole className="h-4 w-4 text-muted-foreground" />
            <span>
              {yearEndQuery.data?.status === "closed"
                ? "Tax year locked"
                : "Tax year remains editable"}
            </span>
          </div>
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={exporting}
            onClick={() => void createPackage()}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileCheck2 className="mr-2 h-4 w-4" />
            )}
            {exporting
              ? "Checking and creating..."
              : readiness.ready
                ? "Create HMRC evidence package"
                : "Create draft evidence package"}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            The ledger is rebuilt and checked before export. Sensitive tax and
            identity data is included; transfer the folder securely.
          </p>
        </aside>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>HMRC handoff not created</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert variant={result.reviewItems > 0 ? "warning" : "success"}>
          <FileCheck2 className="h-4 w-4" />
          <AlertTitle>HMRC evidence package created</AlertTitle>
          <AlertDescription>
            <p>
              {result.reviewItems} control item(s) require review;{" "}
              {result.counts.supportingFiles} supporting file(s) copied and{" "}
              {result.counts.missingSupportingFiles} missing.
            </p>
            <p className="mt-1 break-all text-xs">{result.directory}</p>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void openPath(result.directory)}
            >
              <FolderOpen className="mr-2 h-4 w-4" /> Open package folder
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

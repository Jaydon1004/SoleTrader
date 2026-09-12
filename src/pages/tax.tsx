import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Banknote,
  CalendarDays,
  Calculator,
  CircleCheckBig,
  Landmark,
  PiggyBank,
  Save,
} from "lucide-react";
import {
  CapitalAllowancesPanel,
  CisPanel,
} from "@/components/advanced-tax-panel";
import { LoadingSpinner } from "@/components/loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import {
  defaultTaxCalculatorInput,
  useSaveTaxCalculatorInput,
  useTaxCalculatorInput,
} from "@/lib/queries/tax-calculator";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import {
  calculateFullTaxEstimate,
  type TaxBandResult,
} from "@/lib/tax-estimate";
import { useAppStore } from "@/stores/app-store";
import type { TaxCalculatorInput, TaxYearConfig } from "@/types/database";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function MoneyInput({
  id,
  label,
  value,
  onChange,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          £
        </span>
        <Input
          id={id}
          className="pl-7"
          type="number"
          min="0"
          step="0.01"
          value={value || ""}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value) || 0))
          }
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone = "",
}: {
  label: string;
  value: number;
  icon: typeof Calculator;
  tone?: string;
}) {
  return (
    <Card className="rounded-lg shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <Icon className={`h-4 w-4 ${tone}`} />
        </div>
        <p className={`mt-2 text-2xl font-semibold ${tone}`}>
          {money.format(value)}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">Estimate only</p>
      </CardContent>
    </Card>
  );
}

function BreakdownRow({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 border-b py-2.5 last:border-0 ${strong ? "font-semibold" : "text-sm"} ${muted ? "text-muted-foreground" : ""}`}
    >
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">
        {money.format(value)}
      </span>
    </div>
  );
}

function BandRows({
  name,
  bands,
  config,
  dividend = false,
}: {
  name: string;
  bands: TaxBandResult;
  config: TaxYearConfig;
  dividend?: boolean;
}) {
  const rates = dividend
    ? [
        config.dividend_basic_rate,
        config.dividend_higher_rate,
        config.dividend_additional_rate,
      ]
    : [
        config.basic_rate_percent,
        config.higher_rate_percent,
        config.additional_rate_percent,
      ];
  return (
    <>
      {bands.basic > 0 && (
        <BreakdownRow
          label={`${name} at ${rates[0]}%`}
          value={(bands.basic * rates[0]) / 100}
        />
      )}
      {bands.higher > 0 && (
        <BreakdownRow
          label={`${name} at ${rates[1]}%`}
          value={(bands.higher * rates[1]) / 100}
        />
      )}
      {bands.additional > 0 && (
        <BreakdownRow
          label={`${name} at ${rates[2]}%`}
          value={(bands.additional * rates[2]) / 100}
        />
      )}
    </>
  );
}

function formatDeadline(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function TaxPage() {
  const [searchParams] = useSearchParams();
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const { data: taxYears } = useTaxYearConfigs();
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
  } = useDashboardData(currentTaxYear);
  const {
    data: advancedTax,
    isLoading: advancedTaxLoading,
    error: advancedTaxError,
  } = useAdvancedTaxData(currentTaxYear);
  const {
    data: savedInput,
    isLoading: inputLoading,
    error: inputError,
  } = useTaxCalculatorInput(currentTaxYear);
  const saveInput = useSaveTaxCalculatorInput();
  const [form, setForm] = useState<TaxCalculatorInput>(
    defaultTaxCalculatorInput(currentTaxYear),
  );
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const requestedSection = searchParams.get("section");
  const [workflowTab, setWorkflowTab] = useState(() =>
    ["inputs", "breakdown", "payments", "allowances", "cis"].includes(
      requestedSection ?? "",
    )
      ? requestedSection!
      : "inputs",
  );

  useEffect(() => {
    setForm(savedInput ?? defaultTaxCalculatorInput(currentTaxYear));
    setSaved(false);
  }, [savedInput, currentTaxYear]);

  useEffect(() => {
    if (
      requestedSection &&
      ["inputs", "breakdown", "payments", "allowances", "cis"].includes(
        requestedSection,
      )
    )
      setWorkflowTab(requestedSection);
  }, [requestedSection]);

  if (dashboardLoading || inputLoading || advancedTaxLoading)
    return <LoadingSpinner />;
  const loadError = dashboardError ?? inputError ?? advancedTaxError;
  if (loadError || !dashboard || !advancedTax)
    return (
      <Alert variant="destructive">
        <AlertTitle>Tax calculator unavailable</AlertTitle>
        <AlertDescription>
          {loadError?.message ?? "Tax year data could not be loaded."}
        </AlertDescription>
      </Alert>
    );

  const setNumber = (field: keyof TaxCalculatorInput, value: number) =>
    setForm((current) => ({ ...current, [field]: value }));
  const estimate = calculateFullTaxEstimate(
    dashboard.profit,
    form,
    dashboard.config,
    dashboard.profile,
    dashboard.taxPaid,
    {
      capitalAllowances: advancedTax.schedule.totalAllowance,
      balancingCharges: advancedTax.schedule.balancingCharge,
      cisDeductionsReceived: advancedTax.cisReceived,
    },
  );

  const handleSave = async () => {
    setSaveError("");
    try {
      await saveInput.mutateAsync({ ...form, tax_year: currentTaxYear });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (caught) {
      setSaveError(
        caught instanceof Error
          ? caught.message
          : "Tax inputs could not be saved.",
      );
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Self Assessment planning
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Tax calculator</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Transparent estimate using your live business records and configured
            HMRC rates.{" "}
            <span className="text-xs opacity-60">
              Rates current as of April 2026.
            </span>
          </p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={handleSave} disabled={saveInput.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveInput.isPending ? "Saving" : saved ? "Saved" : "Save inputs"}
          </Button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total income"
          value={estimate.totalIncome}
          icon={Banknote}
        />
        <SummaryCard
          label="Total liability"
          value={estimate.totalLiability}
          icon={Landmark}
          tone="text-amber-700"
        />
        <SummaryCard
          label="Tax already deducted"
          value={estimate.taxDeducted}
          icon={CircleCheckBig}
          tone="text-emerald-700"
        />
        <SummaryCard
          label="Estimated amount due"
          value={estimate.amountDue}
          icon={PiggyBank}
          tone="text-blue-700"
        />
      </section>

      <Alert variant="warning">
        <CalendarDays className="h-4 w-4" />
        <AlertTitle>
          Next Self Assessment payment date:{" "}
          {formatDeadline(estimate.paymentOnAccount.balancingDeadline)}
        </AlertTitle>
        <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span>
            Estimated balance and first payment on account due:{" "}
            <strong>
              {money.format(
                estimate.paymentOnAccount.balancingPayment +
                  estimate.paymentOnAccount.firstPayment,
              )}
            </strong>
            .
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setWorkflowTab("payments")}
          >
            Review payment plan
          </Button>
        </AlertDescription>
      </Alert>

      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{saveError}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={workflowTab}
        onValueChange={setWorkflowTab}
        className="space-y-4"
      >
        <div>
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
            Complete in order, then inspect specialist records as needed
          </p>
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="inputs">1. Enter annual inputs</TabsTrigger>
            <TabsTrigger value="breakdown">2. Review result</TabsTrigger>
            <TabsTrigger value="payments">3. Plan payments</TabsTrigger>
            <TabsTrigger value="allowances">Capital allowances</TabsTrigger>
            <TabsTrigger value="cis">CIS records</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="inputs" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Additional income</CardTitle>
                <CardDescription>
                  Income outside the invoices recorded in SoleTrader.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <MoneyInput
                  id="employment-income"
                  label="Employment income (P60/P45)"
                  value={form.employment_income}
                  onChange={(value) => setNumber("employment_income", value)}
                />
                <MoneyInput
                  id="employment-tax"
                  label="PAYE tax already deducted"
                  value={form.employment_tax_paid}
                  onChange={(value) => setNumber("employment_tax_paid", value)}
                />
                <MoneyInput
                  id="rental-income"
                  label="Rental profit"
                  value={form.rental_income}
                  onChange={(value) => setNumber("rental_income", value)}
                  hint="Enter taxable profit after property expenses."
                />
                <MoneyInput
                  id="savings-interest"
                  label="Savings interest"
                  value={form.savings_interest}
                  onChange={(value) => setNumber("savings_interest", value)}
                />
                <MoneyInput
                  id="dividend-income"
                  label="Dividend income"
                  value={form.dividend_income}
                  onChange={(value) => setNumber("dividend_income", value)}
                />
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Reliefs and allowances
                </CardTitle>
                <CardDescription>
                  Only claim reliefs for which you meet HMRC eligibility rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div>
                    <Label htmlFor="marriage-allowance">
                      Marriage Allowance transfer received
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Applies the configured basic-rate tax reduction.
                    </p>
                  </div>
                  <Switch
                    id="marriage-allowance"
                    checked={form.marriage_allowance_claimed === 1}
                    onCheckedChange={(checked) =>
                      setNumber("marriage_allowance_claimed", checked ? 1 : 0)
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div>
                    <Label htmlFor="blind-allowance">
                      Blind Person's Allowance
                    </Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Adds the configured allowance before tapering.
                    </p>
                  </div>
                  <Switch
                    id="blind-allowance"
                    checked={form.blind_person_allowance_claimed === 1}
                    onCheckedChange={(checked) =>
                      setNumber(
                        "blind_person_allowance_claimed",
                        checked ? 1 : 0,
                      )
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyInput
                    id="pension"
                    label="Gross pension contributions"
                    value={form.pension_contributions}
                    onChange={(value) =>
                      setNumber("pension_contributions", value)
                    }
                    hint="Gross amount including provider tax relief."
                  />
                  <MoneyInput
                    id="gift-aid"
                    label="Gift Aid donations paid"
                    value={form.gift_aid_donations}
                    onChange={(value) => setNumber("gift_aid_donations", value)}
                    hint="Actual net donation; gross-up uses configured relief."
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Home office</CardTitle>
                <CardDescription>
                  Use this only where the cost is not already recorded as a
                  business expense.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Calculation method</Label>
                  <Select
                    value={form.home_office_method}
                    onValueChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        home_office_method:
                          value as TaxCalculatorInput["home_office_method"],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No additional claim</SelectItem>
                      <SelectItem value="flat_rate">
                        HMRC simplified flat rate
                      </SelectItem>
                      <SelectItem value="actual">
                        Actual allowable cost
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {form.home_office_method === "flat_rate" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="home-hours">
                        Hours worked at home per month
                      </Label>
                      <Input
                        id="home-hours"
                        type="number"
                        min="0"
                        step="1"
                        value={form.home_office_hours_per_month || ""}
                        onChange={(event) =>
                          setNumber(
                            "home_office_hours_per_month",
                            Number(event.target.value) || 0,
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        The configured 25–50, 51–100 or 101+ band is selected
                        automatically.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="home-months">Months worked</Label>
                      <Input
                        id="home-months"
                        type="number"
                        min="0"
                        max="12"
                        step="1"
                        value={form.home_office_months}
                        onChange={(event) =>
                          setNumber(
                            "home_office_months",
                            Math.min(
                              12,
                              Math.max(0, Number(event.target.value) || 0),
                            ),
                          )
                        }
                      />
                    </div>
                  </div>
                )}
                {form.home_office_method === "actual" && (
                  <MoneyInput
                    id="home-actual"
                    label="Actual allowable home-office cost"
                    value={form.home_office_actual_cost}
                    onChange={(value) =>
                      setNumber("home_office_actual_cost", value)
                    }
                  />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Tax paid and prior year
                </CardTitle>
                <CardDescription>
                  Used for the amount due and payment-on-account test.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <MoneyInput
                  id="other-tax"
                  label="Other current-year tax deducted"
                  value={form.other_tax_deducted}
                  onChange={(value) => setNumber("other_tax_deducted", value)}
                  hint="Exclude CIS deductions recorded in the CIS ledger."
                />
                <MoneyInput
                  id="prior-bill"
                  label="Prior-year qualifying tax bill"
                  value={form.prior_year_tax_bill}
                  onChange={(value) => setNumber("prior_year_tax_bill", value)}
                  hint="Income Tax plus Class 4 NI used for POA."
                />
                <MoneyInput
                  id="prior-deducted"
                  label="Prior-year tax deducted at source"
                  value={form.prior_year_tax_deducted}
                  onChange={(value) =>
                    setNumber("prior_year_tax_deducted", value)
                  }
                  hint="Used for HMRC's 80% source-deduction test."
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="allowances">
          <CapitalAllowancesPanel data={advancedTax} />
        </TabsContent>

        <TabsContent value="cis">
          <CisPanel
            data={advancedTax}
            config={dashboard.config}
            cisStatus={dashboard.profile.cis_status}
          />
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Income and deductions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownRow
                  label="Business profit from records"
                  value={estimate.businessProfit}
                />
                <BreakdownRow
                  label="Home-office deduction"
                  value={-estimate.homeOfficeDeduction}
                  muted
                />
                <BreakdownRow
                  label="Capital allowances"
                  value={-estimate.capitalAllowances}
                  muted
                />
                <BreakdownRow
                  label="Balancing charges"
                  value={estimate.balancingCharges}
                />
                <BreakdownRow
                  label="Adjusted business profit"
                  value={estimate.adjustedBusinessProfit}
                  strong
                />
                <BreakdownRow
                  label="Employment income"
                  value={form.employment_income}
                />
                <BreakdownRow
                  label="Rental profit"
                  value={form.rental_income}
                />
                <BreakdownRow
                  label="Savings interest"
                  value={form.savings_interest}
                />
                <BreakdownRow label="Dividends" value={form.dividend_income} />
                <BreakdownRow
                  label="Total income"
                  value={estimate.totalIncome}
                  strong
                />
                <BreakdownRow
                  label="Adjusted net income"
                  value={estimate.adjustedNetIncome}
                />
              </CardContent>
            </Card>
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Personal allowances</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownRow
                  label="Standard Personal Allowance"
                  value={dashboard.config.personal_allowance}
                />
                <BreakdownRow
                  label="Blind Person's Allowance"
                  value={estimate.blindPersonsAllowance}
                />
                <BreakdownRow
                  label="Allowance taper reduction"
                  value={-estimate.personalAllowanceTaper}
                  muted
                />
                <BreakdownRow
                  label="Adjusted Personal Allowance"
                  value={estimate.adjustedPersonalAllowance}
                  strong
                />
                <BreakdownRow
                  label="Pension and Gift Aid band extension"
                  value={estimate.basicRateExtension}
                />
                <BreakdownRow
                  label="Personal savings allowance"
                  value={estimate.savingsAllowance}
                />
                <BreakdownRow
                  label="Dividend allowance"
                  value={estimate.dividendAllowance}
                />
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                Income Tax calculation
              </CardTitle>
              <CardDescription>
                Income is stacked in HMRC order: non-savings, savings, then
                dividends.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BandRows
                name="Non-savings income"
                bands={estimate.nonSavingsTax}
                config={dashboard.config}
              />
              <BandRows
                name="Savings income"
                bands={estimate.savingsTax}
                config={dashboard.config}
              />
              <BandRows
                name="Dividend income"
                bands={estimate.dividendTax}
                config={dashboard.config}
                dividend
              />
              {estimate.marriageAllowanceReduction > 0 && (
                <BreakdownRow
                  label="Marriage Allowance tax reduction"
                  value={-estimate.marriageAllowanceReduction}
                />
              )}
              <BreakdownRow
                label="Income Tax"
                value={estimate.incomeTax}
                strong
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  National Insurance and student loan
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownRow
                  label="Class 2 National Insurance"
                  value={estimate.class2Ni}
                />
                <BreakdownRow
                  label="Class 4 National Insurance"
                  value={estimate.class4Ni}
                />
                <BreakdownRow
                  label={`Student loan (${dashboard.profile.student_loan_plan.replace("_", " ")})`}
                  value={estimate.studentLoan}
                />
                <BreakdownRow
                  label="Total liability"
                  value={estimate.totalLiability}
                  strong
                />
              </CardContent>
            </Card>
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Final position</CardTitle>
              </CardHeader>
              <CardContent>
                <BreakdownRow
                  label="Total liability"
                  value={estimate.totalLiability}
                />
                <BreakdownRow
                  label="CIS deductions received"
                  value={-advancedTax.cisReceived}
                />
                <BreakdownRow
                  label="All tax deducted or paid"
                  value={-estimate.taxDeducted}
                />
                <BreakdownRow
                  label="Estimated amount due"
                  value={estimate.amountDue}
                  strong
                />
                <BreakdownRow
                  label="Average monthly set aside"
                  value={estimate.monthlySetAside}
                  strong
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Alert
            variant={estimate.paymentOnAccount.required ? "warning" : "success"}
          >
            <AlertTitle>
              {estimate.paymentOnAccount.required
                ? "Payments on account are likely required"
                : "Payments on account are not currently triggered"}
            </AlertTitle>
            <AlertDescription>
              {estimate.paymentOnAccount.required
                ? `The prior-year bill exceeds ${money.format(dashboard.config.poa_threshold)} and less than ${dashboard.config.poa_source_deducted_percent}% was deducted at source.`
                : "Based on the prior-year figures entered and the selected year's configured HMRC thresholds."}
            </AlertDescription>
          </Alert>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  First payment on account
                </CardTitle>
                <CardDescription>
                  {formatDeadline(estimate.paymentOnAccount.firstDeadline)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {money.format(estimate.paymentOnAccount.firstPayment)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {dashboard.config.poa_rate_percent}% of the qualifying
                  prior-year bill
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">
                  Second payment on account
                </CardTitle>
                <CardDescription>
                  {formatDeadline(estimate.paymentOnAccount.secondDeadline)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {money.format(estimate.paymentOnAccount.secondPayment)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {dashboard.config.poa_rate_percent}% of the qualifying
                  prior-year bill
                </p>
              </CardContent>
            </Card>
            <Card className="rounded-lg shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Remaining balance</CardTitle>
                <CardDescription>
                  {formatDeadline(estimate.paymentOnAccount.balancingDeadline)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {money.format(estimate.paymentOnAccount.balancingPayment)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Current estimated amount due less both advance payments
                </p>
              </CardContent>
            </Card>
          </div>
          <Card className="rounded-lg shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">
                Monthly reserve recommendation
              </CardTitle>
              <CardDescription>
                Average the current estimated amount due across the tax year.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="rounded-md bg-primary/10 p-3">
                <PiggyBank className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-3xl font-semibold">
                  {money.format(estimate.monthlySetAside)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  per month, before any future change in income or reliefs
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Alert variant="info">
        <AlertTitle>Estimate only</AlertTitle>
        <AlertDescription>
          This planning estimate uses the figures entered, live SoleTrader
          records, and the selected tax year's configured rates. Eligibility and
          tax treatment can depend on circumstances not captured here. Confirm
          your return and payment dates with HMRC or a qualified accountant.
        </AlertDescription>
      </Alert>
    </div>
  );
}

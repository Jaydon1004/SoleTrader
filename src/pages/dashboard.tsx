import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BadgePoundSterling,
  CalendarDays,
  CircleCheckBig,
  FilePlus2,
  History,
  Landmark,
  PiggyBank,
  Plus,
  Receipt,
  Save,
  TrendingUp,
  Upload,
  WalletCards,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useVatOverview } from "@/lib/queries/vat";
import { useReminderCentre } from "@/lib/queries/reminders";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import { useAuditLog } from "@/lib/queries/power-features";
import { useSetAppSetting, useTaxYearConfigs } from "@/lib/queries/settings";
import { useAppStore } from "@/stores/app-store";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const compactMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  notation: "compact",
});
const chartColours = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#65a30d",
  "#db2777",
];

function EstimateNote() {
  return (
    <p className="mt-2 text-[11px] text-muted-foreground">
      Estimate only. Confirm with HMRC or an accountant.
    </p>
  );
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "text-foreground",
  estimate = false,
  href,
}: {
  title: string;
  value: number;
  detail?: string;
  icon: typeof BadgePoundSterling;
  tone?: string;
  estimate?: boolean;
  href?: string;
}) {
  const card = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <span className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${tone}`} />
            {href && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </span>
        </div>
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
          {money.format(value)}
        </p>
        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        )}
        {estimate && <EstimateNote />}
      </CardContent>
    </Card>
  );
  return href ? (
    <Link
      to={href}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {card}
    </Link>
  ) : (
    card
  );
}

function AttentionItem({
  to,
  title,
  detail,
  icon: Icon,
  urgent = false,
}: {
  to: string;
  title: string;
  detail: string;
  icon: typeof AlertTriangle;
  urgent?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-md border p-3 transition-colors hover:border-primary/40 hover:bg-accent/50"
    >
      <span
        className={`mt-0.5 rounded p-1.5 ${urgent ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"}`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <ArrowRight className="mt-2 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function ChartEmpty() {
  return (
    <div className="flex h-65 items-center justify-center text-sm text-muted-foreground">
      No activity recorded for this tax year.
    </div>
  );
}

export function DashboardPage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const { data: taxYears } = useTaxYearConfigs();
  const { data, isLoading, error } = useDashboardData(currentTaxYear);
  const vatQuery = useVatOverview(currentTaxYear);
  const {
    data: reminderData,
    isLoading: reminderLoading,
    error: reminderError,
  } = useReminderCentre(currentTaxYear);
  const advancedTax = useAdvancedTaxData(currentTaxYear);
  const { data: recentActivity } = useAuditLog("all", "all", 5);
  const saveSetting = useSetAppSetting();
  const [taxPot, setTaxPot] = useState("0");

  useEffect(() => {
    if (data) setTaxPot(String(data.taxPot));
  }, [data]);

  const saveTaxPot = () => {
    const amount = Math.max(0, Number(taxPot) || 0);
    setTaxPot(String(amount));
    saveSetting.mutate({
      key: `tax_pot_${currentTaxYear}`,
      value: String(amount),
    });
  };

  if (
    isLoading ||
    vatQuery.isLoading ||
    reminderLoading ||
    advancedTax.isLoading
  )
    return <LoadingSpinner />;
  if (
    error ||
    !data ||
    vatQuery.error ||
    !vatQuery.data ||
    reminderError ||
    !reminderData ||
    advancedTax.error ||
    !advancedTax.data
  ) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Dashboard unavailable</AlertTitle>
        <AlertDescription>
          {error?.message ??
            vatQuery.error?.message ??
            reminderError?.message ??
            "No dashboard data was found."}
        </AlertDescription>
      </Alert>
    );
  }

  const potAmount = Math.max(0, Number(taxPot) || 0);
  const taxEstimate = reminderData.estimate;
  const taxStillNeeded = taxEstimate.amountDue;
  const reserveGap = Math.max(0, taxStillNeeded - potAmount);
  const potProgress =
    taxStillNeeded > 0
      ? Math.min(100, (potAmount / taxStillNeeded) * 100)
      : 100;
  const hasMonthlyData = data.months.some(
    (month) => month.income || month.expenses,
  );
  const isVatRegistered = data.profile.vat_status !== "unregistered";
  const vatTotals = vatQuery.data.returns.reduce(
    (totals, vatReturn) => ({
      output: totals.output + vatReturn.box3,
      input: totals.input + vatReturn.box4,
      position: totals.position + vatReturn.box5,
    }),
    { output: 0, input: 0, position: 0 },
  );
  const urgentDeadlines = reminderData.alerts.filter(
    (item) => item.severity === "critical" && item.kind !== "invoice",
  );
  const today = new Date().toISOString().slice(0, 10);
  const upcomingTaxDeadlines = [
    {
      label: "Register for Self Assessment",
      date: reminderData.deadlines.registration,
      amount: 0,
    },
    {
      label: "Paper Self Assessment return",
      date: reminderData.deadlines.paper,
      amount: 0,
    },
    {
      label: "Online return and balancing payment",
      date: reminderData.deadlines.online,
      amount:
        taxEstimate.paymentOnAccount.balancingPayment +
        taxEstimate.paymentOnAccount.firstPayment,
    },
    {
      label: "Second payment on account",
      date: reminderData.deadlines.poaSecond,
      amount: taxEstimate.paymentOnAccount.secondPayment,
    },
  ]
    .filter((deadline) => deadline.date >= today)
    .sort((left, right) => left.date.localeCompare(right.date));
  const nextTaxDeadline = upcomingTaxDeadlines[0];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Business overview
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {data.profile.trading_name ||
              `${data.profile.first_name}'s business`}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Live{" "}
            {data.accountingBasis === "cash"
              ? "receipts basis (cash basis)"
              : "accrual basis"}{" "}
            position
          </p>
        </div>
        <Select value={currentTaxYear} onValueChange={setCurrentTaxYear}>
          <SelectTrigger className="w-42.5" aria-label="Tax year">
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
        <MetricCard
          title="Money in"
          value={data.income}
          detail={
            data.accountingBasis === "cash"
              ? "Gross income for payments received, including bank transfers"
              : "Gross issued invoices"
          }
          icon={BadgePoundSterling}
          tone="text-emerald-700 dark:text-emerald-400"
          href="/invoices"
        />
        <MetricCard
          title="Money out"
          value={data.expenses}
          detail="Allowable business costs; CIS is not an expense"
          icon={Receipt}
          href="/expenses"
        />
        <MetricCard
          title="Profit"
          value={data.profit}
          detail="Gross income less allowable expenses; before CIS tax credit"
          icon={TrendingUp}
          tone={
            data.profit >= 0
              ? "text-blue-700 dark:text-blue-400"
              : "text-destructive"
          }
          href="/reports"
        />
        <MetricCard
          title="Tax to reserve"
          value={taxStillNeeded}
          detail={`${money.format(potAmount)} currently set aside`}
          icon={PiggyBank}
          tone="text-amber-700 dark:text-amber-400"
          estimate
          href="/tax"
        />
      </section>

      <p className="text-xs text-muted-foreground">
        CIS payments are included at their gross amount in income and profit.
        CIS withheld is tax already paid, not money out or a business expense.
      </p>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Paid CIS</CardTitle>
            <CardDescription>
              CIS tax deducted by contractors from your recorded payments.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">CIS deducted</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700 dark:text-amber-400">
                {money.format(advancedTax.data.cisReceived)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Paid into bank / received
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {money.format(data.cashReceived)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tax liability</p>
              <p className="mt-1 text-2xl font-semibold">
                {money.format(taxEstimate.totalLiability)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Still to reserve</p>
              <p className="mt-1 text-2xl font-semibold">
                {money.format(taxStillNeeded)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CIS treatment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>Gross CIS income increases turnover and profit.</p>
            <p>CIS deducted reduces estimated tax due. It is not an expense.</p>
            <Button asChild size="sm" variant="outline" className="w-full">
              <Link to="/income">Review CIS income</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Estimated available cash
            </CardTitle>
            <CardDescription>
              A practical cash view after money received, paid business costs,
              and the current tax reserve.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Money received</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
                {money.format(data.cashReceived)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Includes post-CIS receipts
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Expenses paid</p>
              <p className="mt-1 text-2xl font-semibold">
                {money.format(data.cashExpenses)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Actual recorded business payments
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Available after reserve
              </p>
              <p
                className={`mt-1 text-2xl font-semibold ${data.cashReceived - data.cashExpenses - taxStillNeeded >= 0 ? "text-blue-700 dark:text-blue-400" : "text-destructive"}`}
              >
                {money.format(
                  data.cashReceived - data.cashExpenses - taxStillNeeded,
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Money received less expenses and estimated tax reserve
              </p>
            </div>
          </CardContent>
          <CardContent className="border-t pt-3 text-xs text-muted-foreground">
            This is an estimate, not your bank balance. It does not include
            personal spending, loans, transfers, unimported accounts, or future
            bills.
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link to="/income?new=income">
            <Plus className="mr-2 h-4 w-4" />
            Record direct income
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/bank?status=unmatched">
            <WalletCards className="mr-2 h-4 w-4" />
            Review bank activity
          </Link>
        </Button>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Needs your attention</CardTitle>
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">
                {data.overdueCount +
                  data.unmatchedBankCount +
                  data.missingReceiptCount +
                  urgentDeadlines.length}
              </span>
            </div>
            <CardDescription>
              Work through the items affecting your books.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueCount > 0 && (
              <AttentionItem
                to="/invoices?status=overdue"
                title={`${data.overdueCount} overdue invoice${data.overdueCount === 1 ? "" : "s"}`}
                detail={`${money.format(data.overdueValue)} needs collecting`}
                icon={AlertTriangle}
                urgent
              />
            )}
            {data.unmatchedBankCount > 0 && (
              <AttentionItem
                to="/bank?status=unmatched"
                title={`${data.unmatchedBankCount} unmatched transaction${data.unmatchedBankCount === 1 ? "" : "s"}`}
                detail="Review and reconcile bank activity"
                icon={WalletCards}
              />
            )}
            {data.missingReceiptCount > 0 && (
              <AttentionItem
                to="/expenses?view=needs-receipt"
                title={`${data.missingReceiptCount} missing receipt${data.missingReceiptCount === 1 ? "" : "s"}`}
                detail="Attach evidence to recorded expenses"
                icon={Receipt}
              />
            )}
            {urgentDeadlines.length > 0 && (
              <AttentionItem
                to="/reminders"
                title={`${urgentDeadlines.length} urgent deadline${urgentDeadlines.length === 1 ? "" : "s"}`}
                detail={urgentDeadlines[0].title}
                icon={CalendarDays}
                urgent
              />
            )}
            {data.overdueCount +
              data.unmatchedBankCount +
              data.missingReceiptCount +
              urgentDeadlines.length ===
              0 && (
              <div className="py-8 text-center">
                <CircleCheckBig className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 text-sm font-semibold">
                  Books are up to date
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No overdue, unmatched, missing-receipt, or deadline items.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cash flow</CardTitle>
            <CardDescription>
              {data.accountingBasis === "cash"
                ? "Payments received"
                : "Invoices issued"}{" "}
              against allowable costs
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasMonthlyData ? (
              <ChartEmpty />
            ) : (
              <>
                <div className="sr-only">
                  <h3>Cash flow data</h3>
                  <ul>
                    {data.months.map((month) => (
                      <li key={month.label}>
                        {month.label}: money in {money.format(month.income)},
                        money out {money.format(month.expenses)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="h-70" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.months}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis
                        tickFormatter={(value) => compactMoney.format(value)}
                        fontSize={11}
                        width={65}
                      />
                      <Tooltip
                        formatter={(value) => money.format(Number(value))}
                      />
                      <Legend />
                      <Bar
                        dataKey="income"
                        name="Money in"
                        fill="var(--color-chart-1)"
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="expenses"
                        name="Money out"
                        fill="var(--color-chart-3)"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap items-center gap-2 border-y py-3">
        <span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">
          Quick actions
        </span>
        <Button asChild size="sm">
          <Link to="/invoices?new=invoice">
            <FilePlus2 />
            New invoice
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/expenses?new=expense">
            <Plus />
            Add expense
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/bank">
            <Upload />
            Import statement
          </Link>
        </Button>
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Recent activity</CardTitle>
            <CardDescription>
              The latest changes across your records.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/activity">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {(recentActivity ?? []).length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <History className="mx-auto mb-2 h-6 w-6" />
              Activity appears here as records change.
            </div>
          ) : (
            <div className="divide-y">
              {recentActivity?.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded bg-muted">
                    <History className="h-4 w-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium capitalize">
                      {entry.entity_type.replace("_", " ")} {entry.action}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Record #{entry.entity_id}
                    </span>
                  </span>
                  <time className="shrink-0 text-xs text-muted-foreground">
                    {new Date(`${entry.created_at}Z`).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short" },
                    )}
                  </time>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Tax confidence</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              A live forecast from your books and saved tax-calculator inputs.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            Based on {currentTaxYear} configured rates
          </span>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <MetricCard
            title="Set aside now"
            value={reserveGap}
            detail={`${money.format(potAmount)} reserved toward ${money.format(taxStillNeeded)} due`}
            icon={PiggyBank}
            tone="text-amber-700 dark:text-amber-400"
            estimate
            href="/tax"
          />
          <MetricCard
            title="Forecasted liability"
            value={taxEstimate.totalLiability}
            detail={`${money.format(taxEstimate.taxDeducted)} already paid or deducted`}
            icon={Landmark}
            tone="text-blue-700 dark:text-blue-400"
            estimate
            href="/tax"
          />
          <MetricCard
            title="Monthly reserve guide"
            value={taxEstimate.monthlySetAside}
            detail={
              nextTaxDeadline
                ? `Next: ${nextTaxDeadline.label} on ${new Date(`${nextTaxDeadline.date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                : "No future deadline in this tax-year schedule"
            }
            icon={CalendarDays}
            estimate
            href="/tax"
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                How this was calculated
              </CardTitle>
              <CardDescription>
                Each step uses your selected tax year’s saved rates and records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 text-sm">
                <li className="flex justify-between gap-4 border-b pb-3">
                  <span>
                    Business income of {money.format(data.income)} less
                    allowable costs of {money.format(data.expenses)} gives
                    recorded profit.
                  </span>
                  <strong className="shrink-0 tabular-nums">
                    {money.format(taxEstimate.businessProfit)}
                  </strong>
                </li>
                <li className="flex justify-between gap-4 border-b pb-3">
                  <span>
                    Home-office costs and capital allowances are deducted, then
                    balancing charges are added.
                  </span>
                  <strong className="shrink-0 tabular-nums">
                    {money.format(taxEstimate.adjustedBusinessProfit)}
                  </strong>
                </li>
                <li className="flex justify-between gap-4 border-b pb-3">
                  <span>
                    Other saved income is included and your adjusted Personal
                    Allowance is applied before the configured tax bands.
                  </span>
                  <strong className="shrink-0 tabular-nums">
                    {money.format(taxEstimate.incomeTax)} tax
                  </strong>
                </li>
                <li className="flex justify-between gap-4 border-b pb-3">
                  <span>
                    Class 2 and Class 4 NI add{" "}
                    {money.format(taxEstimate.class2Ni + taxEstimate.class4Ni)}
                    {taxEstimate.studentLoan > 0
                      ? `, and student-loan repayment adds ${money.format(taxEstimate.studentLoan)}`
                      : ""}
                    .
                  </span>
                  <strong className="shrink-0 tabular-nums">
                    {money.format(taxEstimate.totalLiability)}
                  </strong>
                </li>
                <li className="flex justify-between gap-4">
                  <span>
                    PAYE, CIS and other recorded tax of{" "}
                    {money.format(taxEstimate.taxDeducted)}
                    is deducted from the liability.
                  </span>
                  <strong className="shrink-0 tabular-nums">
                    {money.format(taxEstimate.amountDue)} due
                  </strong>
                </li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upcoming deadlines</CardTitle>
              <CardDescription>
                Dates from the configured HMRC schedule.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingTaxDeadlines.length > 0 ? (
                <div className="divide-y">
                  {upcomingTaxDeadlines.slice(0, 4).map((deadline) => (
                    <div
                      key={`${deadline.label}-${deadline.date}`}
                      className="py-3 first:pt-0 last:pb-0"
                    >
                      <p className="text-sm font-medium">{deadline.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(
                          `${deadline.date}T00:00:00`,
                        ).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        {deadline.amount > 0
                          ? ` · about ${money.format(deadline.amount)}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No future deadlines remain in this tax-year schedule.
                </p>
              )}
              <Button
                asChild
                variant="outline"
                size="sm"
                className="mt-4 w-full"
              >
                <Link to="/tax">Review full tax calculation</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-lg shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tax pot</CardTitle>
            <CardDescription>
              Track money reserved against the remaining estimated bill.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label
                  htmlFor="tax-pot"
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                >
                  Amount set aside
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    £
                  </span>
                  <Input
                    id="tax-pot"
                    type="number"
                    min="0"
                    step="0.01"
                    value={taxPot}
                    onChange={(event) => setTaxPot(event.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              <Button onClick={saveTaxPot} disabled={saveSetting.isPending}>
                <Save className="mr-2 h-4 w-4" />
                {saveSetting.isPending ? "Saving" : "Save"}
              </Button>
            </div>
            <div className="mt-5">
              <div className="mb-2 flex justify-between text-xs">
                <span>{money.format(potAmount)} reserved</span>
                <span>{money.format(taxStillNeeded)} needed</span>
              </div>
              <Progress value={potProgress} />
              <p className="mt-2 text-xs text-muted-foreground">
                {potProgress.toFixed(0)}% funded ·{" "}
                {money.format(Math.max(0, taxStillNeeded - potAmount))}{" "}
                remaining
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Tax may show £0 until profit exceeds the configured Personal
                Allowance of {money.format(data.config.personal_allowance)}.
                National Insurance can apply separately.
              </p>
            </div>
            <div className="mt-5 rounded-md border bg-muted/25 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">Live tax calculator</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guide based on your recorded {currentTaxYear} figures.
                  </p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link to="/tax">Open Self Assessment</Link>
                </Button>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Income</dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(data.income)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Allowable expenses</dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(data.expenses)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Recorded profit</dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(data.profit)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Estimated liability</dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(taxEstimate.totalLiability)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    Tax already deducted
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(taxEstimate.taxDeducted)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">CIS deducted</dt>
                  <dd className="font-medium tabular-nums">
                    {money.format(advancedTax.data.cisReceived)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2 font-semibold sm:border-t-0 sm:pt-0">
                  <dt>Estimated amount to reserve</dt>
                  <dd className="tabular-nums">
                    {money.format(taxStillNeeded)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Estimate only. Check the full Self Assessment calculation and
                confirm figures with HMRC or an accountant.
              </p>
            </div>
            <EstimateNote />
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Tax year progress
            </CardTitle>
            <CardDescription>
              {data.config.year_start} to {data.config.year_end}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {data.progressPercent.toFixed(0)}%
            </p>
            <Progress value={data.progressPercent} className="mt-4" />
            <p className="mt-3 text-xs text-muted-foreground">
              {data.daysRemaining > 0
                ? `${data.daysRemaining} days remaining`
                : "Tax year complete"}
            </p>
          </CardContent>
        </Card>
      </section>

      {isVatRegistered && (
        <section className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            title="Output VAT"
            value={vatTotals.output}
            detail="VAT return Boxes 1 and 2"
            icon={BadgePoundSterling}
          />
          <MetricCard
            title="Recoverable input VAT"
            value={vatTotals.input}
            detail="VAT return Box 4"
            icon={Receipt}
          />
          <MetricCard
            title={vatTotals.position >= 0 ? "VAT payable" : "VAT reclaimable"}
            value={Math.abs(vatTotals.position)}
            detail="Combined VAT return position"
            icon={Landmark}
            tone={
              vatTotals.position >= 0 ? "text-amber-700" : "text-emerald-700"
            }
          />
        </section>
      )}

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Expense breakdown</CardTitle>
            <CardDescription>Allowable costs by category</CardDescription>
          </CardHeader>
          <CardContent>
            {data.expenseCategories.length === 0 ? (
              <ChartEmpty />
            ) : (
              <>
                <div className="sr-only">
                  <h3>Expense breakdown data</h3>
                  <ul>
                    {data.expenseCategories.map((entry) => (
                      <li key={entry.name}>
                        {entry.name}: {money.format(entry.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="h-70" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.expenseCategories}
                        dataKey="amount"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {data.expenseCategories.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={chartColours[index % chartColours.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => money.format(Number(value))}
                      />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Cumulative profit trend</CardTitle>
            <CardDescription>
              Running net position through the tax year
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasMonthlyData ? (
              <ChartEmpty />
            ) : (
              <>
                <div className="sr-only">
                  <h3>Cumulative profit trend data</h3>
                  <ul>
                    {data.months.map((month) => (
                      <li key={month.label}>
                        {month.label}: {money.format(month.cumulativeProfit)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="h-70" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.months}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis
                        tickFormatter={(value) => compactMoney.format(value)}
                        fontSize={11}
                        width={65}
                      />
                      <Tooltip
                        formatter={(value) => money.format(Number(value))}
                      />
                      <Line
                        type="monotone"
                        dataKey="cumulativeProfit"
                        name="Cumulative profit"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Income by client</CardTitle>
            <CardDescription>Top clients by recognised income</CardDescription>
          </CardHeader>
          <CardContent>
            {data.incomeByClient.length === 0 ? (
              <ChartEmpty />
            ) : (
              <>
                <div className="sr-only">
                  <h3>Income by client data</h3>
                  <ul>
                    {data.incomeByClient.map((entry) => (
                      <li key={entry.name}>
                        {entry.name}: {money.format(entry.amount)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="h-70" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={data.incomeByClient}
                      layout="vertical"
                      margin={{ left: 12 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        tickFormatter={(value) => compactMoney.format(value)}
                        fontSize={11}
                      />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={105}
                        fontSize={11}
                      />
                      <Tooltip
                        formatter={(value) => money.format(Number(value))}
                      />
                      <Bar
                        dataKey="amount"
                        name="Income"
                        fill="#0f766e"
                        radius={[0, 3, 3, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-lg shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Year-on-year comparison</CardTitle>
          <CardDescription>
            Current and previous configured tax years
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-155 text-sm">
            <caption className="sr-only">
              Year-on-year income, expenses, profit and estimated tax
            </caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-3 font-medium">Tax year</th>
                <th className="pb-3 text-right font-medium">Income</th>
                <th className="pb-3 text-right font-medium">Expenses</th>
                <th className="pb-3 text-right font-medium">Profit</th>
                <th className="pb-3 text-right font-medium">Estimated tax</th>
              </tr>
            </thead>
            <tbody>
              {data.yearComparison.map((year, index) => (
                <tr key={year.taxYear} className="border-b last:border-0">
                  <td className="py-3 font-medium">
                    {year.taxYear}
                    {index === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Selected
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    {money.format(year.income)}
                  </td>
                  <td className="py-3 text-right">
                    {money.format(year.expenses)}
                  </td>
                  <td className="py-3 text-right">
                    {money.format(year.profit)}
                  </td>
                  <td className="py-3 text-right">
                    {money.format(year.tax)}
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      estimate
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.yearComparison.length === 1 && (
            <p className="mt-3 text-xs text-muted-foreground">
              No earlier configured tax year is available for comparison.
            </p>
          )}
          <EstimateNote />
        </CardContent>
      </Card>

      <Alert variant="info">
        <AlertTitle className="flex items-center gap-2">
          <CircleCheckBig className="h-4 w-4" />
          About these estimates
        </AlertTitle>
        <AlertDescription>
          Tax and NI figures use sole-trader profit and the selected year’s
          configured rates. They exclude other income, deductions, student loans
          and payments on account until the full tax calculator is completed.
          Confirm figures with HMRC or a qualified accountant.
        </AlertDescription>
      </Alert>
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  Archive,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  FileSpreadsheet,
  Printer,
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { PageHeader, PageSkeleton, SummaryTile } from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildProfitLossRows,
  type ReportPeriod,
} from "@/lib/report-calculations";
import {
  exportFullBackup,
  saveReportCsv,
  saveReportPdf,
  type ReportDocument,
  type ReportSection,
} from "@/lib/report-export";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useReportLedger } from "@/lib/queries/reports";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useTaxCalculatorInput } from "@/lib/queries/tax-calculator";
import { useVatOverview } from "@/lib/queries/vat";
import {
  useMileageLogs,
  useVehicleCosts,
  useVehicleDeductionSummary,
  useVehicles,
} from "@/lib/queries/vehicles";
import { calculateFullTaxEstimate } from "@/lib/tax-estimate";
import { useAppStore } from "@/stores/app-store";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
const moneyCell = (value: number) => money.format(value);

type ReportKey =
  | "profit-loss"
  | "clients"
  | "expenses"
  | "vehicles"
  | "vat"
  | "tax"
  | "capital"
  | "debtors"
  | "creditors";

const reportNames: Record<ReportKey, string> = {
  "profit-loss": "Profit & Loss",
  clients: "Income by client",
  expenses: "Expense categories",
  vehicles: "Mileage & vehicle costs",
  vat: "VAT return",
  tax: "Tax year summary",
  capital: "Capital allowances",
  debtors: "Aged debtors",
  creditors: "Aged creditors",
};

function section(
  title: string,
  columns: string[],
  rows: (string | number)[][],
  totalRow?: (string | number)[],
): ReportSection {
  return { title, columns, rows, totalRow };
}

function ReportTable({ data }: { data: ReportSection }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full min-w-160 text-sm">
        <caption className="sr-only">{data.title}</caption>
        <thead>
          <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
            {data.columns.map((column, index) => (
              <th
                className={`px-3 py-2 font-medium ${index > 0 ? "text-right" : ""}`}
                key={column}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIndex) => (
            <tr className="border-b last:border-0" key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  className={`px-3 py-2.5 ${cellIndex > 0 ? "text-right tabular-nums" : "font-medium"}`}
                  key={cellIndex}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {data.totalRow && (
          <tfoot>
            <tr className="border-t-2 bg-muted/40 font-semibold">
              {data.totalRow.map((cell, index) => (
                <td
                  className={`px-3 py-2.5 ${index > 0 ? "text-right tabular-nums" : ""}`}
                  key={index}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {data.rows.length === 0 && (
        <p className="py-9 text-center text-sm text-muted-foreground">
          No records for this tax year.
        </p>
      )}
    </div>
  );
}

export function ReportsPage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedReport = searchParams.get("report");
  const [reportKey, setReportKey] = useState<ReportKey>(
    requestedReport && requestedReport in reportNames
      ? (requestedReport as ReportKey)
      : "profit-loss",
  );
  const [period, setPeriod] = useState<ReportPeriod>("monthly");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const { toast } = useFeedback();
  const { data: taxYears } = useTaxYearConfigs();
  const dashboardQuery = useDashboardData(currentTaxYear);
  const advancedQuery = useAdvancedTaxData(currentTaxYear);
  const inputQuery = useTaxCalculatorInput(currentTaxYear);
  const vatQuery = useVatOverview(currentTaxYear);
  const mileageQuery = useMileageLogs("all", currentTaxYear);
  const costsQuery = useVehicleCosts("all", currentTaxYear);
  const vehiclesQuery = useVehicles(currentTaxYear, true);
  const vehicleSummaryQuery = useVehicleDeductionSummary(currentTaxYear);
  const ledgerQuery = useReportLedger(
    currentTaxYear,
    dashboardQuery.data?.profile,
    dashboardQuery.data?.config,
  );

  const loading = [
    dashboardQuery,
    advancedQuery,
    inputQuery,
    vatQuery,
    mileageQuery,
    costsQuery,
    vehiclesQuery,
    vehicleSummaryQuery,
    ledgerQuery,
  ].some((item) => item.isLoading);
  const error = [
    dashboardQuery,
    advancedQuery,
    inputQuery,
    vatQuery,
    mileageQuery,
    costsQuery,
    vehiclesQuery,
    vehicleSummaryQuery,
    ledgerQuery,
  ].find((item) => item.error)?.error;
  const documents = useMemo(() => {
    const dashboard = dashboardQuery.data;
    const advanced = advancedQuery.data;
    const input = inputQuery.data;
    const vat = vatQuery.data;
    const mileage = mileageQuery.data;
    const costs = costsQuery.data;
    const vehicles = vehiclesQuery.data;
    const vehicleSummary = vehicleSummaryQuery.data;
    const ledger = ledgerQuery.data;
    if (
      !dashboard ||
      !advanced ||
      !input ||
      !vat ||
      !mileage ||
      !costs ||
      !vehicles ||
      !vehicleSummary ||
      !ledger
    )
      return null;

    const subtitle = `${currentTaxYear} · ${dashboard.profile.trading_name || `${dashboard.profile.first_name} ${dashboard.profile.last_name}`.trim()} · ${dashboard.accountingBasis} basis`;
    const estimate = calculateFullTaxEstimate(
      dashboard.profit,
      input,
      dashboard.config,
      dashboard.profile,
      dashboard.taxPaid,
      {
        capitalAllowances: advanced.schedule.totalAllowance,
        balancingCharges: advanced.schedule.balancingCharge,
        cisDeductionsReceived: advanced.cisReceived,
      },
    );
    const profitLoss = (selectedPeriod: ReportPeriod): ReportDocument => {
      const rows = buildProfitLossRows(dashboard.months, selectedPeriod);
      return {
        title: `Profit & Loss - ${selectedPeriod[0].toUpperCase()}${selectedPeriod.slice(1)}`,
        subtitle,
        sections: [
          section(
            "Profit and loss",
            ["Period", "Income", "Allowable expenses", "Net profit"],
            rows.map((row) => [
              row.label,
              moneyCell(row.income),
              moneyCell(row.expenses),
              moneyCell(row.profit),
            ]),
            [
              "Tax year total",
              moneyCell(dashboard.income),
              moneyCell(dashboard.expenses),
              moneyCell(dashboard.profit),
            ],
          ),
        ],
      };
    };
    const clientReport: ReportDocument = {
      title: "Income by client",
      subtitle,
      sections: [
        section(
          "Recognised income",
          ["Client", "Income", "% of total"],
          ledger.incomeByClient.map((row) => [
            row.name,
            moneyCell(row.amount),
            dashboard.income
              ? `${((row.amount / dashboard.income) * 100).toFixed(1)}%`
              : "0.0%",
          ]),
          ["Total recognised income", moneyCell(dashboard.income), "100.0%"],
        ),
      ],
    };
    const expenseReport: ReportDocument = {
      title: "Expense breakdown by category",
      subtitle,
      sections: [
        section(
          "Allowable expenses",
          ["Category", "Amount", "% of expenses"],
          dashboard.expenseCategories.map((row) => [
            row.name,
            moneyCell(row.amount),
            dashboard.expenses
              ? `${((row.amount / dashboard.expenses) * 100).toFixed(1)}%`
              : "0.0%",
          ]),
          ["Total allowable expenses", moneyCell(dashboard.expenses), "100.0%"],
        ),
      ],
    };
    const vehicleReport: ReportDocument = {
      title: "Mileage and vehicle costs",
      subtitle,
      sections: [
        section(
          "HMRC deduction summary",
          [
            "Business miles",
            "Mileage allowance",
            "Actual costs paid",
            "Allowable actual costs",
            "Total deduction",
          ],
          [
            [
              number.format(vehicleSummary.miles),
              moneyCell(vehicleSummary.mileageAllowance),
              moneyCell(vehicleSummary.actualCostsPaid),
              moneyCell(vehicleSummary.actualCostsAllowable),
              moneyCell(vehicleSummary.totalDeduction),
            ],
          ],
        ),
        section(
          "Vehicles",
          ["Vehicle", "Registration", "Method", "Business use", "Deduction"],
          vehicles.map((row) => [
            row.name,
            row.registration,
            row.cost_method === "mileage" ? "Mileage rates" : "Actual costs",
            `${row.business_percent}%`,
            moneyCell(row.total_deduction),
          ]),
        ),
        section(
          "Mileage log",
          [
            "Date",
            "Vehicle",
            "Journey",
            "Purpose",
            "Miles",
            "Passengers",
            "Rate",
            "Allowance",
          ],
          mileage.map((row) => [
            row.date,
            row.vehicle_name,
            `${row.start_location} to ${row.end_location}`,
            row.purpose,
            number.format(row.distance_miles),
            row.passengers,
            moneyCell(row.rate_applied),
            moneyCell(row.amount),
          ]),
        ),
        section(
          "Actual vehicle costs",
          [
            "Date",
            "Vehicle",
            "Type",
            "Description",
            "Paid",
            "Business use",
            "Allowable",
          ],
          costs.map((row) => [
            row.date,
            row.vehicle_name,
            row.cost_type.replace("_", " "),
            row.description,
            moneyCell(row.amount),
            `${row.business_percent}%`,
            moneyCell(row.allowable_amount),
          ]),
        ),
      ],
    };
    const vatReport: ReportDocument = {
      title: "VAT return report",
      subtitle,
      sections: [
        section(
          "VAT returns",
          [
            "Period",
            "Box 1",
            "Box 2",
            "Box 3",
            "Box 4",
            "Box 5",
            "Box 6",
            "Box 7",
            "Box 8",
            "Box 9",
          ],
          vat.returns.map((row) => [
            row.label,
            ...[
              row.box1,
              row.box2,
              row.box3,
              row.box4,
              row.box5,
              row.box6,
              row.box7,
              row.box8,
              row.box9,
            ].map(moneyCell),
          ]),
        ),
      ],
    };
    const taxReport: ReportDocument = {
      title: "Self Assessment tax year summary",
      subtitle,
      sections: [
        section(
          "Business",
          ["Figure", "Amount"],
          [
            [
              "Business profit from records",
              moneyCell(estimate.businessProfit),
            ],
            ["Home-office deduction", moneyCell(estimate.homeOfficeDeduction)],
            ["Capital allowances", moneyCell(estimate.capitalAllowances)],
            ["Balancing charges", moneyCell(estimate.balancingCharges)],
            [
              "Adjusted business profit",
              moneyCell(estimate.adjustedBusinessProfit),
            ],
          ],
        ),
        section(
          "Other income",
          ["Figure", "Amount"],
          [
            ["Employment income", moneyCell(input.employment_income)],
            ["Rental profit", moneyCell(input.rental_income)],
            ["Savings interest", moneyCell(input.savings_interest)],
            ["Dividend income", moneyCell(input.dividend_income)],
            ["Total income", moneyCell(estimate.totalIncome)],
          ],
        ),
        section(
          "Liability",
          ["Figure", "Amount"],
          [
            ["Income Tax", moneyCell(estimate.incomeTax)],
            ["Class 2 National Insurance", moneyCell(estimate.class2Ni)],
            ["Class 4 National Insurance", moneyCell(estimate.class4Ni)],
            ["Student loan", moneyCell(estimate.studentLoan)],
            ["Total liability", moneyCell(estimate.totalLiability)],
            ["Tax deducted or paid", moneyCell(estimate.taxDeducted)],
            ["Estimated amount due", moneyCell(estimate.amountDue)],
          ],
        ),
        section(
          "Payments on account",
          ["Payment", "Deadline", "Amount"],
          [
            [
              "First payment",
              estimate.paymentOnAccount.firstDeadline,
              moneyCell(estimate.paymentOnAccount.firstPayment),
            ],
            [
              "Second payment",
              estimate.paymentOnAccount.secondDeadline,
              moneyCell(estimate.paymentOnAccount.secondPayment),
            ],
            [
              "Balancing payment",
              estimate.paymentOnAccount.balancingDeadline,
              moneyCell(estimate.paymentOnAccount.balancingPayment),
            ],
          ],
        ),
      ],
    };
    const schedule = advanced.schedule;
    const capitalReport: ReportDocument = {
      title: "Capital allowances schedule",
      subtitle,
      sections: [
        section(
          "Allowance summary",
          [
            "AIA limit",
            "AIA claimed",
            "WDA main pool",
            "WDA special pool",
            "Balancing charges",
            "Net allowance",
          ],
          [
            [
              moneyCell(schedule.aiaLimit),
              moneyCell(schedule.aiaClaim),
              moneyCell(schedule.mainPool.writingDownAllowance),
              moneyCell(schedule.specialPool.writingDownAllowance),
              moneyCell(schedule.balancingCharge),
              moneyCell(schedule.netAllowance),
            ],
          ],
        ),
        section(
          "Pool movement",
          ["Pool", "Opening", "Additions", "Disposals", "WDA", "Closing"],
          [
            [
              "Main pool",
              moneyCell(schedule.mainPool.openingValue),
              moneyCell(schedule.mainPool.additions),
              moneyCell(schedule.mainPool.disposals),
              moneyCell(schedule.mainPool.writingDownAllowance),
              moneyCell(schedule.mainPool.closingValue),
            ],
            [
              "Special-rate pool",
              moneyCell(schedule.specialPool.openingValue),
              moneyCell(schedule.specialPool.additions),
              moneyCell(schedule.specialPool.disposals),
              moneyCell(schedule.specialPool.writingDownAllowance),
              moneyCell(schedule.specialPool.closingValue),
            ],
          ],
        ),
        section(
          "Asset movements",
          [
            "Asset",
            "Pool",
            "Allowable cost",
            "AIA",
            "Pool addition",
            "Disposal value",
          ],
          schedule.assetLines.map((row) => [
            row.name,
            row.poolType,
            moneyCell(row.allowableCost),
            moneyCell(row.aiaClaim),
            moneyCell(row.poolAddition),
            moneyCell(row.disposalValue),
          ]),
        ),
      ],
    };
    const debtorReport: ReportDocument = {
      title: "Outstanding invoices - aged debtors",
      subtitle: `${subtitle} · position at ${new Date().toLocaleDateString("en-GB")}`,
      sections: [
        section(
          "Ageing summary",
          [
            "Current",
            "1-30 days",
            "31-60 days",
            "61-90 days",
            "90+ days",
            "Total",
          ],
          [
            [
              moneyCell(ledger.debtorTotals.current),
              moneyCell(ledger.debtorTotals.days1To30),
              moneyCell(ledger.debtorTotals.days31To60),
              moneyCell(ledger.debtorTotals.days61To90),
              moneyCell(ledger.debtorTotals.days90Plus),
              moneyCell(ledger.debtorTotals.total),
            ],
          ],
        ),
        section(
          "Outstanding invoices",
          [
            "Invoice",
            "Client",
            "Issued",
            "Due",
            "Age",
            "Days overdue",
            "Balance",
          ],
          ledger.debtors.map((row) => [
            row.invoiceNumber,
            row.client,
            row.issueDate,
            row.dueDate,
            row.age,
            row.daysOverdue,
            moneyCell(row.balance),
          ]),
          [
            "Total outstanding",
            "",
            "",
            "",
            "",
            "",
            moneyCell(ledger.debtorTotals.total),
          ],
        ),
      ],
    };
    const creditorReport: ReportDocument = {
      title: "Outstanding supplier bills - aged creditors",
      subtitle: `${subtitle} · position at ${new Date().toLocaleDateString("en-GB")}`,
      sections: [
        section(
          "Ageing summary",
          [
            "Current",
            "1-30 days",
            "31-60 days",
            "61-90 days",
            "90+ days",
            "Total",
          ],
          [
            [
              moneyCell(ledger.creditorTotals.current),
              moneyCell(ledger.creditorTotals.days1To30),
              moneyCell(ledger.creditorTotals.days31To60),
              moneyCell(ledger.creditorTotals.days61To90),
              moneyCell(ledger.creditorTotals.days90Plus),
              moneyCell(ledger.creditorTotals.total),
            ],
          ],
        ),
        section(
          "Outstanding supplier bills",
          [
            "Supplier",
            "Reference",
            "Bill date",
            "Due",
            "Age",
            "Days overdue",
            "Balance",
          ],
          ledger.creditors.map((row) => [
            row.supplier,
            row.reference || `Bill ${row.billId}`,
            row.billDate,
            row.dueDate,
            row.age,
            row.daysOverdue,
            moneyCell(row.balance),
          ]),
          [
            "Total outstanding",
            "",
            "",
            "",
            "",
            "",
            moneyCell(ledger.creditorTotals.total),
          ],
        ),
      ],
    };
    return {
      selected: {
        "profit-loss": profitLoss(period),
        clients: clientReport,
        expenses: expenseReport,
        vehicles: vehicleReport,
        vat: vatReport,
        tax: taxReport,
        capital: capitalReport,
        debtors: debtorReport,
        creditors: creditorReport,
      } as Record<ReportKey, ReportDocument>,
      metrics: {
        income: dashboard.income,
        expenses: dashboard.expenses,
        profit: dashboard.profit,
        due: estimate.amountDue,
      },
    };
  }, [
    advancedQuery.data,
    costsQuery.data,
    currentTaxYear,
    dashboardQuery.data,
    inputQuery.data,
    ledgerQuery.data,
    mileageQuery.data,
    period,
    vatQuery.data,
    vehicleSummaryQuery.data,
    vehiclesQuery.data,
  ]);

  const runExport = async (action: () => Promise<boolean>, success: string) => {
    setExporting(true);
    setStatus("");
    try {
      if (await action()) toast(success);
    } catch (caught) {
      setStatus(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const changeReport = (nextReport: ReportKey) => {
    setReportKey(nextReport);
    const next = new URLSearchParams(searchParams);
    if (nextReport === "profit-loss") next.delete("report");
    else next.set("report", nextReport);
    setSearchParams(next, { replace: true });
  };

  if (loading) return <PageSkeleton />;
  if (error || !documents)
    return (
      <Alert variant="destructive">
        <AlertTitle>Reports unavailable</AlertTitle>
        <AlertDescription>
          {error instanceof Error
            ? error.message
            : "The reporting data could not be loaded."}
        </AlertDescription>
      </Alert>
    );
  const selected = documents.selected[reportKey];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accountant-ready records"
        title="Reports & export"
        description={`${currentTaxYear} financial statements, tax schedules and operational reports.`}
        primaryAction={
          <Button asChild>
            <Link to="/accountant">
              <BriefcaseBusiness className="mr-2 h-4 w-4" />
              Accountant handoff
            </Link>
          </Button>
        }
        secondaryActions={
          <>
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
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() =>
                void runExport(
                  exportFullBackup,
                  "Full JSON and CSV backup saved.",
                )
              }
            >
              <Archive className="mr-2 h-4 w-4" />
              Full backup
            </Button>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          label="Income"
          value={moneyCell(documents.metrics.income)}
        />
        <SummaryTile
          label="Allowable expenses"
          value={moneyCell(documents.metrics.expenses)}
        />
        <SummaryTile
          label="Net profit"
          value={moneyCell(documents.metrics.profit)}
          tone="positive"
        />
        <SummaryTile
          label="Estimated tax due"
          value={moneyCell(documents.metrics.due)}
          tone="attention"
        />
      </section>

      {status && (
        <Alert
          variant={
            status.toLowerCase().includes("fail") ||
            status.toLowerCase().includes("could not")
              ? "destructive"
              : "success"
          }
        >
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          className="rounded-md border bg-card p-2 lg:sticky lg:top-20"
          aria-label="Reports"
        >
          <p className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
            Operational
          </p>
          {(
            [
              "profit-loss",
              "clients",
              "expenses",
              "debtors",
              "creditors",
            ] as ReportKey[]
          ).map((key) => (
            <button
              key={key}
              onClick={() => changeReport(key)}
              aria-current={reportKey === key ? "page" : undefined}
              className={`block w-full rounded px-2 py-2 text-left text-sm ${reportKey === key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {reportNames[key]}
            </button>
          ))}
          <p className="mt-2 border-t px-2 pb-1 pt-3 text-xs font-semibold uppercase text-muted-foreground">
            Tax & assets
          </p>
          {(["tax", "vat", "capital", "vehicles"] as ReportKey[]).map((key) => (
            <button
              key={key}
              onClick={() => changeReport(key)}
              aria-current={reportKey === key ? "page" : undefined}
              className={`block w-full rounded px-2 py-2 text-left text-sm ${reportKey === key ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {reportNames[key]}
            </button>
          ))}
        </nav>
        <Card className="min-w-0 rounded-lg shadow-sm">
          <CardHeader className="gap-4 border-b sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">
                {reportNames[reportKey]}
              </CardTitle>
              <CardDescription>{selected.subtitle}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={exporting}
                onClick={() =>
                  void runExport(
                    () => saveReportCsv(selected),
                    "CSV report saved.",
                  )
                }
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                disabled={exporting}
                onClick={() =>
                  void runExport(
                    () => saveReportPdf([selected], selected.title),
                    "PDF report saved.",
                  )
                }
              >
                <Download className="mr-2 h-4 w-4" />
                PDF
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print preview
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            {reportKey === "profit-loss" && (
              <Tabs
                value={period}
                onValueChange={(value) => setPeriod(value as ReportPeriod)}
              >
                <TabsList>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="quarterly">Quarterly</TabsTrigger>
                  <TabsTrigger value="annual">Annual</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {selected.sections.map((item, index) => (
              <section key={item.title} className="report-section">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      Section {index + 1} of {selected.sections.length}
                    </p>
                    <h3 className="mt-1 text-base font-semibold">
                      {item.title}
                    </h3>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.rows.length} row{item.rows.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ReportTable data={item} />
              </section>
            ))}
          </CardContent>
        </Card>
      </div>

      <Alert variant="info">
        <AlertTitle>Estimate only</AlertTitle>
        <AlertDescription>
          Tax, VAT, and allowance figures are calculated from current records
          and configured rates. Review classifications and confirm filing
          figures with HMRC or a qualified accountant.
        </AlertDescription>
      </Alert>
    </div>
  );
}

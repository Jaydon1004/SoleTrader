import { useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  AlertCircle,
  Archive,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  PackageCheck,
  Paperclip,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";
import {
  accountantExportErrorMessage,
  exportAccountantPackage,
  type AccountantPackageResult,
} from "@/lib/accountant-package";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useAppStore } from "@/stores/app-store";
import { LoadingSpinner } from "@/components/loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const packageGroups = [
  {
    icon: ReceiptText,
    title: "Annual accounts",
    detail:
      "Business details, annual income, allowable expenses, net profit and bookkeeping checks in PDF and CSV.",
  },
  {
    icon: FileSpreadsheet,
    title: "Sales and expenses",
    detail:
      "Invoice register, line items, payments, credits, clients, expense ledger and category totals.",
  },
  {
    icon: ShieldCheck,
    title: "Bank and tax evidence",
    detail:
      "Bank reconciliation, statement imports, VAT returns, Self Assessment inputs, CIS and capital assets.",
  },
  {
    icon: Paperclip,
    title: "Supporting documents",
    detail:
      "Receipts, uploaded documents and archived invoice PDFs, with a cross-reference index and missing-file report.",
  },
];

function ReadinessItem({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  const Icon = ready ? CheckCircle2 : AlertCircle;
  return (
    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3 border-b py-3 last:border-0">
      <Icon
        className={`mt-0.5 h-5 w-5 ${ready ? "text-primary" : "text-amber-600"}`}
      />
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

export function AccountantPage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);
  const { data: taxYears } = useTaxYearConfigs();
  const dashboardQuery = useDashboardData(currentTaxYear);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<AccountantPackageResult | null>(null);
  const [error, setError] = useState("");

  if (dashboardQuery.isLoading) return <LoadingSpinner />;
  const dashboard = dashboardQuery.data;
  if (dashboardQuery.error || !dashboard)
    return (
      <Alert variant="destructive">
        <AlertTitle>Accountant handoff unavailable</AlertTitle>
        <AlertDescription>
          {dashboardQuery.error instanceof Error
            ? dashboardQuery.error.message
            : "The business records could not be loaded."}
        </AlertDescription>
      </Alert>
    );

  const yearEnded =
    new Date(`${dashboard.config.year_end}T23:59:59`).getTime() < Date.now();
  const readyCount = [
    yearEnded,
    dashboard.unmatchedBankCount === 0,
    dashboard.missingReceiptCount === 0,
  ].filter(Boolean).length;
  const createPackage = async () => {
    setExporting(true);
    setError("");
    setResult(null);
    try {
      setResult(await exportAccountantPackage(currentTaxYear, dashboard));
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
            Year-end handoff
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Accountant</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Package your books, detailed ledgers and supporting evidence into
            one organised folder for your accountant.
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

      <section className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-7">
          <section>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">
                What your accountant receives
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Open formats with no SoleTrader software required.
              </p>
            </div>
            <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
              {packageGroups.map((item) => (
                <div
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 border-t py-4"
                  key={item.title}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-accent text-primary">
                    <item.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <h4 className="font-semibold">{item.title}</h4>
                    <p className="mt-1 text-sm leading-5 text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold">Books check</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Warnings are included in the handoff and will not prevent
                  export.
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-primary">
                {readyCount} of 3 clear
              </span>
            </div>
            <div className="border-y">
              <ReadinessItem
                ready={yearEnded}
                title={
                  yearEnded ? "Tax year complete" : "Tax year still in progress"
                }
                detail={`${dashboard.config.year_start} to ${dashboard.config.year_end}. You can create a draft handoff at any time.`}
              />
              <ReadinessItem
                ready={dashboard.unmatchedBankCount === 0}
                title={
                  dashboard.unmatchedBankCount === 0
                    ? "Bank records reconciled"
                    : `${dashboard.unmatchedBankCount} bank transaction${dashboard.unmatchedBankCount === 1 ? "" : "s"} unmatched`
                }
                detail={
                  dashboard.unmatchedBankCount === 0
                    ? "Every imported transaction is matched or intentionally ignored."
                    : "Review these in Bank transactions, or explain them to your accountant."
                }
              />
              <ReadinessItem
                ready={dashboard.missingReceiptCount === 0}
                title={
                  dashboard.missingReceiptCount === 0
                    ? "Expense evidence complete"
                    : `${dashboard.missingReceiptCount} expense${dashboard.missingReceiptCount === 1 ? "" : "s"} without receipts`
                }
                detail={
                  dashboard.missingReceiptCount === 0
                    ? "Every expense has a receipt reference."
                    : "Add available receipts before creating the final handoff."
                }
              />
            </div>
          </section>
        </div>

        <aside className="h-fit border-l-4 border-primary bg-muted/45 p-5 xl:sticky xl:top-6">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold">Create {currentTaxYear} handoff</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose a location and SoleTrader will create a dated folder.
              </p>
            </div>
          </div>
          <dl className="mt-5 space-y-2 border-y py-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Accounting basis</dt>
              <dd className="font-semibold capitalize">
                {dashboard.accountingBasis}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Transactions</dt>
              <dd className="font-semibold">
                {dashboard.months.reduce(
                  (sum, month) =>
                    sum + (month.income !== 0 || month.expenses !== 0 ? 1 : 0),
                  0,
                )}{" "}
                active months
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Net profit</dt>
              <dd className="font-semibold">
                {new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(dashboard.profit)}
              </dd>
            </div>
          </dl>
          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={exporting}
            onClick={() => void createPackage()}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PackageCheck className="mr-2 h-4 w-4" />
            )}
            {exporting ? "Creating handoff..." : "Create accountant handoff"}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Sensitive details such as your UTR and National Insurance number are
            included because your accountant will normally require them. Send
            the folder through a secure method.
          </p>
        </aside>
      </section>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Handoff not created</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {result && (
        <Alert
          variant={
            result.counts.missingSupportingFiles ||
            result.counts.unmatchedBankTransactions
              ? "warning"
              : "success"
          }
        >
          <PackageCheck className="h-4 w-4" />
          <AlertTitle>Accountant handoff created</AlertTitle>
          <AlertDescription>
            <p>
              {result.counts.supportingFiles} supporting files copied.{" "}
              {result.counts.missingSupportingFiles
                ? `${result.counts.missingSupportingFiles} referenced files were missing; see the evidence index.`
                : "All referenced evidence was included."}
            </p>
            <p className="mt-1 break-all text-xs">{result.directory}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void openPath(result.directory)}
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Open handoff folder
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

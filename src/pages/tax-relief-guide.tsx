import { useDeferredValue, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  Check,
  ChevronDown,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  HelpCircle,
  Landmark,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  compareTradingAllowance,
  filterTaxReliefItems,
  hmrcGuideSources,
  reliefTreatmentLabels,
  sourcesForTaxReliefItem,
  taxReliefItems,
  type ReliefCircumstance,
  type ReliefTreatment,
  type TaxReliefItem,
} from "@/lib/tax-relief-guide";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import { useTaxCalculatorInput } from "@/lib/queries/tax-calculator";
import { homeOfficeDeduction } from "@/lib/tax-estimate";
import {
  evaluateTaxReliefQuestionnaire,
  taxReliefQuestions,
  type QuestionnaireAnswer,
  type QuestionnaireResult,
} from "@/lib/tax-relief-questionnaire";
import { useAppStore } from "@/stores/app-store";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

const treatmentOptions: Array<ReliefTreatment | "all"> = [
  "all",
  "expense",
  "capital",
  "tax-relief",
  "restricted",
  "not-allowable",
];

const circumstances: Array<{
  value: ReliefCircumstance;
  label: string;
}> = [
  { value: "home", label: "I work from home" },
  { value: "live-in", label: "I live at business premises" },
  { value: "vehicle", label: "I use a vehicle" },
  { value: "travel", label: "I travel for work" },
  { value: "staff", label: "I pay other people" },
  { value: "employed", label: "I also have a PAYE job" },
  { value: "premises", label: "I have business premises" },
  { value: "property", label: "I have property income" },
  { value: "stock", label: "I buy stock or materials" },
  { value: "equipment", label: "I buy equipment" },
  { value: "finance", label: "I have finance or personal reliefs" },
];

const treatmentBadge: Record<
  ReliefTreatment,
  "success" | "warning" | "destructive" | "secondary" | "outline"
> = {
  expense: "success",
  capital: "secondary",
  "tax-relief": "outline",
  restricted: "warning",
  "not-allowable": "destructive",
};

function GuideItem({
  item,
  accountingBasis,
}: {
  item: TaxReliefItem;
  accountingBasis?: "cash" | "accrual";
}) {
  const sources = sourcesForTaxReliefItem(item);
  const action =
    (accountingBasis && item.basisActions?.[accountingBasis]) ?? item.action;
  return (
    <details className="group border-b last:border-b-0">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{item.title}</span>
            <Badge variant={treatmentBadge[item.treatment]}>
              {reliefTreatmentLabels[item.treatment]}
            </Badge>
            {item.oftenMissed && <Badge variant="outline">Often missed</Badge>}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">
            {item.summary}
          </span>
        </span>
        <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 bg-muted/20 px-4 pb-5 pt-1 md:grid-cols-2">
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            When and how to claim
          </h4>
          <ul className="mt-2 space-y-2 text-sm">
            {item.conditions.map((condition) => (
              <li className="flex gap-2" key={condition}>
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{condition}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase text-muted-foreground">
            Evidence to keep
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
            {item.records.map((record) => (
              <li key={record}>{record}</li>
            ))}
          </ul>
          {item.category && (
            <p className="mt-3 text-xs text-muted-foreground">
              Suggested category: <strong>{item.category}</strong>
            </p>
          )}
          {accountingBasis && item.basisNotes?.[accountingBasis] && (
            <div className="mt-3 border-l-2 border-primary pl-3 text-xs">
              <strong className="capitalize">{accountingBasis} basis:</strong>{" "}
              {item.basisNotes[accountingBasis]}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
            {sources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                HMRC: {source.title}
                <ExternalLink className="h-3 w-3" />
              </a>
            ))}
          </div>
          {action && (
            <Button asChild size="sm" className="mt-4">
              <Link to={action.to}>
                {action.label}
                <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

const resultStatus: Record<
  QuestionnaireResult["status"],
  {
    label: string;
    description: string;
    variant: "success" | "warning" | "destructive";
  }
> = {
  "possible-claim": {
    label: "Possible claim",
    description:
      "Review the conditions, calculate the business amount and keep the listed evidence.",
    variant: "success",
  },
  "check-details": {
    label: "Check details",
    description:
      "You answered Not sure. Confirm the facts before including or excluding this item.",
    variant: "warning",
  },
  exclude: {
    label: "Usually exclude",
    description:
      "Keep it out of deductible costs unless the detailed guidance identifies a specific exception.",
    variant: "destructive",
  },
};

function QuestionnairePanel({
  accountingBasis,
}: {
  accountingBasis?: "cash" | "accrual";
}) {
  const [started, setStarted] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer>>(
    {},
  );
  const [showResults, setShowResults] = useState(false);
  const question = taxReliefQuestions[questionIndex];
  const answer = question ? answers[question.id] : undefined;
  const answeredCount = Object.keys(answers).length;
  const results = evaluateTaxReliefQuestionnaire(answers);
  const progress = showResults
    ? 100
    : ((questionIndex + (answer ? 1 : 0)) / taxReliefQuestions.length) * 100;

  const reset = () => {
    setAnswers({});
    setQuestionIndex(0);
    setShowResults(false);
    setStarted(false);
  };

  if (!started) {
    return (
      <section className="border-y bg-muted/20 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-3xl items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Guided claim audit
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                Find costs and reliefs you may be missing
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Answer {taxReliefQuestions.length} plain-language questions. The
                audit checks every topic in this guide, including mixed-use home
                costs, premises, vehicles, equipment, laundry, personal reliefs
                and earlier-year claims.
              </p>
            </div>
          </div>
          <Button className="shrink-0" onClick={() => setStarted(true)}>
            Start claim audit
            <ArrowRight />
          </Button>
        </div>
      </section>
    );
  }

  if (showResults) {
    const sections = (["possible-claim", "check-details", "exclude"] as const)
      .map((status) => ({
        status,
        results: results.filter((result) => result.status === status),
      }))
      .filter((section) => section.results.length > 0);

    return (
      <section className="space-y-5 border-y py-6" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Audit complete
              </p>
              <h3 className="mt-1 text-lg font-semibold">
                {results.length} topics need your attention
              </h3>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                These are candidate claims and exclusions based on your answers,
                not automatic deductions. Open each result to check its rules,
                evidence and HMRC source before recording an amount.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowResults(false)}>
              Review answers
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={reset}
              title="Restart audit"
              aria-label="Restart audit"
            >
              <RotateCcw />
              <span className="sr-only">Restart audit</span>
            </Button>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="border border-dashed px-5 py-8 text-center">
            <p className="font-semibold">No candidate claims identified</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review any Not sure answers or browse the complete guide below.
            </p>
          </div>
        ) : (
          sections.map((section) => {
            const status = resultStatus[section.status];
            return (
              <div key={section.status}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={status.variant}>{status.label}</Badge>
                  <span className="text-sm text-muted-foreground">
                    {status.description}
                  </span>
                </div>
                <div className="overflow-hidden rounded-md border bg-card">
                  {section.results.map((result) => (
                    <GuideItem
                      key={result.item.id}
                      item={result.item}
                      accountingBasis={accountingBasis}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>
    );
  }

  return (
    <section className="border-y py-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>
            Question {questionIndex + 1} of {taxReliefQuestions.length}
          </span>
          <span>{answeredCount} answered</span>
        </div>
        <Progress className="mt-2" value={progress} />
        <p className="mt-6 text-xs font-semibold uppercase text-primary">
          {question.section}
        </p>
        <h3 className="mt-2 text-xl font-semibold">{question.question}</h3>
        <div className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{question.help}</p>
        </div>

        <RadioGroup
          className="mt-6 grid gap-3 sm:grid-cols-3"
          value={answer}
          onValueChange={(value) =>
            setAnswers((current) => ({
              ...current,
              [question.id]: value as QuestionnaireAnswer,
            }))
          }
        >
          {(
            [
              ["yes", "Yes"],
              ["no", "No"],
              ["unsure", "Not sure"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem value={value} />
              <span className="text-sm font-semibold">{label}</span>
            </label>
          ))}
        </RadioGroup>

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={questionIndex === 0}
            onClick={() => setQuestionIndex((current) => current - 1)}
          >
            Previous
          </Button>
          <div className="flex gap-2">
            {answeredCount > 0 &&
              questionIndex < taxReliefQuestions.length - 1 && (
                <Button variant="ghost" onClick={() => setShowResults(true)}>
                  View current results
                </Button>
              )}
            <Button
              disabled={!answer}
              onClick={() => {
                if (questionIndex === taxReliefQuestions.length - 1) {
                  setShowResults(true);
                } else {
                  setQuestionIndex((current) => current + 1);
                }
              }}
            >
              {questionIndex === taxReliefQuestions.length - 1
                ? "Show my results"
                : "Next question"}
              <ArrowRight />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function TaxReliefGuidePage() {
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const dashboardQuery = useDashboardData(currentTaxYear);
  const advancedTaxQuery = useAdvancedTaxData(currentTaxYear);
  const taxInputQuery = useTaxCalculatorInput(currentTaxYear);
  const [query, setQuery] = useState("");
  const [treatment, setTreatment] = useState<ReliefTreatment | "all">("all");
  const [onlyOftenMissed, setOnlyOftenMissed] = useState(false);
  const [selectedCircumstances, setSelectedCircumstances] = useState<
    ReliefCircumstance[]
  >([]);
  const deferredQuery = useDeferredValue(query);
  const results = filterTaxReliefItems(
    deferredQuery,
    treatment,
    selectedCircumstances,
  ).filter((item) => !onlyOftenMissed || item.oftenMissed);
  const dashboard = dashboardQuery.data;
  const additionalDeductions =
    dashboard && advancedTaxQuery.data && taxInputQuery.data
      ? advancedTaxQuery.data.schedule.totalAllowance +
        homeOfficeDeduction(taxInputQuery.data, dashboard.config)
      : 0;
  const actualDeductionTotal = dashboard
    ? dashboard.expenses + additionalDeductions
    : 0;
  const allowanceComparison =
    dashboard && advancedTaxQuery.data && taxInputQuery.data
      ? compareTradingAllowance(dashboard.income, actualDeductionTotal)
      : null;
  const grouped = results.reduce<Map<string, TaxReliefItem[]>>(
    (groups, item) => {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
      return groups;
    },
    new Map(),
  );

  const toggleCircumstance = (value: ReliefCircumstance) =>
    setSelectedCircumstances((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );

  return (
    <div className="space-y-6">
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Keep more of what you earn
        </p>
        <h2 className="mt-1 text-2xl font-semibold">Tax relief guide</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Find costs and reliefs that may apply to a UK sole trader, see where
          each belongs, and keep the evidence needed to support a claim.
        </p>
      </header>

      <Alert variant="info">
        <AlertTitle>
          Use this as a claim checklist, not an automatic approval
        </AlertTitle>
        <AlertDescription>
          A cost normally needs to be incurred wholly and exclusively for the
          trade. Mixed-use, capital and unusual costs need extra care. Guidance
          reviewed September 2026; check current HMRC guidance or an accountant
          before relying on a material or uncertain claim.
        </AlertDescription>
      </Alert>

      <QuestionnairePanel accountingBasis={dashboard?.accountingBasis} />

      {dashboard && allowanceComparison && (
        <section className="border-y py-5">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
              <Calculator className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">Trading allowance check</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Based on recorded {currentTaxYear} income and expenses. Your
                    business uses the {dashboard.accountingBasis} basis.
                  </p>
                </div>
                <Badge
                  variant={
                    allowanceComparison.preferred === "allowance"
                      ? "success"
                      : "secondary"
                  }
                >
                  {allowanceComparison.preferred === "allowance"
                    ? "Allowance may deduct more"
                    : allowanceComparison.preferred === "expenses"
                      ? "Recorded expenses deduct more"
                      : "Same deduction"}
                </Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="border-l-2 pl-3">
                  <p className="text-xs text-muted-foreground">
                    Recorded income
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money.format(allowanceComparison.grossIncome)}
                  </p>
                </div>
                <div className="border-l-2 pl-3">
                  <p className="text-xs text-muted-foreground">
                    Recorded deductions
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money.format(allowanceComparison.actualExpenses)}
                  </p>
                </div>
                <div className="border-l-2 pl-3">
                  <p className="text-xs text-muted-foreground">
                    Trading allowance
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {money.format(allowanceComparison.tradingAllowance)}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Potential deduction difference:{" "}
                {money.format(allowanceComparison.deductionDifference)}. This is
                a comparison, not an eligibility decision. The trading allowance
                replaces expenses and capital allowances and can affect losses,
                benefits and other calculations.
                {additionalDeductions > 0 &&
                  ` The recorded figure includes ${money.format(additionalDeductions)} of home-office and capital-allowance deductions.`}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">What applies to you?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Select any that apply. General business costs remain visible.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {circumstances.map((item) => {
              const selected = selectedCircumstances.includes(item.value);
              return (
                <Button
                  key={item.value}
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  onClick={() => toggleCircumstance(item.value)}
                >
                  {selected && <Check />}
                  {item.label}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="border-l-4 border-primary bg-muted/35 p-4">
          <p className="text-sm font-semibold">The basic test</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask: was it for the business, is any part private, is it an asset,
            and can I prove the amount and purpose?
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
            placeholder="Search a cost, for example broadband, boots, hotel or pension"
            aria-label="Search tax relief guidance"
          />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Filter by treatment">
          {treatmentOptions.map((value) => (
            <Button
              key={value}
              size="sm"
              variant={treatment === value ? "secondary" : "ghost"}
              aria-pressed={treatment === value}
              onClick={() => setTreatment(value)}
            >
              {value === "all" ? "All guidance" : reliefTreatmentLabels[value]}
            </Button>
          ))}
          <Button
            size="sm"
            variant={onlyOftenMissed ? "secondary" : "ghost"}
            aria-pressed={onlyOftenMissed}
            onClick={() => setOnlyOftenMissed((current) => !current)}
          >
            Often missed
          </Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4 border-y py-3 text-sm">
        <span>
          <strong>{results.length}</strong> of {taxReliefItems.length} topics
          shown
        </span>
        {(query ||
          treatment !== "all" ||
          onlyOftenMissed ||
          selectedCircumstances.length > 0) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuery("");
              setTreatment("all");
              setOnlyOftenMissed(false);
              setSelectedCircumstances([]);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {results.length === 0 ? (
        <div className="border border-dashed px-6 py-12 text-center">
          <Search className="mx-auto h-6 w-6 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">No matching guidance</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a broader description or clear one of the filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped].map(([group, items]) => (
            <section key={group}>
              <h3 className="mb-2 text-sm font-semibold">{group}</h3>
              <div className="overflow-hidden rounded-md border bg-card">
                {items.map((item) => (
                  <GuideItem
                    item={item}
                    accountingBasis={dashboard?.accountingBasis}
                    key={item.id}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section className="grid gap-4 border-t pt-6 md:grid-cols-3">
        <div>
          <FileCheck2 className="h-5 w-5 text-primary" />
          <h3 className="mt-2 font-semibold">Keep proof</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Keep receipts, invoices, calculations and a clear note of business
            purpose for at least 5 years after the 31 January filing deadline. A
            bank entry alone may not prove what was bought.
          </p>
        </div>
        <div>
          <Landmark className="h-5 w-5 text-primary" />
          <h3 className="mt-2 font-semibold">Use the right treatment</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Ordinary expenses reduce business profit. Assets and personal tax
            reliefs belong in their dedicated records instead.
          </p>
        </div>
        <div>
          <ExternalLink className="h-5 w-5 text-primary" />
          <h3 className="mt-2 font-semibold">Check the source</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Every topic links to the relevant GOV.UK guidance. Check it before
            making a large, unusual or retrospective claim.
          </p>
        </div>
      </section>

      <details className="group rounded-md border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          Official HMRC source library ({hmrcGuideSources.length})
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-x-6 gap-y-2 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {hmrcGuideSources.map((source) => (
            <a
              key={source.id}
              className="inline-flex items-start gap-1 text-sm font-medium text-primary hover:underline"
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {source.title}
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            </a>
          ))}
        </div>
      </details>
    </div>
  );
}

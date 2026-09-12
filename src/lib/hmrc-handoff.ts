import type { DashboardData } from "@/lib/queries/dashboard";
import type { YearEndHandoffData } from "@/lib/year-end-handoff";
import type {
  HmrcBusinessCalculation,
  HmrcFilingDetails,
  Sa103Schedule,
} from "@/lib/hmrc-filing";

export type HmrcCheckStatus = "clear" | "review";

export interface HmrcReadinessCheck {
  key: string;
  title: string;
  detail: string;
  status: HmrcCheckStatus;
}

export function buildHmrcReadiness(input: {
  dashboard: DashboardData;
  handoff?: YearEndHandoffData;
  filing?: HmrcFilingDetails;
  schedule?: Sa103Schedule;
  calculation?: HmrcBusinessCalculation;
  taxInputsSaved?: boolean;
  yearClosed: boolean;
  now?: Date;
}) {
  const { dashboard, handoff, filing, schedule, calculation } = input;
  const profile = dashboard.profile;
  const now = input.now ?? new Date();
  const yearEnded = new Date(`${dashboard.config.year_end}T23:59:59`) < now;
  const banksConfirmed =
    !!handoff?.bankConfirmations.length &&
    handoff.bankConfirmations.every(
      (bank) =>
        bank.confirmed_complete === 1 &&
        bank.statement_start <= dashboard.config.year_start &&
        bank.statement_end >= dashboard.config.year_end,
    );
  const identityComplete = Boolean(
    profile.first_name.trim() &&
    profile.last_name.trim() &&
    profile.utr.trim() &&
    profile.ni_number.trim() &&
    profile.address_line_1.trim() &&
    profile.postcode.trim(),
  );
  const utrValid = /^\d{10}$/.test(profile.utr.replace(/\s/g, ""));
  const niNumber = profile.ni_number.replace(/\s/g, "").toUpperCase();
  const niValid =
    /^(?!BG|GB|KN|NK|NT|TN|ZZ)(?!.*[DFIQUV])[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/.test(
      niNumber,
    );
  const eventDatesValid = Boolean(
    filing &&
    (!filing.business_started ||
      (filing.start_date >= dashboard.config.year_start &&
        filing.start_date <= dashboard.config.year_end)) &&
    (!filing.business_ceased ||
      (filing.cessation_date >= dashboard.config.year_start &&
        filing.cessation_date <= dashboard.config.year_end)),
  );
  const homeOfficeAlreadyRecorded = dashboard.expenseCategories.some(
    (category) =>
      category.name.toLowerCase().includes("home office") &&
      category.amount > 0,
  );
  const duplicateHomeOffice =
    homeOfficeAlreadyRecorded && (calculation?.homeOfficeDeduction ?? 0) > 0;
  const allocatedLoss =
    (filing?.current_loss_other_income ?? 0) +
    (filing?.current_loss_carry_back ?? 0);
  const lossAllocationValid =
    !calculation || allocatedLoss <= calculation.adjustedLoss + 0.01;

  const checks: HmrcReadinessCheck[] = [
    {
      key: "period",
      title: yearEnded ? "Tax year complete" : "Tax year still open",
      detail: `${dashboard.config.year_start} to ${dashboard.config.year_end}`,
      status: yearEnded ? "clear" : "review",
    },
    {
      key: "identity",
      title: identityComplete
        ? "Taxpayer identity recorded"
        : "Taxpayer identity incomplete",
      detail:
        "Full legal name, UTR, National Insurance number, address and postcode are required for a defensible handoff.",
      status: identityComplete ? "clear" : "review",
    },
    {
      key: "identifiers",
      title:
        utrValid && niValid
          ? "Tax identifiers have valid formats"
          : "Check UTR and National Insurance number",
      detail:
        "The UTR must contain 10 digits and the National Insurance number must use a valid prefix, six digits and suffix A to D.",
      status: utrValid && niValid ? "clear" : "review",
    },
    {
      key: "bank",
      title:
        dashboard.unmatchedBankCount === 0
          ? "Bank activity reconciled"
          : `${dashboard.unmatchedBankCount} bank transaction${dashboard.unmatchedBankCount === 1 ? "" : "s"} unresolved`,
      detail: "Imported transactions must be matched or deliberately excluded.",
      status: dashboard.unmatchedBankCount === 0 ? "clear" : "review",
    },
    {
      key: "evidence",
      title:
        dashboard.missingReceiptCount === 0
          ? "Expense evidence referenced"
          : `${dashboard.missingReceiptCount} expense${dashboard.missingReceiptCount === 1 ? "" : "s"} without evidence`,
      detail:
        "The export copies available files and records a SHA-256 checksum for each copy.",
      status: dashboard.missingReceiptCount === 0 ? "clear" : "review",
    },
    {
      key: "form",
      title: schedule?.verified
        ? `${schedule.form} mapping checked against the official form`
        : "Tax-year form mapping not verified",
      detail: schedule
        ? `${schedule.formVersion}. ${schedule.reason}`
        : "Load the HMRC calculation schedule before final review.",
      status:
        schedule?.verified && schedule.reviewItems.length === 0
          ? "clear"
          : "review",
    },
    {
      key: "calculation",
      title: calculation
        ? "Profit reconciliation calculated"
        : "Profit reconciliation unavailable",
      detail: calculation
        ? `Bookkeeping profit £${calculation.bookkeepingProfit.toFixed(2)} reconciles to taxable business profit £${calculation.totalTaxableProfit.toFixed(2)}.`
        : "Tax adjustments have not been reconciled to bookkeeping profit.",
      status: calculation ? "clear" : "review",
    },
    {
      key: "home-office",
      title: duplicateHomeOffice
        ? "Possible duplicate use-of-home claim"
        : "Use-of-home claim checked",
      detail: duplicateHomeOffice
        ? "Home Office expenses and a separate tax-calculator use-of-home deduction are both recorded. Keep only the method actually claimed."
        : "No duplicate between the expense ledger and saved use-of-home deduction was detected.",
      status: duplicateHomeOffice ? "review" : "clear",
    },
    {
      key: "losses",
      title: lossAllocationValid
        ? "Loss allocations reconcile"
        : "Loss allocations exceed the calculated loss",
      detail: `Calculated adjusted loss £${(calculation?.adjustedLoss ?? 0).toFixed(2)}; allocated £${allocatedLoss.toFixed(2)}.`,
      status: lossAllocationValid ? "clear" : "review",
    },
    {
      key: "hmrc-declarations",
      title: "HMRC filing declarations",
      detail:
        "Start or cessation, changes, special circumstances, adjustments and losses have been reviewed.",
      status:
        filing?.reviewed === 1 &&
        filing.unsupported_circumstances_confirmed === 1
          ? "clear"
          : "review",
    },
    {
      key: "business-dates",
      title: eventDatesValid
        ? "Business event dates reconcile"
        : "Start or cessation date is missing or outside the tax year",
      detail:
        "A declared commencement or cessation must have a date within the selected tax year.",
      status: eventDatesValid ? "clear" : "review",
    },
    {
      key: "tax-inputs",
      title: input.taxInputsSaved
        ? "Whole-return tax inputs saved"
        : "Whole-return tax inputs not saved",
      detail:
        "Employment, property, savings, dividends, pensions, Gift Aid and tax deducted feed the final estimate.",
      status: input.taxInputsSaved ? "clear" : "review",
    },
    {
      key: "business-declaration",
      title: "Business year-end declaration",
      detail:
        "Stock, finance, private use, capital introduced and drawings have been reviewed.",
      status:
        handoff?.details.questionnaire_complete === 1 ? "clear" : "review",
    },
    {
      key: "personal-tax",
      title: "Whole-return information",
      detail:
        "Employment, pensions, interest, dividends, benefits, loans and payments on account have been reviewed.",
      status: handoff?.details.personal_tax_complete === 1 ? "clear" : "review",
    },
    {
      key: "statements",
      title: "Full-year bank statements",
      detail:
        "Every active account has confirmed dates and a closing balance covering the tax year.",
      status: banksConfirmed ? "clear" : "review",
    },
    {
      key: "approval",
      title: "Owner declaration",
      detail:
        "The proprietor has approved the information as complete and accurate to the best of their knowledge.",
      status: handoff?.details.approved === 1 ? "clear" : "review",
    },
    {
      key: "lock",
      title: "Tax year locked",
      detail:
        "Closing the year rebuilds and balances the ledger, then prevents accidental changes.",
      status: input.yearClosed ? "clear" : "review",
    },
  ];
  const reviewCount = checks.filter(
    (check) => check.status === "review",
  ).length;
  return { checks, reviewCount, ready: reviewCount === 0 };
}

import { describe, expect, it } from "vitest";
import { buildHmrcReadiness } from "@/lib/hmrc-handoff";
import { emptyYearEndHandoff } from "@/lib/year-end-handoff";
import {
  emptyHmrcFilingDetails,
  type HmrcBusinessCalculation,
  type Sa103Schedule,
} from "@/lib/hmrc-filing";
import type { DashboardData } from "@/lib/queries/dashboard";

const dashboard = {
  profile: {
    first_name: "Alex",
    last_name: "Builder",
    utr: "1234567890",
    ni_number: "AB123456C",
    address_line_1: "1 High Street",
    postcode: "AB1 2CD",
  },
  config: {
    year_start: "2025-04-06",
    year_end: "2026-04-05",
  },
  unmatchedBankCount: 0,
  missingReceiptCount: 0,
  expenseCategories: [],
} as unknown as DashboardData;

const completeHandoff = {
  details: {
    ...emptyYearEndHandoff("2025/26"),
    questionnaire_complete: 1,
    personal_tax_complete: 1,
    approved: 1,
  },
  bankConfirmations: [
    {
      tax_year: "2025/26",
      bank_account_id: 1,
      account_name: "Business current",
      account_type: "current",
      statement_start: "2025-04-06",
      statement_end: "2026-04-05",
      closing_balance: 100,
      confirmed_complete: 1,
      notes: "",
      updated_at: null,
    },
  ],
};
const filing = {
  ...emptyHmrcFilingDetails("2025/26"),
  unsupported_circumstances_confirmed: 1,
  reviewed: 1,
};
const schedule = {
  form: "SA103S",
  formVersion: "2026 (tax year 2025/26)",
  verified: true,
  reason: "Simple affairs",
  boxes: [],
  reviewItems: [],
} as Sa103Schedule;
const calculation = {
  bookkeepingProfit: 100,
  totalTaxableProfit: 100,
  homeOfficeDeduction: 0,
  adjustedLoss: 0,
} as HmrcBusinessCalculation;

describe("HMRC handoff readiness", () => {
  it("is ready only when all evidence controls are clear", () => {
    const result = buildHmrcReadiness({
      dashboard,
      handoff: completeHandoff,
      filing,
      schedule,
      calculation,
      taxInputsSaved: true,
      yearClosed: true,
      now: new Date("2026-04-06T12:00:00"),
    });
    expect(result.ready).toBe(true);
    expect(result.reviewCount).toBe(0);
  });

  it("reports unresolved controls without claiming filing readiness", () => {
    const result = buildHmrcReadiness({
      dashboard: {
        ...dashboard,
        unmatchedBankCount: 2,
        missingReceiptCount: 1,
      },
      handoff: undefined,
      yearClosed: false,
      now: new Date("2025-12-01T12:00:00"),
    });
    expect(result.ready).toBe(false);
    expect(result.checks.find((check) => check.key === "bank")?.status).toBe(
      "review",
    );
    expect(result.reviewCount).toBeGreaterThan(1);
  });
});

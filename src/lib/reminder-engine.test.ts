import { describe, expect, it } from "vitest";
import {
  buildReminderAlerts,
  defaultReminderPreferences,
  taxDeadlineDates,
} from "@/lib/reminder-engine";

describe("reminder engine", () => {
  it("derives UK filing and payment dates after a tax year ends", () => {
    expect(
      taxDeadlineDates("2026-04-05", {
        registration: "10-05",
        paper: "10-31",
        online: "01-31",
        poaFirst: "01-31",
        poaSecond: "07-31",
      }),
    ).toEqual({
      registration: "2026-10-05",
      paper: "2026-10-31",
      online: "2027-01-31",
      poaFirst: "2027-01-31",
      poaSecond: "2027-07-31",
    });
  });

  it("honours configurable windows and financial alert boundaries", () => {
    const alerts = buildReminderAlerts({
      today: "2026-09-05",
      taxYear: "2025/26",
      yearStart: "2026-04-06",
      yearEnd: "2027-04-05",
      registrationDeadline: "2026-10-05",
      paperReturnDeadline: "2026-10-31",
      onlineReturnDeadline: "2027-01-31",
      poaFirstDeadline: "2027-01-31",
      poaSecondDeadline: "2027-07-31",
      vatReturns: [
        { start: "2026-06-01", label: "Jun-Aug", deadline: "2026-09-07" },
      ],
      invoices: [
        {
          id: 4,
          invoiceNumber: "INV-4",
          client: "Acme",
          dueDate: "2026-09-04",
          balance: 120,
        },
      ],
      vatTurnover: 90_000,
      vatThreshold: 100_000,
      vatRegistered: false,
      lastExpenseDate: "2026-08-22",
      taxAmountDue: 1200,
      taxPot: 600,
      custom: [
        { id: 7, title: "MOT", description: "Van MOT", dueDate: "2026-09-19" },
      ],
      preferences: defaultReminderPreferences,
    });

    expect(alerts.map((alert) => alert.id)).toEqual(
      expect.arrayContaining([
        "sa-registration-2025/26",
        "vat-2026-06-01",
        "invoice-4",
        "vat-threshold-2025/26",
        "expense-nudge-2026-09",
        "tax-pot-2026-09",
        "custom-7",
      ]),
    );
    expect(alerts.find((alert) => alert.id === "invoice-4")?.daysUntil).toBe(
      -1,
    );
    expect(
      alerts.find((alert) => alert.id === "tax-pot-2026-09")?.amount,
    ).toBeGreaterThan(0);
  });

  it("drops stale statutory periods but retains overdue user reminders", () => {
    const alerts = buildReminderAlerts({
      today: "2026-09-05",
      taxYear: "2025/26",
      yearStart: "2026-04-06",
      yearEnd: "2027-04-05",
      registrationDeadline: "2027-10-05",
      paperReturnDeadline: "2027-10-31",
      onlineReturnDeadline: "2028-01-31",
      poaFirstDeadline: "2028-01-31",
      poaSecondDeadline: "2028-07-31",
      vatReturns: [
        { start: "2025-04-01", label: "Old VAT", deadline: "2025-08-07" },
      ],
      invoices: [],
      vatTurnover: 0,
      vatThreshold: 90_000,
      vatRegistered: true,
      lastExpenseDate: "2026-09-05",
      taxAmountDue: 0,
      taxPot: 0,
      custom: [
        { id: 8, title: "Overdue MOT", description: "", dueDate: "2025-08-07" },
      ],
      preferences: defaultReminderPreferences,
    });
    expect(alerts.some((alert) => alert.id === "vat-2025-04-01")).toBe(false);
    expect(alerts.some((alert) => alert.id === "custom-8")).toBe(true);
  });
});

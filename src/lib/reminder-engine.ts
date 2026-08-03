export type ReminderSeverity = "info" | "warning" | "critical";
export type ReminderKind =
  "hmrc" | "vat" | "invoice" | "threshold" | "expense" | "tax_pot" | "custom";

export interface ReminderAlert {
  id: string;
  kind: ReminderKind;
  title: string;
  description: string;
  dueDate: string;
  daysUntil: number;
  severity: ReminderSeverity;
  amount?: number;
}

export interface ReminderPreferences {
  registrationLeadDays: number;
  paperReturnLeadDays: number;
  onlineReturnLeadDays: number;
  paymentOnAccountLeadDays: number;
  vatLeadDays: number;
  invoiceOverdueDays: number;
  vatThresholdPercent: number;
  expenseNudgeDays: number;
  customLeadDays: number;
  systemNotifications: boolean;
}

export const defaultReminderPreferences: ReminderPreferences = {
  registrationLeadDays: 30,
  paperReturnLeadDays: 30,
  onlineReturnLeadDays: 45,
  paymentOnAccountLeadDays: 30,
  vatLeadDays: 30,
  invoiceOverdueDays: 1,
  vatThresholdPercent: 90,
  expenseNudgeDays: 14,
  customLeadDays: 14,
  systemNotifications: false,
};

export interface ReminderEngineInput {
  today: string;
  taxYear: string;
  yearEnd: string;
  registrationDeadline: string;
  paperReturnDeadline: string;
  onlineReturnDeadline: string;
  poaFirstDeadline: string;
  poaSecondDeadline: string;
  vatReturns: Array<{ start: string; label: string; deadline: string }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    client: string;
    dueDate: string;
    balance: number;
  }>;
  vatTurnover: number;
  vatThreshold: number;
  vatRegistered: boolean;
  lastExpenseDate: string | null;
  yearStart: string;
  taxAmountDue: number;
  taxPot: number;
  custom: Array<{
    id: number;
    title: string;
    description: string;
    dueDate: string;
  }>;
  preferences: ReminderPreferences;
}

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function calendarDaysBetween(from: string, to: string) {
  return Math.round((utcDate(to) - utcDate(from)) / 86_400_000);
}

function nextOccurrence(after: string, monthDay: string) {
  const [month, day] = monthDay.split("-").map(Number);
  const year = Number(after.slice(0, 4));
  const candidate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return candidate > after
    ? candidate
    : `${year + 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function taxDeadlineDates(
  yearEnd: string,
  deadlines: {
    registration: string;
    paper: string;
    online: string;
    poaFirst: string;
    poaSecond: string;
  },
) {
  const registration = nextOccurrence(yearEnd, deadlines.registration);
  const paper = nextOccurrence(yearEnd, deadlines.paper);
  const online = nextOccurrence(yearEnd, deadlines.online);
  const poaFirst = nextOccurrence(yearEnd, deadlines.poaFirst);
  return {
    registration,
    paper,
    online,
    poaFirst,
    poaSecond: nextOccurrence(poaFirst, deadlines.poaSecond),
  };
}

function deadlineAlert(
  today: string,
  id: string,
  title: string,
  description: string,
  dueDate: string,
  leadDays: number,
  kind: ReminderKind = "hmrc",
  retainOverdue = false,
) {
  const daysUntil = calendarDaysBetween(today, dueDate);
  if (daysUntil > leadDays || (!retainOverdue && daysUntil < -leadDays))
    return null;
  return {
    id,
    kind,
    title,
    description,
    dueDate,
    daysUntil,
    severity: daysUntil < 0 || daysUntil <= 7 ? "critical" : "warning",
  } satisfies ReminderAlert;
}

export function buildReminderAlerts(
  input: ReminderEngineInput,
): ReminderAlert[] {
  const { preferences, today } = input;
  const alerts: ReminderAlert[] = [];
  const deadlines = [
    [
      "sa-registration",
      "Self Assessment registration",
      `Register for Self Assessment for ${input.taxYear}.`,
      input.registrationDeadline,
      preferences.registrationLeadDays,
    ],
    [
      "paper-return",
      "Paper Self Assessment return",
      `Paper return deadline for ${input.taxYear}.`,
      input.paperReturnDeadline,
      preferences.paperReturnLeadDays,
    ],
    [
      "online-return",
      "Online return and payment",
      `File the online return and pay the balance for ${input.taxYear}.`,
      input.onlineReturnDeadline,
      preferences.onlineReturnLeadDays,
    ],
    [
      "poa-first",
      "First payment on account",
      "First payment on account is due.",
      input.poaFirstDeadline,
      preferences.paymentOnAccountLeadDays,
    ],
    [
      "poa-second",
      "Second payment on account",
      "Second payment on account is due.",
      input.poaSecondDeadline,
      preferences.paymentOnAccountLeadDays,
    ],
  ] as const;
  deadlines.forEach(([id, title, description, dueDate, lead]) => {
    const alert = deadlineAlert(
      today,
      `${id}-${input.taxYear}`,
      title,
      description,
      dueDate,
      lead,
    );
    if (alert) alerts.push(alert);
  });

  input.vatReturns.forEach((period) => {
    const alert = deadlineAlert(
      today,
      `vat-${period.start}`,
      `VAT return: ${period.label}`,
      "File the VAT return and make any payment due.",
      period.deadline,
      preferences.vatLeadDays,
      "vat",
    );
    if (alert) alerts.push(alert);
  });

  input.invoices.forEach((invoice) => {
    const daysOverdue = -calendarDaysBetween(today, invoice.dueDate);
    if (daysOverdue < preferences.invoiceOverdueDays) return;
    alerts.push({
      id: `invoice-${invoice.id}`,
      kind: "invoice",
      title: `${invoice.invoiceNumber} is overdue`,
      description: `${invoice.client} owes £${invoice.balance.toFixed(2)}.`,
      dueDate: invoice.dueDate,
      daysUntil: -daysOverdue,
      severity: daysOverdue >= 30 ? "critical" : "warning",
      amount: invoice.balance,
    });
  });

  const thresholdPercent =
    input.vatThreshold > 0 ? (input.vatTurnover / input.vatThreshold) * 100 : 0;
  if (
    !input.vatRegistered &&
    thresholdPercent >= preferences.vatThresholdPercent
  ) {
    alerts.push({
      id: `vat-threshold-${input.taxYear}`,
      kind: "threshold",
      title: "VAT registration threshold approaching",
      description: `Rolling turnover is ${thresholdPercent.toFixed(1)}% of the £${input.vatThreshold.toFixed(0)} threshold.`,
      dueDate: today,
      daysUntil: 0,
      severity: thresholdPercent >= 100 ? "critical" : "warning",
      amount: input.vatTurnover,
    });
  }

  const expenseReference =
    input.lastExpenseDate && input.lastExpenseDate > input.yearStart
      ? input.lastExpenseDate
      : input.yearStart;
  const expenseDays = -calendarDaysBetween(today, expenseReference);
  if (expenseDays >= preferences.expenseNudgeDays) {
    alerts.push({
      id: `expense-nudge-${today.slice(0, 7)}`,
      kind: "expense",
      title: "No expenses logged recently",
      description: `No expense has been recorded for ${expenseDays} days.`,
      dueDate: today,
      daysUntil: 0,
      severity: "info",
    });
  }

  const taxShortfall = Math.max(0, input.taxAmountDue - input.taxPot);
  if (taxShortfall > 0) {
    const monthsRemaining = Math.max(
      1,
      Math.ceil(
        Math.max(0, calendarDaysBetween(today, input.onlineReturnDeadline)) /
          30.44,
      ),
    );
    const monthlyAmount = Number((taxShortfall / monthsRemaining).toFixed(2));
    alerts.push({
      id: `tax-pot-${today.slice(0, 7)}`,
      kind: "tax_pot",
      title: `Move £${monthlyAmount.toFixed(2)} to your tax account`,
      description: `£${taxShortfall.toFixed(2)} remains to cover the current estimated bill.`,
      dueDate: today,
      daysUntil: 0,
      severity: "info",
      amount: monthlyAmount,
    });
  }

  input.custom.forEach((reminder) => {
    const alert = deadlineAlert(
      today,
      `custom-${reminder.id}`,
      reminder.title,
      reminder.description || "User reminder",
      reminder.dueDate,
      preferences.customLeadDays,
      "custom",
      true,
    );
    if (alert) alerts.push(alert);
  });
  return alerts.sort(
    (left, right) =>
      left.dueDate.localeCompare(right.dueDate) ||
      left.title.localeCompare(right.title),
  );
}

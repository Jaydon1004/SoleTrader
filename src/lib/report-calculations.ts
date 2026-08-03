export type ReportPeriod = "monthly" | "quarterly" | "annual";

export interface PeriodSourceRow {
  key: string;
  label: string;
  income: number;
  expenses: number;
}

export interface ProfitLossRow extends PeriodSourceRow {
  profit: number;
}

export interface DebtorSourceRow {
  dueDate: string;
  balance: number;
}

export interface AgedDebtorTotals {
  current: number;
  days1To30: number;
  days31To60: number;
  days61To90: number;
  days90Plus: number;
  total: number;
}

const round = (value: number) => Number(value.toFixed(2));

function utcDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function buildProfitLossRows(
  rows: PeriodSourceRow[],
  period: ReportPeriod,
): ProfitLossRow[] {
  if (period === "monthly") {
    return rows.map((row) => ({
      ...row,
      profit: round(row.income - row.expenses),
    }));
  }

  const bucketSize = period === "quarterly" ? 3 : Math.max(1, rows.length);
  const buckets: ProfitLossRow[] = [];
  for (let index = 0; index < rows.length; index += bucketSize) {
    const members = rows.slice(index, index + bucketSize);
    const income = round(members.reduce((sum, row) => sum + row.income, 0));
    const expenses = round(members.reduce((sum, row) => sum + row.expenses, 0));
    buckets.push({
      key: period === "quarterly" ? `Q${buckets.length + 1}` : "annual",
      label:
        period === "quarterly"
          ? `Quarter ${buckets.length + 1}`
          : "Full tax year",
      income,
      expenses,
      profit: round(income - expenses),
    });
  }
  return buckets;
}

export function ageDebtors(
  rows: DebtorSourceRow[],
  asOfDate: string,
): AgedDebtorTotals {
  const asOf = utcDate(asOfDate);
  const totals: AgedDebtorTotals = {
    current: 0,
    days1To30: 0,
    days31To60: 0,
    days61To90: 0,
    days90Plus: 0,
    total: 0,
  };

  for (const row of rows) {
    const due = utcDate(row.dueDate);
    const daysOverdue = Math.floor((asOf - due) / 86_400_000);
    if (daysOverdue <= 0) totals.current += row.balance;
    else if (daysOverdue <= 30) totals.days1To30 += row.balance;
    else if (daysOverdue <= 60) totals.days31To60 += row.balance;
    else if (daysOverdue <= 90) totals.days61To90 += row.balance;
    else totals.days90Plus += row.balance;
    totals.total += row.balance;
  }

  Object.keys(totals).forEach((key) => {
    totals[key as keyof AgedDebtorTotals] = round(
      totals[key as keyof AgedDebtorTotals],
    );
  });
  return totals;
}

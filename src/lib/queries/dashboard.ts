import { useQuery } from "@tanstack/react-query";
import { query } from "@/lib/database";
import {
  allowableExpenseAmount,
  groupTaxableSales,
  taxableSaleAmount,
} from "@/lib/accounting-rules";
import { calculateTaxEstimate, type TaxEstimate } from "@/lib/tax-estimate";
import type { TaxYearConfig, UserProfile } from "@/types/database";

interface DatedAmount {
  date: string;
  amount: number;
}
interface DatedSale {
  date: string;
  gross: number;
  net: number;
}
interface DatedExpense {
  date: string;
  category?: string;
  gross: number;
  vat: number;
  businessPercent: number;
  vatCapitalAsset: number;
}
interface NamedAmount {
  name: string;
  amount: number;
}
interface NamedSale {
  name: string;
  gross: number;
  net: number;
}

export interface DashboardMonth {
  key: string;
  label: string;
  income: number;
  expenses: number;
  profit: number;
  cumulativeProfit: number;
}

export interface DashboardYearSummary {
  taxYear: string;
  income: number;
  expenses: number;
  profit: number;
  tax: number;
}

export interface DashboardData {
  profile: UserProfile;
  config: TaxYearConfig;
  accountingBasis: "cash" | "accrual";
  income: number;
  expenses: number;
  profit: number;
  tax: TaxEstimate;
  taxPaid: number;
  taxPot: number;
  safeToWithdraw: number;
  outstandingCount: number;
  outstandingValue: number;
  overdueCount: number;
  overdueValue: number;
  unmatchedBankCount: number;
  missingReceiptCount: number;
  months: DashboardMonth[];
  expenseCategories: NamedAmount[];
  incomeByClient: NamedAmount[];
  yearComparison: DashboardYearSummary[];
  progressPercent: number;
  daysRemaining: number;
}

const round = (value: number) => Number(value.toFixed(2));

function monthBuckets(config: TaxYearConfig) {
  const start = new Date(`${config.year_start}T00:00:00`);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleDateString("en-GB", { month: "short" }),
    };
  });
}

function taxYearProgress(config: TaxYearConfig) {
  const start = new Date(`${config.year_start}T00:00:00`).getTime();
  const end = new Date(`${config.year_end}T23:59:59`).getTime();
  const now = Date.now();
  const progressPercent = Math.max(
    0,
    Math.min(100, ((now - start) / (end - start)) * 100),
  );
  return {
    progressPercent,
    daysRemaining: Math.max(0, Math.ceil((end - now) / 86400000)),
  };
}

async function loadYearCore(
  config: TaxYearConfig,
  profile: UserProfile,
  includeOpening: boolean,
) {
  const [
    invoiceIncome,
    paymentIncome,
    expenseRows,
    mileageRows,
    costRows,
    openingRows,
  ] = await Promise.all([
    query<DatedSale>(
      `SELECT i.issue_date AS date, i.total AS gross, i.subtotal AS net
       FROM invoices i WHERE i.deleted_at IS NULL AND i.is_quote = 0
         AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1)
         AND i.issue_date BETWEEN ? AND ?
       UNION ALL
       SELECT c.issue_date AS date, -c.amount AS gross,
         -(c.amount * i.subtotal / NULLIF(i.total, 0)) AS net
       FROM credit_notes c INNER JOIN invoices i ON i.id = c.invoice_id
       WHERE i.deleted_at IS NULL AND i.is_quote = 0
         AND c.issue_date BETWEEN ? AND ?`,
      [config.year_start, config.year_end, config.year_start, config.year_end],
    ),
    query<DatedSale>(
      `SELECT p.payment_date AS date, p.amount AS gross,
         p.amount * i.subtotal / NULLIF(i.total, 0) AS net
       FROM invoice_payments p
       INNER JOIN invoices i ON i.id = p.invoice_id
       WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND p.payment_date BETWEEN ? AND ?`,
      [config.year_start, config.year_end],
    ),
    query<DatedExpense>(
      `SELECT e.date, c.name AS category, e.amount AS gross, e.vat_amount AS vat,
        e.business_percent AS businessPercent, e.vat_capital_asset AS vatCapitalAsset
       FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id
       WHERE e.deleted_at IS NULL AND e.date BETWEEN ? AND ?`,
      [config.year_start, config.year_end],
    ),
    query<DatedAmount>(
      `SELECT m.date, m.amount FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id
       WHERE m.deleted_at IS NULL AND v.cost_method = 'mileage' AND m.date BETWEEN ? AND ?`,
      [config.year_start, config.year_end],
    ),
    query<DatedExpense>(
      `SELECT c.date, c.amount AS gross, c.vat_amount AS vat,
        c.business_percent AS businessPercent, c.vat_capital_asset AS vatCapitalAsset
       FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id
       WHERE c.deleted_at IS NULL AND v.cost_method = 'actual' AND c.date BETWEEN ? AND ?`,
      [config.year_start, config.year_end],
    ),
    includeOpening
      ? query<{ key: string; value: string }>(
          "SELECT key, value FROM app_settings WHERE key IN ('opening_income', 'opening_expenses', 'opening_tax_paid')",
        )
      : Promise.resolve([]),
  ]);

  const opening = Object.fromEntries(
    openingRows.map((row) => [row.key, Number(row.value) || 0]),
  );
  const selectedIncomeRows = (
    profile.accounting_basis === "cash" ? paymentIncome : invoiceIncome
  ).map((row) => ({
    date: row.date,
    amount: taxableSaleAmount(row.gross, row.net, profile),
  }));
  const mappedExpenseRows = expenseRows.map((row) => ({
    date: row.date,
    category: row.category ?? "",
    vat: row.vat * (row.businessPercent / 100),
    amount: allowableExpenseAmount(
      row.gross,
      row.vat,
      row.businessPercent,
      row.vatCapitalAsset === 1,
      profile,
    ),
  }));
  const mappedCostRows = costRows.map((row) => ({
    date: row.date,
    vat: row.vat * (row.businessPercent / 100),
    amount: allowableExpenseAmount(
      row.gross,
      row.vat,
      row.businessPercent,
      row.vatCapitalAsset === 1,
      profile,
    ),
  }));
  const income =
    selectedIncomeRows.reduce((sum, row) => sum + row.amount, 0) +
    (opening.opening_income ?? 0);
  const expenses =
    [...mappedExpenseRows, ...mileageRows, ...mappedCostRows].reduce(
      (sum, row) => sum + row.amount,
      0,
    ) + (opening.opening_expenses ?? 0);

  return {
    income: round(income),
    expenses: round(expenses),
    profit: round(income - expenses),
    taxPaid: opening.opening_tax_paid ?? 0,
    selectedIncomeRows,
    expenseRows: mappedExpenseRows,
    mileageRows,
    costRows: mappedCostRows,
    openingIncome: opening.opening_income ?? 0,
    openingExpenses: opening.opening_expenses ?? 0,
  };
}

export function useDashboardData(taxYear: string) {
  return useQuery({
    queryKey: ["dashboard", taxYear],
    queryFn: async (): Promise<DashboardData> => {
      const [profiles, configs, configuredCurrentYear, taxPotRows] =
        await Promise.all([
          query<UserProfile>("SELECT * FROM user_profile WHERE id = 1"),
          query<TaxYearConfig>(
            "SELECT * FROM tax_year_config WHERE tax_year = ?",
            [taxYear],
          ),
          query<{ value: string }>(
            "SELECT value FROM app_settings WHERE key = 'current_tax_year'",
          ),
          query<{ value: string }>(
            "SELECT value FROM app_settings WHERE key = ?",
            [`tax_pot_${taxYear}`],
          ),
        ]);
      const profile = profiles[0];
      const config = configs[0];
      if (!profile || !config)
        throw new Error(
          `Dashboard configuration is unavailable for ${taxYear}.`,
        );

      const core = await loadYearCore(
        config,
        profile,
        configuredCurrentYear[0]?.value === taxYear,
      );
      const tax = calculateTaxEstimate(core.profit, config);
      const taxPot = Number(taxPotRows[0]?.value ?? 0) || 0;

      const [
        invoiceAlerts,
        categoryRows,
        clientRows,
        previousConfigs,
        unmatchedBankRows,
        missingReceiptRows,
      ] = await Promise.all([
        query<{
          outstanding_count: number;
          outstanding_value: number;
          overdue_count: number;
          overdue_value: number;
        }>(
          `SELECT COUNT(*) AS outstanding_count,
            COALESCE(SUM(MAX(0, i.total - i.amount_paid - COALESCE(credits.amount, 0))), 0) AS outstanding_value,
            SUM(CASE WHEN i.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_count,
            COALESCE(SUM(CASE WHEN i.status = 'overdue' THEN MAX(0, i.total - i.amount_paid - COALESCE(credits.amount, 0)) ELSE 0 END), 0) AS overdue_value
           FROM invoices i LEFT JOIN (SELECT invoice_id, SUM(amount) AS amount FROM credit_notes GROUP BY invoice_id) credits ON credits.invoice_id = i.id
           WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.status NOT IN ('draft', 'paid', 'cancelled') AND i.tax_year = ?`,
          [taxYear],
        ),
        query<NamedAmount>(
          `SELECT c.name, COALESCE(SUM((e.amount - CASE
            WHEN ? = 'unregistered' OR (? = 'flat_rate' AND e.vat_capital_asset = 0) THEN 0
            ELSE e.vat_amount END) * e.business_percent / 100), 0) AS amount
           FROM expenses e INNER JOIN expense_categories c ON c.id = e.category_id
           WHERE e.deleted_at IS NULL AND e.tax_year = ? GROUP BY c.id ORDER BY amount DESC`,
          [profile.vat_status, profile.vat_scheme, taxYear],
        ),
        profile.accounting_basis === "cash"
          ? query<NamedSale>(
              `SELECT COALESCE(NULLIF(c.company, ''), c.name) AS name, p.amount AS gross,
                p.amount * i.subtotal / NULLIF(i.total, 0) AS net
               FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id INNER JOIN clients c ON c.id = i.client_id
               WHERE i.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ?`,
              [config.year_start, config.year_end],
            )
          : query<NamedSale>(
              `SELECT COALESCE(NULLIF(c.company, ''), c.name) AS name,
                i.total AS gross, i.subtotal AS net
               FROM invoices i INNER JOIN clients c ON c.id = i.client_id
               WHERE i.deleted_at IS NULL AND i.is_quote = 0
                 AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1)
                 AND i.issue_date BETWEEN ? AND ?
               UNION ALL
               SELECT COALESCE(NULLIF(cl.company, ''), cl.name), -cn.amount,
                 -(cn.amount * inv.subtotal / NULLIF(inv.total, 0))
               FROM credit_notes cn INNER JOIN invoices inv ON inv.id = cn.invoice_id
               INNER JOIN clients cl ON cl.id = inv.client_id
               WHERE inv.deleted_at IS NULL AND inv.is_quote = 0 AND cn.issue_date BETWEEN ? AND ?`,
              [
                config.year_start,
                config.year_end,
                config.year_start,
                config.year_end,
              ],
            ),
        query<TaxYearConfig>(
          "SELECT * FROM tax_year_config WHERE year_start < ? ORDER BY year_start DESC LIMIT 1",
          [config.year_start],
        ),
        query<{ count: number }>(
          "SELECT COUNT(*) AS count FROM bank_transactions WHERE status = 'unmatched' AND tax_year = ?",
          [taxYear],
        ),
        query<{ count: number }>(
          `SELECT COUNT(*) AS count FROM expenses
           WHERE deleted_at IS NULL AND tax_year = ? AND COALESCE(receipt_path, '') = '' AND is_bad_debt = 0`,
          [taxYear],
        ),
      ]);

      const buckets = monthBuckets(config);
      const months = buckets.map((bucket) => ({
        ...bucket,
        income: 0,
        expenses: 0,
        profit: 0,
        cumulativeProfit: 0,
      }));
      const findMonth = (date: string) =>
        months.find((month) => month.key === date.slice(0, 7));
      core.selectedIncomeRows.forEach((row) => {
        const month = findMonth(row.date);
        if (month) month.income += row.amount;
      });
      [...core.expenseRows, ...core.mileageRows, ...core.costRows].forEach(
        (row) => {
          const month = findMonth(row.date);
          if (month) month.expenses += row.amount;
        },
      );
      if (months[0]) {
        months[0].income += core.openingIncome;
        months[0].expenses += core.openingExpenses;
      }
      let cumulative = 0;
      months.forEach((month) => {
        month.income = round(month.income);
        month.expenses = round(month.expenses);
        month.profit = round(month.income - month.expenses);
        cumulative += month.profit;
        month.cumulativeProfit = round(cumulative);
      });

      const vehicleBreakdown =
        core.mileageRows.reduce((sum, row) => sum + row.amount, 0) +
        core.costRows.reduce((sum, row) => sum + row.amount, 0);
      const expenseCategories = categoryRows.filter((row) => row.amount > 0);
      if (vehicleBreakdown > 0)
        expenseCategories.push({
          name: "Vehicle deductions",
          amount: round(vehicleBreakdown),
        });
      if (core.openingExpenses > 0)
        expenseCategories.push({
          name: "Opening balance",
          amount: core.openingExpenses,
        });

      const previousConfig = previousConfigs[0];
      const previousCore = previousConfig
        ? await loadYearCore(previousConfig, profile, false)
        : null;
      const previousTax =
        previousConfig && previousCore
          ? calculateTaxEstimate(previousCore.profit, previousConfig)
          : null;
      const yearComparison: DashboardYearSummary[] = [
        {
          taxYear,
          income: core.income,
          expenses: core.expenses,
          profit: core.profit,
          tax: tax.total,
        },
      ];
      if (previousConfig && previousCore && previousTax) {
        yearComparison.push({
          taxYear: previousConfig.tax_year,
          income: previousCore.income,
          expenses: previousCore.expenses,
          profit: previousCore.profit,
          tax: previousTax.total,
        });
      }

      const alerts = invoiceAlerts[0] ?? {
        outstanding_count: 0,
        outstanding_value: 0,
        overdue_count: 0,
        overdue_value: 0,
      };
      const progress = taxYearProgress(config);
      return {
        profile,
        config,
        accountingBasis: profile.accounting_basis,
        income: core.income,
        expenses: core.expenses,
        profit: core.profit,
        tax,
        taxPaid: core.taxPaid,
        taxPot,
        safeToWithdraw: Math.max(0, core.profit - tax.total),
        outstandingCount: alerts.outstanding_count,
        outstandingValue: alerts.outstanding_value,
        overdueCount: alerts.overdue_count,
        overdueValue: alerts.overdue_value,
        unmatchedBankCount: unmatchedBankRows[0]?.count ?? 0,
        missingReceiptCount: missingReceiptRows[0]?.count ?? 0,
        months,
        expenseCategories,
        incomeByClient: groupTaxableSales(clientRows, profile).slice(0, 8),
        yearComparison,
        ...progress,
      };
    },
  });
}

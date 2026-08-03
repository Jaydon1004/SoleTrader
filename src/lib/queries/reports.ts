import { useQuery } from "@tanstack/react-query";
import { groupTaxableSales } from "@/lib/accounting-rules";
import { query } from "@/lib/database";
import { ageDebtors, type AgedDebtorTotals } from "@/lib/report-calculations";
import type { TaxYearConfig, UserProfile } from "@/types/database";

export interface ReportNamedAmount {
  name: string;
  amount: number;
}

interface ReportNamedSale {
  name: string;
  gross: number;
  net: number;
}

export interface AgedDebtorRow {
  invoiceNumber: string;
  client: string;
  issueDate: string;
  dueDate: string;
  balance: number;
  daysOverdue: number;
  age: string;
}

export interface ReportLedgerData {
  incomeByClient: ReportNamedAmount[];
  debtors: AgedDebtorRow[];
  debtorTotals: AgedDebtorTotals;
}

function calendarDays(left: string, right: string) {
  const utc = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.floor((utc(left) - utc(right)) / 86_400_000);
}

function ageLabel(days: number) {
  if (days <= 0) return "Current";
  if (days <= 30) return "1-30 days";
  if (days <= 60) return "31-60 days";
  if (days <= 90) return "61-90 days";
  return "90+ days";
}

export function useReportLedger(
  taxYear: string,
  profile?: UserProfile,
  config?: TaxYearConfig,
) {
  return useQuery({
    queryKey: ["reports", taxYear, profile?.accounting_basis],
    enabled: Boolean(taxYear && profile && config),
    queryFn: async (): Promise<ReportLedgerData> => {
      if (!profile || !config)
        throw new Error("Report configuration is unavailable.");
      const incomeRows =
        profile.accounting_basis === "cash"
          ? await query<ReportNamedSale>(
              `SELECT COALESCE(NULLIF(c.company, ''), c.name) AS name, p.amount AS gross,
                p.amount * i.subtotal / NULLIF(i.total, 0) AS net
             FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id INNER JOIN clients c ON c.id = i.client_id
             WHERE i.deleted_at IS NULL AND p.payment_date BETWEEN ? AND ?`,
              [config.year_start, config.year_end],
            )
          : await query<ReportNamedSale>(
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
            );
      const incomeByClient = groupTaxableSales(incomeRows, profile);
      const today = new Date().toISOString().slice(0, 10);
      const debtorRows = await query<{
        invoice_reference: string;
        client: string;
        issue_date: string;
        due_date: string;
        balance: number;
      }>(
        `SELECT CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS invoice_reference,
          COALESCE(NULLIF(c.company, ''), c.name) AS client, i.issue_date, i.due_date,
          ROUND(MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), 2) AS balance
         FROM invoices i INNER JOIN clients c ON c.id = i.client_id
         WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.status NOT IN ('draft', 'paid', 'cancelled')
         ORDER BY i.due_date, invoice_reference`,
      );
      const debtors = debtorRows
        .filter((row) => row.balance > 0)
        .map((row) => {
          const daysOverdue = calendarDays(today, row.due_date);
          return {
            invoiceNumber: row.invoice_reference,
            client: row.client,
            issueDate: row.issue_date,
            dueDate: row.due_date,
            balance: row.balance,
            daysOverdue: Math.max(0, daysOverdue),
            age: ageLabel(daysOverdue),
          };
        });
      return {
        incomeByClient,
        debtors,
        debtorTotals: ageDebtors(
          debtors.map((row) => ({
            dueDate: row.dueDate,
            balance: row.balance,
          })),
          today,
        ),
      };
    },
  });
}

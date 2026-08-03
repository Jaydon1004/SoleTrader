import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  addDays,
  addMonths,
  addQuarters,
  addWeeks,
  addYears,
  format,
} from "date-fns";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";
import {
  buildReminderAlerts,
  defaultReminderPreferences,
  taxDeadlineDates,
  type ReminderPreferences,
} from "@/lib/reminder-engine";
import { useAdvancedTaxData } from "@/lib/queries/advanced-tax";
import { useDashboardData } from "@/lib/queries/dashboard";
import { useTaxCalculatorInput } from "@/lib/queries/tax-calculator";
import { useVatOverview } from "@/lib/queries/vat";
import { calculateFullTaxEstimate } from "@/lib/tax-estimate";

export interface CustomReminder {
  id: number;
  title: string;
  description: string;
  due_date: string;
  reminder_type: "custom";
  is_recurring: number;
  recurring_frequency: "weekly" | "monthly" | "quarterly" | "yearly" | null;
  dismissed: number;
  created_at: string;
}

export interface CustomReminderInput {
  id?: number;
  title: string;
  description: string;
  dueDate: string;
  recurringFrequency: CustomReminder["recurring_frequency"];
}

interface ReminderRecords {
  preferences: ReminderPreferences;
  custom: CustomReminder[];
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    client: string;
    dueDate: string;
    balance: number;
  }>;
  agreements: Array<{ id: number; client: string; expiryDate: string }>;
  lastExpenseDate: string | null;
  dismissals: Array<{ alert_id: string; dismissed_until: string }>;
}

const preferenceKeys: Record<keyof ReminderPreferences, string> = {
  registrationLeadDays: "reminder_registration_lead_days",
  paperReturnLeadDays: "reminder_paper_lead_days",
  onlineReturnLeadDays: "reminder_online_lead_days",
  paymentOnAccountLeadDays: "reminder_poa_lead_days",
  vatLeadDays: "reminder_vat_lead_days",
  invoiceOverdueDays: "reminder_invoice_overdue_days",
  vatThresholdPercent: "reminder_vat_threshold_percent",
  expenseNudgeDays: "reminder_expense_nudge_days",
  customLeadDays: "reminder_custom_lead_days",
  systemNotifications: "reminder_system_notifications",
};

function parsePreferences(rows: Array<{ key: string; value: string }>) {
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(
    Object.entries(preferenceKeys).map(([field, key]) => {
      const fallback =
        defaultReminderPreferences[field as keyof ReminderPreferences];
      const stored = values.get(key);
      return [
        field,
        typeof fallback === "boolean"
          ? stored === undefined
            ? fallback
            : stored === "1"
          : stored === undefined
            ? fallback
            : Number(stored),
      ];
    }),
  ) as unknown as ReminderPreferences;
}

export function useReminderPreferences() {
  return useQuery({
    queryKey: ["reminder-preferences"],
    queryFn: async () =>
      parsePreferences(
        await query<{ key: string; value: string }>(
          "SELECT key, value FROM app_settings WHERE key LIKE 'reminder_%'",
        ),
      ),
  });
}

export function useSaveReminderPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (preferences: ReminderPreferences) =>
      invoke<void>("save_reminder_preferences", {
        input: { workspaceId: getActiveWorkspaceId(), ...preferences },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reminder-preferences"] });
      queryClient.invalidateQueries({ queryKey: ["reminder-records"] });
    },
  });
}

function useReminderRecords() {
  return useQuery({
    queryKey: ["reminder-records"],
    queryFn: async (): Promise<ReminderRecords> => {
      const [settings, custom, invoices, agreements, lastExpenses, dismissals] =
        await Promise.all([
          query<{ key: string; value: string }>(
            "SELECT key, value FROM app_settings WHERE key LIKE 'reminder_%'",
          ),
          query<CustomReminder>(
            "SELECT * FROM reminders WHERE reminder_type = 'custom' AND dismissed = 0 ORDER BY due_date, id",
          ),
          query<{
            id: number;
            invoiceNumber: string;
            client: string;
            dueDate: string;
            balance: number;
          }>(
            `SELECT i.id, CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS invoiceNumber,
            COALESCE(NULLIF(c.company, ''), c.name) AS client,
            i.due_date AS dueDate, ROUND(MAX(0, i.total - i.amount_paid - COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = i.id), 0)), 2) AS balance
           FROM invoices i INNER JOIN clients c ON c.id = i.client_id
           WHERE i.deleted_at IS NULL AND i.is_quote = 0 AND i.status NOT IN ('draft', 'paid', 'cancelled')`,
          ),
          query<{ id: number; client: string; expiryDate: string }>(
            `SELECT a.id, COALESCE(NULLIF(c.company, ''), c.name) AS client, a.expiry_date AS expiryDate
           FROM self_billing_agreements a INNER JOIN clients c ON c.id = a.client_id
           WHERE a.archived = 0 AND a.expiry_date >= date('now', '-30 days')`,
          ),
          query<{ last_date: string | null }>(
            "SELECT MAX(date) AS last_date FROM expenses WHERE deleted_at IS NULL",
          ),
          query<{ alert_id: string; dismissed_until: string }>(
            "SELECT alert_id, dismissed_until FROM reminder_dismissals",
          ),
        ]);
      return {
        preferences: parsePreferences(settings),
        custom,
        invoices: invoices.filter((row) => row.balance > 0),
        agreements,
        lastExpenseDate: lastExpenses[0]?.last_date ?? null,
        dismissals,
      };
    },
  });
}

export function useReminderCentre(taxYear: string) {
  const dashboard = useDashboardData(taxYear);
  const advanced = useAdvancedTaxData(taxYear);
  const calculatorInput = useTaxCalculatorInput(taxYear);
  const vat = useVatOverview(taxYear);
  const records = useReminderRecords();
  const isLoading =
    dashboard.isLoading ||
    advanced.isLoading ||
    calculatorInput.isLoading ||
    vat.isLoading ||
    records.isLoading;
  const error =
    dashboard.error ??
    advanced.error ??
    calculatorInput.error ??
    vat.error ??
    records.error;
  if (
    !dashboard.data ||
    !advanced.data ||
    !calculatorInput.data ||
    !vat.data ||
    !records.data
  )
    return { data: null, isLoading, error };
  const estimate = calculateFullTaxEstimate(
    dashboard.data.profit,
    calculatorInput.data,
    dashboard.data.config,
    dashboard.data.profile,
    dashboard.data.taxPaid,
    {
      capitalAllowances: advanced.data.schedule.totalAllowance,
      balancingCharges: advanced.data.schedule.balancingCharge,
      cisDeductionsReceived: advanced.data.cisReceived,
    },
  );
  const config = dashboard.data.config;
  const deadlineDates = taxDeadlineDates(config.year_end, {
    registration: config.sa_registration_deadline,
    paper: config.paper_return_deadline,
    online: config.online_return_deadline,
    poaFirst: config.poa_first_deadline,
    poaSecond: config.poa_second_deadline,
  });
  const today = format(new Date(), "yyyy-MM-dd");
  const alerts = buildReminderAlerts({
    today,
    taxYear,
    yearStart: config.year_start,
    yearEnd: config.year_end,
    registrationDeadline: deadlineDates.registration,
    paperReturnDeadline: deadlineDates.paper,
    onlineReturnDeadline: deadlineDates.online,
    poaFirstDeadline: deadlineDates.poaFirst,
    poaSecondDeadline: deadlineDates.poaSecond,
    vatReturns: vat.data.settings.reminders_enabled ? vat.data.returns : [],
    invoices: records.data.invoices,
    vatTurnover: vat.data.rollingTurnover,
    vatThreshold: config.vat_registration_threshold,
    vatRegistered: dashboard.data.profile.vat_status !== "unregistered",
    lastExpenseDate: records.data.lastExpenseDate,
    taxAmountDue: estimate.amountDue,
    taxPot: dashboard.data.taxPot,
    custom: [
      ...records.data.custom.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        dueDate: item.due_date,
      })),
      ...records.data.agreements.map((agreement) => ({
        id: -1_000_000 - agreement.id,
        title: `Renew self-billing agreement · ${agreement.client}`,
        description:
          "Review and renew the written self-billing agreement before accepting further customer-issued invoices.",
        dueDate: agreement.expiryDate,
      })),
    ],
    preferences: records.data.preferences,
  }).filter(
    (alert) =>
      !records.data.dismissals.some(
        (item) => item.alert_id === alert.id && item.dismissed_until >= today,
      ),
  );
  return {
    data: {
      alerts,
      custom: records.data.custom,
      preferences: records.data.preferences,
      estimate,
      deadlines: deadlineDates,
    },
    isLoading,
    error,
  };
}

export function useSaveCustomReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CustomReminderInput) =>
      input.id
        ? execute(
            "UPDATE reminders SET title = ?, description = ?, due_date = ?, is_recurring = ?, recurring_frequency = ?, dismissed = 0 WHERE id = ?",
            [
              input.title,
              input.description,
              input.dueDate,
              input.recurringFrequency ? 1 : 0,
              input.recurringFrequency,
              input.id,
            ],
          )
        : execute(
            "INSERT INTO reminders (title, description, due_date, reminder_type, is_recurring, recurring_frequency) VALUES (?, ?, ?, 'custom', ?, ?)",
            [
              input.title,
              input.description,
              input.dueDate,
              input.recurringFrequency ? 1 : 0,
              input.recurringFrequency,
            ],
          ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reminder-records"] }),
  });
}

export function useCompleteCustomReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminder: CustomReminder) => {
      if (!reminder.is_recurring || !reminder.recurring_frequency)
        return execute("UPDATE reminders SET dismissed = 1 WHERE id = ?", [
          reminder.id,
        ]);
      const current = new Date(`${reminder.due_date}T00:00:00`);
      const next =
        reminder.recurring_frequency === "weekly"
          ? addWeeks(current, 1)
          : reminder.recurring_frequency === "monthly"
            ? addMonths(current, 1)
            : reminder.recurring_frequency === "quarterly"
              ? addQuarters(current, 1)
              : addYears(current, 1);
      return execute(
        "UPDATE reminders SET due_date = ?, dismissed = 0 WHERE id = ?",
        [format(next, "yyyy-MM-dd"), reminder.id],
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reminder-records"] }),
  });
}

export function useDeleteCustomReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "DELETE FROM reminders WHERE id = ? AND reminder_type = 'custom'",
        [id],
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reminder-records"] }),
  });
}

export function useSnoozeReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ alertId, days = 7 }: { alertId: string; days?: number }) =>
      execute(
        `INSERT INTO reminder_dismissals (alert_id, dismissed_until) VALUES (?, ?)
       ON CONFLICT(alert_id) DO UPDATE SET dismissed_until = excluded.dismissed_until, updated_at = datetime('now')`,
        [alertId, format(addDays(new Date(), days), "yyyy-MM-dd")],
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["reminder-records"] }),
  });
}

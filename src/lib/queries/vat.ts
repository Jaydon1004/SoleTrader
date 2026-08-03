import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { recognisedCashCreditAmounts } from "@/lib/accounting-rules";
import { execute, query } from "@/lib/database";
import type { TaxYearConfig, UserProfile, VatSettings } from "@/types/database";

interface InvoiceVatRow {
  id: number;
  issue_date: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  vat_ec_supply: number;
}

interface PaymentVatRow extends InvoiceVatRow {
  payment_date: string;
  payment_amount: number;
}

interface CreditVatRow extends InvoiceVatRow {
  credit_date: string;
  credit_amount: number;
}

interface PurchaseVatRow {
  date: string;
  amount: number;
  vat_amount: number;
  business_percent: number;
  vat_ec_acquisition: number;
  vat_capital_asset: number;
}

export interface VatPeriod {
  start: string;
  end: string;
  label: string;
  deadline: string;
}

export interface VatReturnSummary extends VatPeriod {
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  box5: number;
  box6: number;
  box7: number;
  box8: number;
  box9: number;
  standardNetVat: number;
  flatRateDifference: number;
  daysUntilDeadline: number;
  filedAt: string | null;
  filedReturnId: number | null;
}

interface VatReturnSnapshot {
  id: number;
  period_start: string;
  period_end: string;
  box1: number;
  box2: number;
  box3: number;
  box4: number;
  box5: number;
  box6: number;
  box7: number;
  box8: number;
  box9: number;
  filed_at: string;
}

export interface VatAdjustment {
  id: number;
  filed_return_id: number;
  adjustment_date: string;
  reason: string;
  box1: number;
  box2: number;
  box4: number;
  box6: number;
  box7: number;
  box8: number;
  box9: number;
  created_at: string;
}

export type VatAdjustmentInput = Omit<VatAdjustment, "id" | "created_at">;

type AdjustableBoxes = Pick<
  VatReturnSummary,
  "box1" | "box2" | "box4" | "box6" | "box7" | "box8" | "box9"
>;

export interface VatOverview {
  profile: UserProfile;
  config: TaxYearConfig;
  settings: VatSettings;
  rollingTurnover: number;
  thresholdPercent: number;
  returns: VatReturnSummary[];
}

const round = (value: number) => Number(value.toFixed(2));
const dateValue = (value: Date) => format(value, "yyyy-MM-dd");

function periodEnd(start: Date) {
  return new Date(start.getFullYear(), start.getMonth() + 3, 0);
}

export function vatPeriods(
  config: TaxYearConfig,
  settings: VatSettings,
): VatPeriod[] {
  const yearStart = new Date(`${config.year_start}T00:00:00`);
  const yearEnd = new Date(`${config.year_end}T00:00:00`);
  let cursor = new Date(
    yearStart.getFullYear(),
    settings.quarter_start_month - 1,
    1,
  );
  while (cursor > yearStart)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 3, 1);
  while (periodEnd(cursor) < yearStart)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
  const periods: VatPeriod[] = [];
  while (periodEnd(cursor) <= yearEnd) {
    const end = periodEnd(cursor);
    const deadline = addDays(end, config.vat_payment_deadline_days);
    periods.push({
      start: dateValue(cursor),
      end: dateValue(end),
      label: `${format(cursor, "d MMM")} – ${format(end, "d MMM yyyy")}`,
      deadline: dateValue(deadline),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
  }
  return periods;
}

function inPeriod(date: string, period: VatPeriod) {
  return date >= period.start && date <= period.end;
}

export function applyVatAdjustments(
  period: VatPeriod,
  boxes: AdjustableBoxes,
  adjustments: VatAdjustment[],
) {
  const periodAdjustments = adjustments.filter((adjustment) =>
    inPeriod(adjustment.adjustment_date, period),
  );
  const total = (key: keyof AdjustableBoxes) =>
    periodAdjustments.reduce((sum, adjustment) => sum + adjustment[key], 0);
  const box1 = round(boxes.box1 + total("box1"));
  const box2 = round(boxes.box2 + total("box2"));
  const box4 = round(boxes.box4 + total("box4"));
  return {
    box1,
    box2,
    box3: round(box1 + box2),
    box4,
    box5: round(box1 + box2 - box4),
    box6: round(boxes.box6 + total("box6")),
    box7: round(boxes.box7 + total("box7")),
    box8: round(boxes.box8 + total("box8")),
    box9: round(boxes.box9 + total("box9")),
  };
}

function invoiceShare(row: InvoiceVatRow, amount: number) {
  if (row.total <= 0) return { net: 0, vat: 0, gross: 0 };
  return {
    net: (amount * row.subtotal) / row.total,
    vat: (amount * row.vat_amount) / row.total,
    gross: amount,
  };
}

export function calculateReturn(
  period: VatPeriod,
  profile: UserProfile,
  config: TaxYearConfig,
  invoices: InvoiceVatRow[],
  payments: PaymentVatRow[],
  credits: CreditVatRow[],
  purchases: PurchaseVatRow[],
  adjustments: VatAdjustment[] = [],
): VatReturnSummary {
  let salesNet = 0;
  let salesVat = 0;
  let salesGross = 0;
  let ecSales = 0;
  const cashScheme = profile.vat_scheme === "cash_accounting";

  if (cashScheme) {
    for (const payment of payments.filter((row) =>
      inPeriod(row.payment_date, period),
    )) {
      const share = invoiceShare(payment, payment.payment_amount);
      salesNet += share.net;
      salesVat += share.vat;
      salesGross += share.gross;
      if (payment.vat_ec_supply === 1) ecSales += share.net;
    }
  } else {
    for (const invoice of invoices.filter((row) =>
      inPeriod(row.issue_date, period),
    )) {
      salesNet += invoice.subtotal;
      salesVat += invoice.vat_amount;
      salesGross += invoice.total;
      if (invoice.vat_ec_supply === 1) ecSales += invoice.subtotal;
    }
  }

  const cashCreditAmounts = cashScheme
    ? recognisedCashCreditAmounts(
        payments.map((payment) => ({
          invoiceId: payment.id,
          date: payment.payment_date,
          amount: payment.payment_amount,
        })),
        credits.map((credit) => ({
          invoiceId: credit.id,
          date: credit.credit_date,
          amount: credit.credit_amount,
        })),
      )
    : [];
  credits.forEach((credit, index) => {
    if (!inPeriod(credit.credit_date, period)) return;
    const share = invoiceShare(
      credit,
      cashScheme ? cashCreditAmounts[index] : credit.credit_amount,
    );
    salesNet -= share.net;
    salesVat -= share.vat;
    salesGross -= share.gross;
    if (credit.vat_ec_supply === 1) ecSales -= share.net;
  });

  let purchaseNet = 0;
  let inputVat = 0;
  let acquisitionVat = 0;
  let ecPurchases = 0;
  let flatRateCapitalVat = 0;
  for (const purchase of purchases.filter((row) =>
    inPeriod(row.date, period),
  )) {
    const businessShare = purchase.business_percent / 100;
    const net =
      Math.max(0, purchase.amount - purchase.vat_amount) * businessShare;
    const vat = purchase.vat_amount * businessShare;
    purchaseNet += net;
    if (purchase.vat_ec_acquisition === 1) {
      const acquisition =
        vat > 0 ? vat : (net * config.vat_standard_rate_percent) / 100;
      acquisitionVat += acquisition;
      ecPurchases += net;
    } else {
      inputVat += vat;
      if (purchase.vat_capital_asset === 1 && purchase.amount >= 2000)
        flatRateCapitalVat += vat;
    }
  }

  const flatRate = Math.max(0, profile.vat_flat_rate_percent ?? 0);
  const flatRateVat = (salesGross * flatRate) / 100;
  const outputVat = profile.vat_scheme === "flat_rate" ? flatRateVat : salesVat;
  const reclaimableVat =
    profile.vat_scheme === "flat_rate"
      ? flatRateCapitalVat + acquisitionVat
      : inputVat + acquisitionVat;
  const box1 = round(outputVat);
  const box2 = round(Math.max(0, acquisitionVat));
  const box4 = round(Math.max(0, reclaimableVat));
  const box6 = round(
    profile.vat_scheme === "flat_rate" ? salesGross : salesNet,
  );
  const box7 = round(Math.max(0, purchaseNet));
  const adjusted = applyVatAdjustments(
    period,
    {
      box1,
      box2,
      box4,
      box6,
      box7,
      box8: ecSales,
      box9: Math.max(0, ecPurchases),
    },
    adjustments,
  );
  const standardNetVat = round(
    salesVat + acquisitionVat - inputVat - acquisitionVat,
  );
  const today = new Date();
  const deadline = new Date(`${period.deadline}T23:59:59`);

  return {
    ...period,
    ...adjusted,
    standardNetVat,
    flatRateDifference: round(standardNetVat - adjusted.box5),
    daysUntilDeadline: Math.ceil(
      (deadline.getTime() - today.getTime()) / 86400000,
    ),
    filedAt: null,
    filedReturnId: null,
  };
}

export function useVatOverview(taxYear: string) {
  return useQuery({
    queryKey: ["vat", taxYear],
    enabled: !!taxYear,
    queryFn: async (): Promise<VatOverview> => {
      const [
        profiles,
        configs,
        settingsRows,
        invoices,
        payments,
        credits,
        expenses,
        vehicleCosts,
        turnoverRows,
        snapshots,
        adjustments,
      ] = await Promise.all([
        query<UserProfile>("SELECT * FROM user_profile WHERE id = 1"),
        query<TaxYearConfig>(
          "SELECT * FROM tax_year_config WHERE tax_year = ?",
          [taxYear],
        ),
        query<VatSettings>("SELECT * FROM vat_settings WHERE id = 1"),
        query<InvoiceVatRow>(
          `SELECT id, issue_date, subtotal, vat_amount, total, vat_ec_supply FROM invoices WHERE deleted_at IS NULL AND is_quote = 0 AND (status NOT IN ('draft', 'cancelled') OR bad_debt_written_off = 1)`,
        ),
        query<PaymentVatRow>(
          `SELECT i.id, i.issue_date, i.subtotal, i.vat_amount, i.total, i.vat_ec_supply, p.payment_date, p.amount AS payment_amount FROM invoice_payments p INNER JOIN invoices i ON i.id = p.invoice_id WHERE i.deleted_at IS NULL AND i.is_quote = 0`,
        ),
        query<CreditVatRow>(
          `SELECT i.id, i.issue_date, i.subtotal, i.vat_amount, i.total, i.vat_ec_supply, c.issue_date AS credit_date, c.amount AS credit_amount FROM credit_notes c INNER JOIN invoices i ON i.id = c.invoice_id WHERE i.deleted_at IS NULL AND i.is_quote = 0`,
        ),
        query<PurchaseVatRow>(
          `SELECT date, amount, vat_amount, business_percent, vat_ec_acquisition, vat_capital_asset FROM expenses WHERE deleted_at IS NULL`,
        ),
        query<PurchaseVatRow>(
          `SELECT date, amount, vat_amount, business_percent, 0 AS vat_ec_acquisition, vat_capital_asset FROM vehicle_costs WHERE deleted_at IS NULL`,
        ),
        query<{ turnover: number }>(
          `SELECT COALESCE((SELECT SUM(subtotal) FROM invoices WHERE deleted_at IS NULL AND is_quote = 0 AND (status NOT IN ('draft', 'cancelled') OR bad_debt_written_off = 1) AND issue_date BETWEEN date('now', '-12 months') AND date('now')), 0) - COALESCE((SELECT SUM(c.amount * i.subtotal / NULLIF(i.total, 0)) FROM credit_notes c INNER JOIN invoices i ON i.id = c.invoice_id WHERE c.issue_date BETWEEN date('now', '-12 months') AND date('now') AND i.deleted_at IS NULL), 0) AS turnover`,
        ),
        query<VatReturnSnapshot>(
          "SELECT * FROM vat_return_snapshots WHERE tax_year = ?",
          [taxYear],
        ),
        query<VatAdjustment>(
          "SELECT * FROM vat_adjustments ORDER BY adjustment_date, id",
        ),
      ]);
      const profile = profiles[0];
      const config = configs[0];
      const settings = settingsRows[0];
      if (!profile || !config || !settings)
        throw new Error(`VAT configuration is unavailable for ${taxYear}.`);
      const periods = vatPeriods(config, settings);
      const rollingTurnover = round(turnoverRows[0]?.turnover ?? 0);
      return {
        profile,
        config,
        settings,
        rollingTurnover,
        thresholdPercent:
          config.vat_registration_threshold > 0
            ? (rollingTurnover / config.vat_registration_threshold) * 100
            : 0,
        returns: periods.map((period) => {
          const calculated = calculateReturn(
            period,
            profile,
            config,
            invoices,
            payments,
            credits,
            [...expenses, ...vehicleCosts],
            adjustments,
          );
          const snapshot = snapshots.find(
            (candidate) =>
              candidate.period_start === period.start &&
              candidate.period_end === period.end,
          );
          return snapshot
            ? {
                ...calculated,
                box1: snapshot.box1,
                box2: snapshot.box2,
                box3: snapshot.box3,
                box4: snapshot.box4,
                box5: snapshot.box5,
                box6: snapshot.box6,
                box7: snapshot.box7,
                box8: snapshot.box8,
                box9: snapshot.box9,
                filedAt: snapshot.filed_at,
                filedReturnId: snapshot.id,
              }
            : calculated;
        }),
      };
    },
  });
}

export function useVatAdjustments(filedReturnId: number | null) {
  return useQuery({
    queryKey: ["vat-adjustments", filedReturnId],
    enabled: filedReturnId !== null,
    queryFn: () =>
      query<VatAdjustment>(
        "SELECT * FROM vat_adjustments WHERE filed_return_id = ? ORDER BY adjustment_date, id",
        [filedReturnId],
      ),
  });
}

export function useCreateVatAdjustment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (adjustment: VatAdjustmentInput) =>
      execute(
        `INSERT INTO vat_adjustments (filed_return_id, adjustment_date, reason, box1, box2, box4, box6, box7, box8, box9)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adjustment.filed_return_id,
          adjustment.adjustment_date,
          adjustment.reason,
          adjustment.box1,
          adjustment.box2,
          adjustment.box4,
          adjustment.box6,
          adjustment.box7,
          adjustment.box8,
          adjustment.box9,
        ],
      ),
    onSuccess: (_result, adjustment) => {
      queryClient.invalidateQueries({ queryKey: ["vat"] });
      queryClient.invalidateQueries({
        queryKey: ["vat-adjustments", adjustment.filed_return_id],
      });
    },
  });
}

export function useFileVatReturn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      taxYear,
      scheme,
      vatReturn,
    }: {
      taxYear: string;
      scheme: string;
      vatReturn: VatReturnSummary;
    }) =>
      execute(
        `INSERT INTO vat_return_snapshots
       (period_start, period_end, tax_year, scheme, box1, box2, box3, box4, box5, box6, box7, box8, box9)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          vatReturn.start,
          vatReturn.end,
          taxYear,
          scheme,
          vatReturn.box1,
          vatReturn.box2,
          vatReturn.box3,
          vatReturn.box4,
          vatReturn.box5,
          vatReturn.box6,
          vatReturn.box7,
          vatReturn.box8,
          vatReturn.box9,
        ],
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vat"] }),
  });
}

export function useSaveVatSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      settings: Pick<
        VatSettings,
        "quarter_start_month" | "mtd_enabled" | "reminders_enabled"
      >,
    ) =>
      execute(
        `UPDATE vat_settings SET quarter_start_month = ?, mtd_enabled = ?, reminders_enabled = ?, updated_at = datetime('now') WHERE id = 1`,
        [
          settings.quarter_start_month,
          settings.mtd_enabled,
          settings.reminders_enabled,
        ],
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vat"] }),
  });
}

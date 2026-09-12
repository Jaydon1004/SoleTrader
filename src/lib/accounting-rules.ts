export type AccountingBasis = "cash" | "accrual";

interface VatProfile {
  vat_status: "unregistered" | "voluntary" | "compulsory";
  vat_scheme: "standard" | "flat_rate" | "cash_accounting";
  vat_flat_rate_percent: number | null;
}

interface NamedSale {
  name: string;
  gross: number;
  net: number;
}

export function taxableSaleAmount(
  gross: number,
  net: number,
  profile: VatProfile,
) {
  if (profile.vat_status === "unregistered") return gross;
  if (profile.vat_scheme === "flat_rate")
    return gross * (1 - (profile.vat_flat_rate_percent ?? 0) / 100);
  return net;
}

export function allowableExpenseAmount(
  gross: number,
  vat: number,
  businessPercent: number,
  vatCapitalAsset: boolean,
  profile: VatProfile,
) {
  const recoverableVat =
    profile.vat_status !== "unregistered" &&
    (profile.vat_scheme !== "flat_rate" || vatCapitalAsset)
      ? vat
      : 0;
  return (gross - recoverableVat) * (businessPercent / 100);
}

export function paidSupplierBillExpense(
  payment: number,
  grossBill: number,
  allowableBill: number,
) {
  if (payment <= 0 || grossBill <= 0 || allowableBill <= 0) return 0;
  return Math.min(allowableBill, (payment / grossBill) * allowableBill);
}

export function accrualAdjustmentExpense(
  type: "accrual" | "prepayment",
  amount: number,
  reversing = false,
) {
  const signed =
    type === "accrual" ? Math.max(0, amount) : -Math.max(0, amount);
  return reversing ? -signed : signed;
}

export function groupTaxableSales(rows: NamedSale[], profile: VatProfile) {
  const grouped = new Map<string, number>();
  for (const row of rows) {
    grouped.set(
      row.name,
      (grouped.get(row.name) ?? 0) +
        taxableSaleAmount(row.gross, row.net, profile),
    );
  }
  return [...grouped.entries()]
    .map(([name, amount]) => ({ name, amount: Number(amount.toFixed(2)) }))
    .sort((left, right) => right.amount - left.amount);
}

export function badDebtExpenseAmount(
  accountingBasis: AccountingBasis,
  unpaidBalance: number,
) {
  return accountingBasis === "accrual" ? Math.max(0, unpaidBalance) : 0;
}

interface CashPayment {
  invoiceId: number;
  date: string;
  amount: number;
}

interface CashCredit {
  invoiceId: number;
  date: string;
  amount: number;
}

export function recognisedCashCreditAmounts(
  payments: CashPayment[],
  credits: CashCredit[],
) {
  const recognised = Array.from({ length: credits.length }, () => 0);
  const previouslyCredited = new Map<number, number>();
  const orderedCredits = credits
    .map((credit, index) => ({ credit, index }))
    .sort(
      (left, right) =>
        left.credit.date.localeCompare(right.credit.date) ||
        left.index - right.index,
    );

  for (const { credit, index } of orderedCredits) {
    const paidToDate = payments
      .filter(
        (payment) =>
          payment.invoiceId === credit.invoiceId && payment.date <= credit.date,
      )
      .reduce((sum, payment) => sum + Math.max(0, payment.amount), 0);
    const available = Math.max(
      0,
      paidToDate - (previouslyCredited.get(credit.invoiceId) ?? 0),
    );
    const amount = Math.min(Math.max(0, credit.amount), available);
    recognised[index] = amount;
    previouslyCredited.set(
      credit.invoiceId,
      (previouslyCredited.get(credit.invoiceId) ?? 0) + amount,
    );
  }

  return recognised;
}

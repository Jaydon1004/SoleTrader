export interface ReviewableBankTransaction {
  id: number;
  transaction_date: string;
  amount_in: number;
  amount_out: number;
  status: "unmatched" | "matched" | "ignored";
}

export interface BankReviewSignal {
  ageDays: number;
  overdue: boolean;
  highValue: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function bankReviewSignal(
  transaction: ReviewableBankTransaction,
  today = new Date(),
): BankReviewSignal {
  const transactionTime = new Date(
    `${transaction.transaction_date}T00:00:00Z`,
  ).getTime();
  const todayTime = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const ageDays = Number.isFinite(transactionTime)
    ? Math.max(0, Math.floor((todayTime - transactionTime) / DAY_MS))
    : 0;
  return {
    ageDays,
    overdue: transaction.status === "unmatched" && ageDays > 30,
    highValue:
      transaction.status === "unmatched" &&
      Math.max(transaction.amount_in, transaction.amount_out) >= 1_000,
  };
}

export function prioritizeBankTransactions<T extends ReviewableBankTransaction>(
  transactions: T[],
  today = new Date(),
) {
  return [...transactions].sort((left, right) => {
    const leftSignal = bankReviewSignal(left, today);
    const rightSignal = bankReviewSignal(right, today);
    const leftOpen = left.status === "unmatched" ? 1 : 0;
    const rightOpen = right.status === "unmatched" ? 1 : 0;
    return (
      rightOpen - leftOpen ||
      Number(rightSignal.overdue) - Number(leftSignal.overdue) ||
      rightSignal.ageDays - leftSignal.ageDays ||
      Math.max(right.amount_in, right.amount_out) -
        Math.max(left.amount_in, left.amount_out) ||
      right.id - left.id
    );
  });
}

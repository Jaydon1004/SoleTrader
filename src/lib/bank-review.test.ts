import { describe, expect, it } from "vitest";
import {
  bankReviewSignal,
  prioritizeBankTransactions,
  type ReviewableBankTransaction,
} from "@/lib/bank-review";

const today = new Date("2026-09-12T12:00:00Z");
const transaction = (
  id: number,
  date: string,
  status: ReviewableBankTransaction["status"] = "unmatched",
  amount = 20,
): ReviewableBankTransaction => ({
  id,
  transaction_date: date,
  amount_in: amount,
  amount_out: 0,
  status,
});

describe("bank reconciliation review priority", () => {
  it("identifies overdue and high-value unresolved transactions", () => {
    expect(
      bankReviewSignal(transaction(1, "2026-08-01", "unmatched", 1_200), today),
    ).toEqual({
      ageDays: 42,
      overdue: true,
      highValue: true,
    });
    expect(
      bankReviewSignal(transaction(2, "2026-08-01", "matched", 1_200), today),
    ).toEqual({
      ageDays: 42,
      overdue: false,
      highValue: false,
    });
  });

  it("places the oldest unresolved work before resolved and recent items", () => {
    const rows = [
      transaction(1, "2026-09-10"),
      transaction(2, "2026-07-01"),
      transaction(3, "2026-06-01", "matched"),
      transaction(4, "2026-08-01"),
    ];

    expect(
      prioritizeBankTransactions(rows, today).map((row) => row.id),
    ).toEqual([2, 4, 1, 3]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });
});

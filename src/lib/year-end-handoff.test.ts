import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/database", () => mocks);

import {
  emptyYearEndHandoff,
  loadYearEndHandoff,
  saveBankYearEndConfirmation,
  saveYearEndHandoff,
} from "@/lib/year-end-handoff";

describe("year-end handoff data", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns defaults and active bank accounts for a new tax year", async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        tax_year: "2025/26",
        bank_account_id: 1,
        account_name: "Main account",
        confirmed_complete: 0,
      },
    ]);

    const data = await loadYearEndHandoff("2025/26");

    expect(data.details).toEqual(emptyYearEndHandoff("2025/26"));
    expect(data.bankConfirmations).toHaveLength(1);
  });

  it("upserts declarations and bank confirmations", async () => {
    const details = {
      ...emptyYearEndHandoff("2025/26"),
      stock_value: 500,
      questionnaire_complete: 1,
    };
    await saveYearEndHandoff(details);
    await saveBankYearEndConfirmation({
      tax_year: "2025/26",
      bank_account_id: 1,
      account_name: "Main account",
      account_type: "current",
      statement_start: "2025-04-06",
      statement_end: "2026-04-05",
      closing_balance: 1200,
      confirmed_complete: 1,
      notes: "",
      updated_at: null,
    });

    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.execute.mock.calls[0][0]).toContain(
      "INSERT INTO year_end_handoff_details",
    );
    expect(mocks.execute.mock.calls[1][0]).toContain(
      "INSERT INTO bank_year_end_confirmations",
    );
  });
});

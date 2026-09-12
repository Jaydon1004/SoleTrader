import { describe, expect, it } from "vitest";
import {
  normalizeBankDescription,
  suggestBankClassifications,
  type ClassifierTransaction,
} from "@/lib/bank-classifier";

const row = (
  id: number,
  description: string,
  classification = "unclassified",
  incoming = false,
): ClassifierTransaction => ({
  id,
  description,
  amount_in: incoming ? 100 : 0,
  amount_out: incoming ? 0 : 100,
  classification,
  status: classification === "unclassified" ? "unmatched" : "matched",
  match_confidence: classification === "unclassified" ? "" : "manual",
});

describe("bank auto-classifier", () => {
  it("normalizes variable bank dates, card references and wallet text", () => {
    expect(
      normalizeBankDescription(
        "SUN INN (VIA APPLE PAY), ON 31-07-2026 CARD 12345678",
      ),
    ).toBe("sun inn");
  });

  it("applies an unambiguous enabled rule before learned history", () => {
    expect(
      suggestBankClassifications(
        [row(1, "TRANSFER FROM SAVINGS", "unclassified", true)],
        [],
        [
          {
            description_pattern: "TRANSFER FROM",
            classification: "transfer",
            enabled: 1,
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        transactionId: 1,
        classification: "transfer",
        confidence: "rule",
      }),
    ]);
  });

  it("applies account-scoped rules only to the intended account use", () => {
    const personalRule = {
      description_pattern: "BELLA PIZZA",
      classification: "ignored" as const,
      account_use: "personal" as const,
      enabled: 1,
    };
    expect(
      suggestBankClassifications(
        [{ ...row(1, "BELLA PIZZA"), account_use: "business" }],
        [],
        [personalRule],
      ),
    ).toEqual([]);
    expect(
      suggestBankClassifications(
        [{ ...row(2, "BELLA PIZZA"), account_use: "personal" }],
        [],
        [personalRule],
      ),
    ).toEqual([
      expect.objectContaining({ transactionId: 2, classification: "ignored" }),
    ]);
  });

  it("learns only from two or more unanimous manual decisions", () => {
    const target = row(3, "SUN INN VIA APPLE PAY ON 29-08-2026");
    const consistent = [
      row(1, "SUN INN VIA APPLE PAY ON 01-08-2026", "ignored"),
      row(2, "SUN INN VIA APPLE PAY ON 08-08-2026", "ignored"),
    ];
    expect(suggestBankClassifications([target], consistent, [])).toEqual([
      expect.objectContaining({
        classification: "ignored",
        confidence: "learned",
      }),
    ]);
    expect(
      suggestBankClassifications([target], consistent.slice(0, 1), []),
    ).toEqual([]);
    expect(
      suggestBankClassifications(
        [target],
        [...consistent, row(4, "SUN INN", "owner_withdrawal")],
        [],
      ),
    ).toEqual([]);
  });

  it("keeps personal-account learning separate from business accounts", () => {
    const personalHistory = [
      { ...row(1, "BELLA PIZZA", "ignored"), account_use: "personal" as const },
      { ...row(2, "BELLA PIZZA", "ignored"), account_use: "personal" as const },
    ];
    expect(
      suggestBankClassifications(
        [{ ...row(3, "BELLA PIZZA"), account_use: "business" }],
        personalHistory,
        [],
      ),
    ).toEqual([]);
    expect(
      suggestBankClassifications(
        [{ ...row(4, "BELLA PIZZA"), account_use: "personal" }],
        personalHistory,
        [],
      ),
    ).toEqual([
      expect.objectContaining({
        transactionId: 4,
        classification: "ignored",
        confidence: "learned",
      }),
    ]);
  });

  it("rejects conflicting rules and impossible money directions", () => {
    const incoming = row(1, "OWNER", "unclassified", true);
    expect(
      suggestBankClassifications(
        [incoming],
        [],
        [
          {
            description_pattern: "OWNER",
            classification: "owner_contribution",
            enabled: 1,
          },
          {
            description_pattern: "OWNER",
            classification: "transfer",
            enabled: 1,
          },
        ],
      ),
    ).toEqual([]);
    expect(
      suggestBankClassifications(
        [incoming],
        [],
        [
          {
            description_pattern: "OWNER",
            classification: "owner_withdrawal",
            enabled: 1,
          },
        ],
      ),
    ).toEqual([]);
  });
});

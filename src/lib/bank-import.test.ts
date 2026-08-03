import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  checkBankBalances,
  decodeBankStatement,
  findBankMatch,
  mapBankRows,
  parseBankAmount,
  parseBankDate,
  parseBankStatement,
  suggestBankMapping,
} from "@/lib/bank-import";

describe("bank CSV normalization", () => {
  it("preserves generated signed penny amounts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100_000_000, max: 100_000_000 }),
        (pence) => {
          const formatted = (pence / 100).toFixed(2);
          expect(parseBankAmount(formatted)).toBe(pence / 100);
          expect(parseBankAmount(`£${formatted}`)).toBe(pence / 100);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("detects common UK bank columns and normalizes rows", () => {
    const mapping = suggestBankMapping([
      "Transaction Date",
      "Narrative",
      "Money In",
      "Money Out",
      "Balance",
    ]);
    expect(mapping).toMatchObject({
      date: "Transaction Date",
      description: "Narrative",
      amountIn: "Money In",
      amountOut: "Money Out",
    });
    const rows = mapBankRows(
      [
        {
          "Transaction Date": "06/04/2025",
          Narrative: "Client payment",
          "Money In": "£1,234.50",
          "Money Out": "",
          Balance: "2,000.00",
        },
      ],
      mapping,
    );
    expect(rows[0]).toMatchObject({
      transactionDate: "2025-04-06",
      amountIn: 1234.5,
      amountOut: 0,
      taxYear: "2025/26",
      error: "",
    });
  });

  it("supports signed amount columns, parentheses, and rejects invalid dates", () => {
    expect(parseBankAmount("(52.10)")).toBe(-52.1);
    expect(parseBankDate("31/02/2026")).toBe("");
    const rows = mapBankRows(
      [{ Date: "01-03-2026", Memo: "Supplier", Amount: "-52.10" }],
      {
        date: "Date",
        description: "Memo",
        amount: "Amount",
        amountIn: "",
        amountOut: "",
        balance: "",
      },
    );
    expect(rows[0]).toMatchObject({
      amountIn: 0,
      amountOut: 52.1,
      taxYear: "2025/26",
      error: "",
    });
  });

  it("parses Santander labelled text with replacement characters and currency suffixes", () => {
    const statement = `From:\ufffd01/02/2026\ufffdto\ufffd01/08/2026
Account:\ufffdXXXX XXXX XXXX 6053

Date:\ufffd01/08/2026
Description:\ufffdSUN INN (VIA APPLE PAY), ON 31-07-2026
Amount:\ufffd-12.10\ufffd
Balance:\ufffd1514.49\ufffd

Date:\ufffd31/05/2026
Description:\ufffdSUMUP *JUST BAKE IT (VIA APPLE PAY), ON 30-05-2026
Amount:\ufffd-12.20\ufffdGBP
Balance:\ufffd717.46\ufffdGBP`;
    const parsed = parseBankStatement(statement);
    const mapping = suggestBankMapping(parsed.headers);
    const rows = mapBankRows(parsed.rows, mapping);
    expect(parsed.format).toBe("labelled text");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      transactionDate: "2026-08-01",
      description: "SUN INN (VIA APPLE PAY), ON 31-07-2026",
      amountIn: 0,
      amountOut: 12.1,
      balance: 1514.49,
      error: "",
    });
    expect(rows[1]).toMatchObject({
      transactionDate: "2026-05-31",
      amountOut: 12.2,
      balance: 717.46,
      error: "",
    });
  });

  it("finds a headed CSV after bank metadata preamble", () => {
    const parsed = parseBankStatement(
      "Account,12345678\nGenerated,01/08/2026\nDate,Description,Amount,Balance\n01/08/2026,Client payment,125.50,400.00",
    );
    const rows = mapBankRows(parsed.rows, suggestBankMapping(parsed.headers));
    expect(parsed.format).toBe("CSV");
    expect(rows[0]).toMatchObject({
      transactionDate: "2026-08-01",
      amountIn: 125.5,
      balance: 400,
      error: "",
    });
  });

  it("normalizes common QIF and OFX exports", () => {
    const qif = parseBankStatement(
      "!Type:Bank\nD01/08/2026\nT-12.10\nPSUN INN\n^\n",
    );
    expect(
      mapBankRows(qif.rows, suggestBankMapping(qif.headers))[0],
    ).toMatchObject({ amountOut: 12.1, error: "" });
    const ofx = parseBankStatement(
      "<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260801120000<TRNAMT>125.50<NAME>Client payment</STMTTRN></BANKTRANLIST></OFX>",
    );
    expect(
      mapBankRows(ofx.rows, suggestBankMapping(ofx.headers))[0],
    ).toMatchObject({
      transactionDate: "2026-08-01",
      amountIn: 125.5,
      error: "",
    });
  });

  it("decodes UTF-16 statements and audits ascending or descending balances", () => {
    const source =
      "Date,Description,Amount,Balance\n01/08/2026,Newest,-10.00,90.00\n31/07/2026,Older,20.00,100.00";
    const encoded = new Uint8Array(2 + source.length * 2);
    encoded.set([0xff, 0xfe]);
    for (let index = 0; index < source.length; index += 1) {
      encoded[index * 2 + 2] = source.charCodeAt(index);
    }
    const parsed = parseBankStatement(decodeBankStatement(encoded));
    const rows = mapBankRows(parsed.rows, suggestBankMapping(parsed.headers));
    expect(checkBankBalances(rows)).toEqual({
      checked: 1,
      mismatches: 0,
      order: "unknown",
    });
    const third = mapBankRows(
      [
        {
          Date: "30/07/2026",
          Description: "Oldest",
          Amount: "5.00",
          Balance: "80.00",
        },
      ],
      suggestBankMapping(parsed.headers),
    )[0];
    expect(checkBankBalances([...rows, third])).toEqual({
      checked: 2,
      mismatches: 0,
      order: "descending",
    });
  });
});

describe("bank matching", () => {
  const candidates = [
    { id: 1, recordId: 10, date: "2026-03-01", amount: 100, label: "INV-10" },
    { id: 2, recordId: 11, date: "2026-03-03", amount: 100, label: "INV-11" },
  ];

  it("returns the unique closest amount/date candidate", () => {
    expect(findBankMatch("2026-03-01", 100, candidates, 3, 0.01)).toMatchObject(
      { id: 1, confidence: "exact" },
    );
  });

  it("leaves equally ranked candidates unmatched", () => {
    expect(findBankMatch("2026-03-02", 100, candidates, 3, 0.01)).toBeNull();
  });
});

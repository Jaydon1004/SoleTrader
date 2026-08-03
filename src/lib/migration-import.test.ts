import { describe, expect, it } from "vitest";
import {
  mapMigrationRows,
  suggestMigrationMapping,
} from "@/lib/migration-import";

describe("spreadsheet migration mapping", () => {
  it("suggests client columns and validates names", () => {
    const mapping = suggestMigrationMapping("clients", [
      "Client Name",
      "Company",
      "E-mail",
      "Post Code",
    ]);
    expect(mapping).toMatchObject({
      name: "Client Name",
      company: "Company",
      email: "E-mail",
      postcode: "Post Code",
    });
    expect(
      mapMigrationRows(
        "clients",
        [
          {
            "Client Name": "Jane Smith",
            Company: "Smith Ltd",
            "Post Code": "sw1a 1aa",
          },
        ],
        mapping,
      )[0],
    ).toMatchObject({
      values: { name: "Jane Smith", postcode: "SW1A 1AA" },
      error: "",
    });
  });

  it("normalises historical expenses and rejects invalid rows", () => {
    const mapping = suggestMigrationMapping("expenses", [
      "Expense Date",
      "Vendor",
      "Details",
      "Gross",
      "VAT",
      "Business %",
      "Category",
    ]);
    const rows = mapMigrationRows(
      "expenses",
      [
        {
          "Expense Date": "06/04/2025",
          Vendor: "Stationery Co",
          Details: "Printer paper",
          Gross: "£24.00",
          VAT: "4",
          "Business %": "100",
          Category: "Office costs",
        },
      ],
      mapping,
    );
    expect(rows[0]).toMatchObject({
      values: { date: "2025-04-06", amount: 24, vat: 4, taxYear: "2025/26" },
      error: "",
    });
    expect(
      mapMigrationRows(
        "expenses",
        [{ "Expense Date": "bad", Details: "", Gross: "0" }],
        mapping,
      )[0].error,
    ).toContain("Invalid date");
  });
});

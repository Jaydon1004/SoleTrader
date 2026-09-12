import { describe, expect, it } from "vitest";
import {
  mapMigrationRows,
  migrationTemplateCsv,
  suggestMigrationMapping,
} from "@/lib/migration-import";

describe("spreadsheet migration mapping", () => {
  it("creates templates whose headers map without manual intervention", () => {
    for (const kind of ["clients", "expenses", "income"] as const) {
      const headers = migrationTemplateCsv(kind).split("\r\n")[0].split(",");
      const mapping = suggestMigrationMapping(kind, headers);
      expect(Object.values(mapping).filter(Boolean).length).toBe(
        headers.length,
      );
    }
  });

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

  it("maps historical direct income into the correct tax year", () => {
    const mapping = suggestMigrationMapping("income", [
      "Payment date",
      "Description",
      "Gross",
      "VAT",
      "Payment method",
    ]);
    const row = mapMigrationRows(
      "income",
      [
        {
          "Payment date": "05/04/2026",
          Description: "Completed job",
          Gross: "£120.00",
          VAT: "20",
          "Payment method": "Bank transfer",
        },
      ],
      mapping,
    )[0];
    expect(row).toMatchObject({
      values: { date: "2026-04-05", amount: 120, vat: 20, taxYear: "2025/26" },
      error: "",
    });
  });
});

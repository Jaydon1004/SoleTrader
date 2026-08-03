import { describe, expect, it } from "vitest";
import { buildReportPdf, reportCsvText } from "@/lib/report-export";

describe("report PDF export", () => {
  it("builds a paginated PDF document", () => {
    const bytes = buildReportPdf([
      {
        title: "Accountant report",
        subtitle: "2025/26 test business",
        sections: [
          {
            title: "Transactions",
            columns: ["Date", "Description", "Amount"],
            rows: Array.from({ length: 100 }, (_, index) => [
              "2026-04-05",
              `Transaction ${index + 1}`,
              `£${index}.00`,
            ]),
          },
        ],
      },
    ]);

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF");
    expect(bytes.length).toBeGreaterThan(5_000);
  });
});

describe("report CSV export", () => {
  it("escapes values that spreadsheet applications could execute as formulas", () => {
    const csv = reportCsvText({
      title: "Transactions",
      subtitle: "Formula safety",
      sections: [
        {
          title: "Rows",
          columns: ["Description"],
          rows: [['=HYPERLINK("https://example.test")']],
        },
      ],
    });

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toContain('"=HYPERLINK');
  });
});

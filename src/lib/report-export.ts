import { open, save } from "@tauri-apps/plugin-dialog";
import { writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { jsPDF } from "jspdf";
import Papa from "papaparse";
import { query } from "@/lib/database";

export type ReportCell = string | number;

export interface ReportSection {
  title: string;
  columns: string[];
  rows: ReportCell[][];
  totalRow?: ReportCell[];
}

export interface ReportDocument {
  title: string;
  subtitle: string;
  sections: ReportSection[];
}

const safeName = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function reportCsvText(report: ReportDocument) {
  const parts = [[report.title, report.subtitle].join("\n")];
  for (const section of report.sections) {
    parts.push(
      Papa.unparse(
        [
          [section.title],
          section.columns,
          ...section.rows,
          ...(section.totalRow ? [section.totalRow] : []),
        ],
        { escapeFormulae: true },
      ),
    );
  }
  return parts.join("\n\n");
}

function addPageHeader(
  doc: jsPDF,
  report: ReportDocument,
  continuation = false,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(continuation ? 14 : 20);
  doc.text(report.title, 15, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(
    continuation ? `${report.subtitle} (continued)` : report.subtitle,
    15,
    continuation ? 23 : 24,
  );
  doc.setTextColor(0);
  return continuation ? 31 : 34;
}

export function buildReportPdf(reports: ReportDocument[]) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  reports.forEach((report, reportIndex) => {
    if (reportIndex > 0) doc.addPage();
    let y = addPageHeader(doc, report);
    for (const section of report.sections) {
      if (y > 255) {
        doc.addPage();
        y = addPageHeader(doc, report, true);
      }
      doc.setFillColor(235, 239, 242);
      doc.rect(15, y - 5, 180, 8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(section.title, 18, y);
      y += 9;
      const columnWidth = 180 / Math.max(1, section.columns.length);
      doc.setFontSize(8);
      section.columns.forEach((column, index) =>
        doc.text(column, 16 + index * columnWidth, y, {
          maxWidth: columnWidth - 3,
        }),
      );
      y += 5;
      doc.setFont("helvetica", "normal");
      for (const row of [
        ...section.rows,
        ...(section.totalRow ? [section.totalRow] : []),
      ]) {
        const cellLines = row.map(
          (cell) =>
            doc.splitTextToSize(String(cell), columnWidth - 3) as string[],
        );
        const rowHeight = Math.max(
          6,
          ...cellLines.map((lines) => lines.length * 4),
        );
        if (y + rowHeight > 282) {
          doc.addPage();
          y = addPageHeader(doc, report, true);
          doc.setFont("helvetica", "bold");
          section.columns.forEach((column, index) =>
            doc.text(column, 16 + index * columnWidth, y, {
              maxWidth: columnWidth - 3,
            }),
          );
          doc.setFont("helvetica", "normal");
          y += 5;
        }
        cellLines.forEach((lines, index) =>
          doc.text(lines, 16 + index * columnWidth, y),
        );
        y += rowHeight;
        doc.setDrawColor(230);
        doc.line(15, y - 2, 195, y - 2);
      }
      if (section.rows.length === 0) {
        doc.setTextColor(110);
        doc.text("No records", 16, y);
        doc.setTextColor(0);
        y += 7;
      }
      y += 5;
    }
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(`Generated ${new Date().toLocaleString("en-GB")}`, 15, 290);
    doc.setTextColor(0);
  });
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function saveReportCsv(report: ReportDocument) {
  const destination = await save({
    defaultPath: `${safeName(report.title)}.csv`,
    filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
  });
  if (!destination) return false;
  await writeTextFile(destination, reportCsvText(report));
  return true;
}

export async function saveReportPdf(
  reports: ReportDocument[],
  defaultName: string,
) {
  const destination = await save({
    defaultPath: `${safeName(defaultName)}.pdf`,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (!destination) return false;
  await writeFile(destination, buildReportPdf(reports));
  return true;
}

export async function exportFullBackup() {
  const directory = await open({
    directory: true,
    multiple: false,
    title: "Choose backup folder",
  });
  if (!directory || Array.isArray(directory)) return false;
  const tables = await query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const { name } of tables) {
    const quotedName = `"${name.replace(/"/g, '""')}"`;
    data[name] = await query<Record<string, unknown>>(
      `SELECT * FROM ${quotedName}`,
    );
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const separator = directory.includes("\\") ? "\\" : "/";
  await writeTextFile(
    `${directory}${separator}soletrader-backup-${stamp}.json`,
    JSON.stringify(
      { exportedAt: new Date().toISOString(), tables: data },
      null,
      2,
    ),
  );
  for (const [name, rows] of Object.entries(data)) {
    await writeTextFile(
      `${directory}${separator}${name}.csv`,
      Papa.unparse(rows, { escapeFormulae: true }),
    );
  }
  return true;
}

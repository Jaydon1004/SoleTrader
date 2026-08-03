import { jsPDF } from "jspdf";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import { getActiveWorkspaceId } from "@/lib/database";
import { save } from "@tauri-apps/plugin-dialog";
import type { InvoiceDetail } from "@/lib/queries/invoices";
import type { InvoiceSettings, UserProfile } from "@/types/database";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

function addText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth?: number,
) {
  const lines = maxWidth ? doc.splitTextToSize(text, maxWidth) : [text];
  doc.text(lines, x, y);
  return y + lines.length * 5;
}

export function buildInvoicePdf(
  invoice: InvoiceDetail,
  profile: UserProfile | null,
  settings: InvoiceSettings | null,
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const isQuote = invoice.is_quote === 1;
  const title = isQuote ? "QUOTE" : "INVOICE";
  const businessName =
    profile?.trading_name ||
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    "SoleTrader";

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(businessName, 18, 22);
  doc.setFontSize(26);
  doc.text(title, 192, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let businessY = 30;
  const businessAddress = [
    profile?.address_line_1,
    profile?.address_line_2,
    profile?.city,
    profile?.county,
    profile?.postcode,
  ].filter(Boolean);
  for (const line of businessAddress) {
    doc.text(String(line), 18, businessY);
    businessY += 4;
  }
  if (profile?.email) {
    businessY += 1;
    doc.text(profile.email, 18, businessY);
  }
  if (profile?.phone) {
    businessY += 4;
    doc.text(profile.phone, 18, businessY);
  }
  if (profile?.vat_number) {
    businessY += 4;
    doc.text(`VAT No: ${profile.vat_number}`, 18, businessY);
  }

  doc.setFont("helvetica", "bold");
  doc.text(`${title === "QUOTE" ? "Quote" : "Invoice"} number`, 132, 34);
  doc.text("Issue date", 132, 40);
  doc.text(isQuote ? "Valid until" : "Due date", 132, 46);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number, 192, 34, { align: "right" });
  doc.text(invoice.issue_date, 192, 40, { align: "right" });
  doc.text(invoice.due_date, 192, 46, { align: "right" });

  doc.setDrawColor(210);
  doc.line(18, 58, 192, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(isQuote ? "Prepared for" : "Bill to", 18, 66);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let clientY = 72;
  doc.text(invoice.client_company || invoice.client_name, 18, clientY);
  if (invoice.client_company) {
    clientY += 5;
    doc.text(invoice.client_name, 18, clientY);
  }
  const clientAddress = [
    invoice.client_address_line_1,
    invoice.client_address_line_2,
    invoice.client_city,
    invoice.client_county,
    invoice.client_postcode,
  ].filter(Boolean);
  for (const line of clientAddress) {
    clientY += 5;
    doc.text(line, 18, clientY);
  }
  if (invoice.client_email) {
    clientY += 5;
    doc.text(invoice.client_email, 18, clientY);
  }

  let y = 90;
  doc.setFillColor(242, 244, 247);
  doc.rect(18, y - 6, 174, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.text("Description", 21, y);
  doc.text("Qty", 128, y, { align: "right" });
  doc.text("Rate", 154, y, { align: "right" });
  doc.text("Amount", 189, y, { align: "right" });
  y += 9;

  doc.setFont("helvetica", "normal");
  for (const item of invoice.line_items) {
    if (y > 245) {
      doc.addPage();
      y = 22;
    }
    y = addText(doc, item.description, 21, y, 90);
    doc.text(String(item.quantity), 128, y - 5, { align: "right" });
    doc.text(money.format(item.unit_price), 154, y - 5, { align: "right" });
    doc.text(money.format(item.line_total), 189, y - 5, { align: "right" });
    if (item.vat_rate !== null && item.vat_rate > 0) {
      doc.setFontSize(8);
      doc.text(`VAT ${item.vat_rate}%`, 21, y);
      doc.setFontSize(9);
      y += 4;
    }
    doc.setDrawColor(235);
    doc.line(18, y, 192, y);
    y += 7;
  }

  y = Math.max(y + 4, 145);
  doc.text("Subtotal", 154, y, { align: "right" });
  doc.text(money.format(invoice.subtotal), 189, y, { align: "right" });
  y += 6;
  if (invoice.vat_amount > 0) {
    doc.text("VAT", 154, y, { align: "right" });
    doc.text(money.format(invoice.vat_amount), 189, y, { align: "right" });
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Total", 154, y, { align: "right" });
  doc.text(money.format(invoice.total), 189, y, { align: "right" });
  doc.setFontSize(9);

  if (invoice.notes) {
    doc.setFont("helvetica", "bold");
    doc.text("Notes", 18, y + 16);
    doc.setFont("helvetica", "normal");
    addText(doc, invoice.notes, 18, y + 22, 105);
  }

  if (
    !isQuote &&
    settings &&
    (settings.account_name || settings.account_number)
  ) {
    let bankY = y + 42;
    doc.setFont("helvetica", "bold");
    doc.text("Payment details", 18, bankY);
    doc.setFont("helvetica", "normal");
    bankY += 6;
    if (settings.bank_name) doc.text(settings.bank_name, 18, bankY);
    if (settings.account_name) {
      bankY += 5;
      doc.text(`Account: ${settings.account_name}`, 18, bankY);
    }
    if (settings.sort_code) {
      bankY += 5;
      doc.text(`Sort code: ${settings.sort_code}`, 18, bankY);
    }
    if (settings.account_number) {
      bankY += 5;
      doc.text(`Account number: ${settings.account_number}`, 18, bankY);
    }
  }

  if (settings?.footer_text) {
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(settings.footer_text, 105, 286, {
      align: "center",
      maxWidth: 170,
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

export async function archiveInvoicePdf(
  invoice: InvoiceDetail,
  profile: UserProfile | null,
  settings: InvoiceSettings | null,
) {
  const bytes = buildInvoicePdf(invoice, profile, settings);
  const relativePath = `invoice-archive/${invoice.invoice_number}.pdf`;
  await invoke("write_workspace_file", {
    input: {
      workspaceId: getActiveWorkspaceId(),
      relativePath,
      bytes: Array.from(bytes),
    },
  });
  return relativePath;
}

export async function saveInvoicePdf(
  invoice: InvoiceDetail,
  profile: UserProfile | null,
  settings: InvoiceSettings | null,
) {
  const destination = await save({
    defaultPath: `${invoice.invoice_number}.pdf`,
    filters: [{ name: "PDF document", extensions: ["pdf"] }],
  });
  if (!destination) return false;
  await writeFile(destination, buildInvoicePdf(invoice, profile, settings));
  return true;
}

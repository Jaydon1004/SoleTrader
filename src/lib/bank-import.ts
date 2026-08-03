import Papa from "papaparse";

export interface BankColumnMapping {
  date: string;
  description: string;
  amountIn: string;
  amountOut: string;
  amount: string;
  balance: string;
}

export interface BankImportRow {
  rowNumber: number;
  transactionDate: string;
  description: string;
  amountIn: number;
  amountOut: number;
  balance: number | null;
  taxYear: string;
  fingerprint: string;
  rawData: string;
  error: string;
}

export interface MatchCandidate {
  id: number;
  recordId: number;
  date: string;
  amount: number;
  label: string;
}

export interface MatchResult extends MatchCandidate {
  confidence: "exact" | "near";
}

export interface ParsedBankStatement {
  headers: string[];
  rows: Record<string, string>[];
  errors: string[];
  format: "CSV" | "TSV" | "labelled text" | "QIF" | "OFX";
}

export interface BankBalanceCheck {
  checked: number;
  mismatches: number;
  order: "ascending" | "descending" | "unknown";
}

const cleanHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function findHeader(headers: string[], patterns: RegExp[]) {
  return (
    headers.find((header) =>
      patterns.some((pattern) => pattern.test(cleanHeader(header))),
    ) ?? ""
  );
}

export function suggestBankMapping(headers: string[]): BankColumnMapping {
  const amountIn = findHeader(headers, [
    /money in|paid in|credit amount|credits?|deposit|receipts?/,
  ]);
  const amountOut = findHeader(headers, [
    /money out|paid out|debit amount|debits?|withdrawal|payments?/,
  ]);
  return {
    date: findHeader(headers, [
      /^date$/,
      /transaction date|booking date|posted date|value date/,
    ]),
    description: findHeader(headers, [
      /description|transaction details|narrative|reference|merchant|payee|memo/,
    ]),
    amountIn,
    amountOut,
    amount:
      amountIn || amountOut
        ? ""
        : findHeader(headers, [/^amount$|transaction amount/]),
    balance: findHeader(headers, [/balance|running balance/]),
  };
}

export function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
  });
  const headers = parsed.meta.fields ?? [];
  return {
    headers,
    rows: parsed.data,
    errors: parsed.errors.map(
      (error) => `Row ${error.row ?? "?"}: ${error.message}`,
    ),
  };
}

const statementValue = (value: string) =>
  value
    .split("\u0000")
    .join("")
    .replace(/[\u00a0\ufffd]/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&pound;/gi, "£")
    .replace(/\s+/g, " ")
    .trim();

function parseLabelledStatement(text: string): ParsedBankStatement | null {
  const rows: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  const finish = () => {
    if (current.Date || current.Description || current.Amount)
      rows.push(current);
    current = {};
  };
  const fields = [
    ...text.matchAll(
      /(?:^|\s)(Date|Description|Amount|Balance)\s*:\s*([\s\S]*?)(?=(?:\s+(?:Date|Description|Amount|Balance)\s*:)|$)/gi,
    ),
  ];
  for (const match of fields) {
    const field = `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}`;
    if (field === "Date" && current.Date) finish();
    current[field] = statementValue(match[2]);
  }
  finish();
  if (
    !rows.length ||
    rows.filter((row) => row.Date && row.Description && row.Amount).length <
      Math.ceil(rows.length * 0.8)
  )
    return null;
  return {
    headers: ["Date", "Description", "Amount", "Balance"],
    rows,
    errors: [],
    format: "labelled text",
  };
}

function parseQif(text: string): ParsedBankStatement | null {
  if (!/^!Type:/im.test(text) || !/^D.+/m.test(text)) return null;
  const rows = text
    .split(/^\^\s*$/m)
    .map((record) => {
      const fields: Record<string, string> = {};
      for (const line of record.split(/\r?\n/)) {
        const code = line[0];
        const value = statementValue(line.slice(1));
        if (code === "D") fields.Date = value;
        else if (code === "T") fields.Amount = value;
        else if (code === "P") fields.Description = value;
        else if (code === "M" && !fields.Description)
          fields.Description = value;
      }
      return fields;
    })
    .filter((row) => row.Date || row.Amount || row.Description);
  if (!rows.length) return null;
  return {
    headers: ["Date", "Description", "Amount"],
    rows,
    errors: [],
    format: "QIF",
  };
}

function ofxTag(block: string, tag: string) {
  return statementValue(
    block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, "i"))?.[1] ?? "",
  );
}

function parseOfx(text: string): ParsedBankStatement | null {
  if (!/<OFX>/i.test(text) && !/<STMTTRN>/i.test(text)) return null;
  const blocks =
    text.match(
      /<STMTTRN>[\s\S]*?(?:<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi,
    ) ?? [];
  const rows = blocks
    .map((block) => ({
      Date: ofxTag(block, "DTPOSTED").slice(0, 8),
      Description: [ofxTag(block, "NAME"), ofxTag(block, "MEMO")]
        .filter(Boolean)
        .join(" - "),
      Amount: ofxTag(block, "TRNAMT"),
    }))
    .filter((row) => row.Date || row.Amount || row.Description);
  if (!rows.length) return null;
  return {
    headers: ["Date", "Description", "Amount"],
    rows,
    errors: [],
    format: "OFX",
  };
}

function parseDelimitedStatement(text: string): ParsedBankStatement | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const candidates = [",", "\t", ";", "|"];
  for (
    let lineIndex = 0;
    lineIndex < Math.min(lines.length, 50);
    lineIndex += 1
  ) {
    for (const delimiter of candidates) {
      const values =
        Papa.parse<string[]>(lines[lineIndex], { delimiter }).data[0] ?? [];
      const headers = values.map((value) => cleanHeader(String(value)));
      const hasDate = headers.some((header) => /(^| )date($| )/.test(header));
      const hasDescription = headers.some((header) =>
        /description|details|narrative|reference|merchant|payee|memo/.test(
          header,
        ),
      );
      const hasAmount = headers.some((header) =>
        /amount|money in|money out|credit|debit|paid in|paid out|withdrawal|payment/.test(
          header,
        ),
      );
      if (!hasDate || !hasDescription || !hasAmount) continue;
      const parsed = Papa.parse<Record<string, string>>(
        lines.slice(lineIndex).join("\n"),
        {
          delimiter,
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (header) => statementValue(header),
          transform: (value) => statementValue(value),
        },
      );
      return {
        headers: parsed.meta.fields ?? [],
        rows: parsed.data,
        errors: parsed.errors.map(
          (error) => `Row ${error.row ?? "?"}: ${error.message}`,
        ),
        format: delimiter === "\t" ? "TSV" : "CSV",
      };
    }
  }
  return null;
}

export function parseBankStatement(text: string): ParsedBankStatement {
  const normalized = text.replace(/\r\n/g, "\n");
  const parsed =
    parseOfx(normalized) ??
    parseQif(normalized) ??
    parseLabelledStatement(normalized) ??
    parseDelimitedStatement(normalized);
  if (!parsed)
    throw new Error(
      "Statement format was not recognised. Export a CSV, TSV, QIF, OFX, or text statement containing date, description, and amount fields.",
    );
  return parsed;
}

export function decodeBankStatement(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1];
      swapped[index - 1] = bytes[index];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  const sample = bytes.subarray(0, Math.min(bytes.length, 2000));
  const evenNulls = sample.filter(
    (value, index) => index % 2 === 0 && value === 0,
  ).length;
  const oddNulls = sample.filter(
    (value, index) => index % 2 === 1 && value === 0,
  ).length;
  if (oddNulls > sample.length / 8 && oddNulls > evenNulls * 2)
    return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseBankAmount(value: unknown) {
  const source = statementValue(String(value ?? "")).replace(/[−–—]/g, "-");
  if (!source) return 0;
  const negative =
    /^\(.*\)$/.test(source) ||
    /(?:^|\s)DR$/i.test(source) ||
    source.startsWith("-");
  const number = Number(
    source.replace(/[£€$(),\s]/g, "").replace(/(?:GBP|EUR|USD|CR|DR)$/i, ""),
  );
  if (!Number.isFinite(number)) return Number.NaN;
  return negative ? -Math.abs(number) : number;
}

export function parseBankDate(value: unknown) {
  const source = statementValue(String(value ?? ""));
  let match = source.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match)
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match)
    return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
  match = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (match) {
    const year =
      Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return validDate(year, Number(match[2]), Number(match[1]));
  }
  const timestamp = Date.parse(source);
  if (Number.isNaN(timestamp)) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  )
    return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function taxYearForBankDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const startYear = date >= new Date(year, 3, 6) ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function fingerprint(value: string) {
  let first = 0xdeadbeef;
  let second = 0x41c6ce57;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 2654435761);
    second = Math.imul(second ^ code, 1597334677);
  }
  first =
    Math.imul(first ^ (first >>> 16), 2246822507) ^
    Math.imul(second ^ (second >>> 13), 3266489909);
  second =
    Math.imul(second ^ (second >>> 16), 2246822507) ^
    Math.imul(first ^ (first >>> 13), 3266489909);
  return `${(second >>> 0).toString(16).padStart(8, "0")}${(first >>> 0).toString(16).padStart(8, "0")}`;
}

export function mapBankRows(
  rows: Record<string, string>[],
  mapping: BankColumnMapping,
): BankImportRow[] {
  return rows.map((row, index) => {
    const transactionDate = parseBankDate(row[mapping.date]);
    const description = statementValue(String(row[mapping.description] ?? ""));
    let amountIn = mapping.amountIn
      ? parseBankAmount(row[mapping.amountIn])
      : 0;
    let amountOut = mapping.amountOut
      ? parseBankAmount(row[mapping.amountOut])
      : 0;
    if (mapping.amount) {
      const signed = parseBankAmount(row[mapping.amount]);
      amountIn = signed > 0 ? signed : 0;
      amountOut = signed < 0 ? Math.abs(signed) : 0;
    } else {
      amountIn = Math.abs(amountIn);
      amountOut = Math.abs(amountOut);
    }
    const parsedBalance = mapping.balance
      ? parseBankAmount(row[mapping.balance])
      : Number.NaN;
    const errors: string[] = [];
    if (!transactionDate) errors.push("Invalid date");
    if (!description) errors.push("Missing description");
    if (
      !Number.isFinite(amountIn) ||
      !Number.isFinite(amountOut) ||
      (amountIn <= 0 && amountOut <= 0) ||
      (amountIn > 0 && amountOut > 0)
    )
      errors.push("Enter one valid amount in or out");
    const key = `${transactionDate}|${description.toLowerCase().replace(/\s+/g, " ")}|${amountIn.toFixed(2)}|${amountOut.toFixed(2)}|${Number.isFinite(parsedBalance) ? parsedBalance.toFixed(2) : ""}`;
    return {
      rowNumber: index + 2,
      transactionDate,
      description,
      amountIn: Number.isFinite(amountIn) ? amountIn : 0,
      amountOut: Number.isFinite(amountOut) ? amountOut : 0,
      balance: Number.isFinite(parsedBalance) ? parsedBalance : null,
      taxYear: transactionDate ? taxYearForBankDate(transactionDate) : "",
      fingerprint: fingerprint(key),
      rawData: JSON.stringify(row),
      error: errors.join("; "),
    };
  });
}

export function checkBankBalances(rows: BankImportRow[]): BankBalanceCheck {
  const usable = rows.filter((row) => !row.error);
  let checked = 0;
  let ascendingMismatches = 0;
  let descendingMismatches = 0;
  for (let index = 0; index < usable.length - 1; index += 1) {
    const current = usable[index];
    const next = usable[index + 1];
    if (current.balance === null || next.balance === null) continue;
    checked += 1;
    const currentSigned = current.amountIn - current.amountOut;
    const nextSigned = next.amountIn - next.amountOut;
    if (Math.abs(current.balance + nextSigned - next.balance) > 0.011)
      ascendingMismatches += 1;
    if (Math.abs(next.balance + currentSigned - current.balance) > 0.011)
      descendingMismatches += 1;
  }
  if (checked < 2) return { checked, mismatches: 0, order: "unknown" };
  if (ascendingMismatches <= descendingMismatches)
    return { checked, mismatches: ascendingMismatches, order: "ascending" };
  return { checked, mismatches: descendingMismatches, order: "descending" };
}

function dayDifference(left: string, right: string) {
  return (
    Math.abs(
      new Date(`${left}T00:00:00`).getTime() -
        new Date(`${right}T00:00:00`).getTime(),
    ) / 86_400_000
  );
}

export function findBankMatch(
  date: string,
  amount: number,
  candidates: MatchCandidate[],
  toleranceDays: number,
  amountTolerance: number,
): MatchResult | null {
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      days: dayDifference(date, candidate.date),
      difference: Math.abs(amount - candidate.amount),
    }))
    .filter(
      (result) =>
        result.days <= toleranceDays && result.difference <= amountTolerance,
    )
    .sort(
      (left, right) =>
        left.days - right.days || left.difference - right.difference,
    );
  if (!ranked[0]) return null;
  if (
    ranked[1] &&
    ranked[0].days === ranked[1].days &&
    Math.abs(ranked[0].difference - ranked[1].difference) < 0.0001
  )
    return null;
  return {
    ...ranked[0].candidate,
    confidence:
      ranked[0].days === 0 && ranked[0].difference < 0.005 ? "exact" : "near",
  };
}

import { createWorker, type LoggerMessage } from "tesseract.js";

export interface OcrExtraction {
  text: string;
  supplier: string;
  date: string;
  total: number;
  vat: number;
}

const moneyValue = (value: string) => Number(value.replace(/,/g, "")) || 0;

function normaliseDate(value: string) {
  const iso = value.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (iso)
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const uk = value.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!uk) return "";
  const year = uk[3].length === 2 ? `20${uk[3]}` : uk[3];
  return `${year}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
}

export function extractReceiptFields(text: string): OcrExtraction {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const supplier =
    lines.find(
      (line) =>
        line.length >= 3 &&
        line.length <= 80 &&
        /[A-Za-z]{3}/.test(line) &&
        !/receipt|invoice|tax|date|total|vat|www\.|@/i.test(line),
    ) ??
    lines[0] ??
    "";
  const dateMatch = text.match(
    /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/,
  );
  const amountPattern = /(?:£\s*)?(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})/g;
  const amountFromLine = (pattern: RegExp) => {
    const line = [...lines]
      .reverse()
      .find((candidate) => pattern.test(candidate));
    pattern.lastIndex = 0;
    if (!line) return 0;
    const values = [...line.matchAll(amountPattern)].map((match) =>
      moneyValue(`${match[1]}.${match[2]}`),
    );
    return values[values.length - 1] ?? 0;
  };
  const allAmounts = [...text.matchAll(amountPattern)].map((match) =>
    moneyValue(`${match[1]}.${match[2]}`),
  );
  const total =
    amountFromLine(/(?:grand\s+)?total|amount\s+(?:paid|due)|balance/i) ||
    Math.max(0, ...allAmounts);
  const vat = amountFromLine(/\b(?:vat|v\.a\.t\.|tax)\b/i);
  return {
    text: text.trim(),
    supplier,
    date: normaliseDate(dateMatch?.[0] ?? ""),
    total,
    vat: Math.min(vat, total),
  };
}

export async function recogniseReceipt(
  file: Blob,
  onProgress?: (progress: number, status: string) => void,
): Promise<OcrExtraction> {
  if (file.type === "application/pdf") return recognisePdf(file, onProgress);
  const logger = (message: LoggerMessage) => {
    if (message.status === "recognizing text")
      onProgress?.(message.progress, message.status);
  };
  const worker = await createWorker("eng", 1, { logger });
  try {
    const result = await worker.recognize(file);
    return extractReceiptFields(result.data.text);
  } finally {
    await worker.terminate();
  }
}

async function recognisePdf(
  file: Blob,
  onProgress?: (progress: number, status: string) => void,
) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const pdf = await getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  }).promise;
  const pageCount = Math.min(pdf.numPages, 10);
  const embeddedText: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    embeddedText.push(
      content.items.map((item) => ("str" in item ? item.str : "")).join(" "),
    );
    onProgress?.(pageNumber / pageCount, "extracting text");
  }
  const digitalText = embeddedText.join("\n").trim();
  if (digitalText.length >= 20) {
    const result = extractReceiptFields(digitalText);
    await pdf.cleanup();
    return result;
  }

  let currentPage = 0;
  const worker = await createWorker("eng", 1, {
    logger: (message: LoggerMessage) => {
      if (message.status === "recognizing text")
        onProgress?.(
          (currentPage + message.progress) / pageCount,
          message.status,
        );
    },
  });
  try {
    const recognisedText: string[] = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      currentPage = pageNumber - 1;
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("PDF page could not be rendered.");
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("PDF page could not be converted.")),
          "image/png",
        ),
      );
      const result = await worker.recognize(image);
      recognisedText.push(result.data.text);
    }
    return extractReceiptFields(recognisedText.join("\n"));
  } finally {
    await worker.terminate();
    await pdf.cleanup();
  }
}

export function suggestCategoryId(
  supplier: string,
  text: string,
  categories: { id: number; name: string }[],
  priorCategoryId?: number,
) {
  if (
    priorCategoryId &&
    categories.some((category) => category.id === priorCategoryId)
  )
    return priorCategoryId;
  const value = `${supplier} ${text}`.toLowerCase();
  const rules: [RegExp, RegExp][] = [
    [/fuel|petrol|diesel|shell|bp\b|esso/, /motor|vehicle|travel/],
    [/hotel|train|rail|uber|taxi|flight/, /travel|accommodation/],
    [
      /software|subscription|hosting|domain|microsoft|adobe/,
      /software|computer|office/,
    ],
    [/phone|mobile|broadband|internet/, /phone|telephone|communication/],
    [/stationery|paper|ink|printer/, /office|stationery/],
    [/insurance/, /insurance/],
    [/accountant|legal|solicitor/, /professional|legal|account/],
    [/advert|marketing|promotion/, /advert|marketing/],
    [/meal|restaurant|cafe|coffee/, /food|subsistence/],
  ];
  for (const [source, categoryName] of rules) {
    if (source.test(value))
      return (
        categories.find((category) =>
          categoryName.test(category.name.toLowerCase()),
        )?.id ?? null
      );
  }
  return null;
}

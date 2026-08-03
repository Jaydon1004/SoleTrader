export interface ReceiptFingerprint {
  supplier: string;
  date: string;
  total: number;
}

export interface ReceiptDuplicateCandidate extends ReceiptFingerprint {
  id: number;
  fileName: string;
}

export interface ReceiptBankCandidate {
  id: number;
  date: string;
  description: string;
  amount: number;
}

export interface RankedBankCandidate extends ReceiptBankCandidate {
  score: number;
  confidence: "exact" | "near";
  reason: string;
}

function normaliseWords(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function wordSimilarity(left: string, right: string) {
  const leftWords = normaliseWords(left);
  const rightWords = normaliseWords(right);
  if (!leftWords.size || !rightWords.size) return 0;
  const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
  return shared / Math.min(leftWords.size, rightWords.size);
}

function daysApart(left: string, right: string) {
  const leftTime = new Date(`${left}T00:00:00Z`).getTime();
  const rightTime = new Date(`${right}T00:00:00Z`).getTime();
  if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime))
    return Infinity;
  return Math.abs(leftTime - rightTime) / 86_400_000;
}

export function findReceiptDuplicates(
  receipt: ReceiptFingerprint,
  candidates: ReceiptDuplicateCandidate[],
) {
  if (!receipt.date || receipt.total <= 0) return [];
  return candidates.filter(
    (candidate) =>
      candidate.date === receipt.date &&
      Math.abs(candidate.total - receipt.total) <= 0.01 &&
      (!receipt.supplier ||
        !candidate.supplier ||
        wordSimilarity(receipt.supplier, candidate.supplier) >= 0.75),
  );
}

export function rankReceiptBankMatches(
  receipt: ReceiptFingerprint,
  candidates: ReceiptBankCandidate[],
): RankedBankCandidate[] {
  if (!receipt.date || receipt.total <= 0) return [];
  return candidates
    .map((candidate) => {
      const amountDifference = Math.abs(candidate.amount - receipt.total);
      const dayDifference = daysApart(candidate.date, receipt.date);
      if (
        amountDifference > Math.max(0.02, receipt.total * 0.01) ||
        dayDifference > 7
      )
        return null;
      const supplierSimilarity = wordSimilarity(
        receipt.supplier,
        candidate.description,
      );
      const exactAmount = amountDifference <= 0.01;
      const score = Math.round(
        (exactAmount ? 65 : 50) +
          Math.max(0, 20 - dayDifference * 3) +
          supplierSimilarity * 15,
      );
      const confidence =
        exactAmount && dayDifference <= 1 && supplierSimilarity >= 0.5
          ? "exact"
          : "near";
      return {
        ...candidate,
        score,
        confidence,
        reason: `${exactAmount ? "same amount" : "amount within 1%"}, ${dayDifference === 0 ? "same date" : `${dayDifference} day${dayDifference === 1 ? "" : "s"} apart`}`,
      } satisfies RankedBankCandidate;
    })
    .filter((candidate): candidate is RankedBankCandidate => candidate !== null)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);
}

export type AutoBankClassification =
  | "owner_contribution"
  | "owner_withdrawal"
  | "transfer"
  | "loan"
  | "refund"
  | "ignored";

export interface ClassifierRule {
  description_pattern: string;
  classification: AutoBankClassification;
  enabled: number;
  account_use?: "all" | "business" | "mixed" | "personal";
}

export interface ClassifierTransaction {
  id: number;
  description: string;
  amount_in: number;
  amount_out: number;
  account_use?: "business" | "mixed" | "personal";
  classification: string;
  status: string;
  match_confidence?: string;
}

export interface ClassificationSuggestion {
  transactionId: number;
  classification: AutoBankClassification;
  confidence: "rule" | "learned";
  explanation: string;
}

const supported = new Set<AutoBankClassification>([
  "owner_contribution",
  "owner_withdrawal",
  "transfer",
  "loan",
  "refund",
  "ignored",
]);

function direction(
  row: Pick<ClassifierTransaction, "amount_in" | "amount_out">,
) {
  if (row.amount_in > 0 && row.amount_out === 0) return "in";
  if (row.amount_out > 0 && row.amount_in === 0) return "out";
  return "unknown";
}

function accountUse(row: ClassifierTransaction) {
  return row.account_use ?? "business";
}

function validDirection(
  classification: AutoBankClassification,
  rowDirection: string,
) {
  if (rowDirection === "unknown") return false;
  if (classification === "owner_contribution" || classification === "refund")
    return rowDirection === "in";
  if (classification === "owner_withdrawal") return rowDirection === "out";
  return true;
}

export function normalizeBankDescription(value: string) {
  return value
    .toLowerCase()
    .replace(/\b(?:on|date)\s+\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b/g, " ")
    .replace(
      /\b(?:ref|reference|transaction|txn|card)\s*[:#-]?\s*[a-z0-9-]+\b/g,
      " ",
    )
    .replace(/\b\d{4,}\b/g, " ")
    .replace(/\bvia\s+(?:apple|google)\s+pay\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function suggestBankClassifications(
  unmatched: ClassifierTransaction[],
  history: ClassifierTransaction[],
  rules: ClassifierRule[],
): ClassificationSuggestion[] {
  const learned = new Map<
    string,
    { classifications: Set<AutoBankClassification>; count: number }
  >();
  for (const row of history) {
    if (
      row.match_confidence !== "manual" ||
      !supported.has(row.classification as AutoBankClassification)
    )
      continue;
    const normalized = normalizeBankDescription(row.description);
    const rowDirection = direction(row);
    if (normalized.length < 4 || rowDirection === "unknown") continue;
    const key = `${accountUse(row)}:${rowDirection}:${normalized}`;
    const group = learned.get(key) ?? { classifications: new Set(), count: 0 };
    group.classifications.add(row.classification as AutoBankClassification);
    group.count += 1;
    learned.set(key, group);
  }

  const suggestions: ClassificationSuggestion[] = [];
  for (const row of unmatched) {
    const rowDirection = direction(row);
    const matchingRules = rules
      .filter((rule) => rule.enabled === 1)
      .filter(
        (rule) =>
          !rule.account_use ||
          rule.account_use === "all" ||
          rule.account_use === accountUse(row),
      )
      .filter((rule) => {
        try {
          return new RegExp(rule.description_pattern, "i").test(
            row.description,
          );
        } catch {
          return false;
        }
      })
      .map((rule) => rule.classification)
      .filter((classification) => validDirection(classification, rowDirection));
    const ruleResults = new Set(matchingRules);
    if (ruleResults.size === 1) {
      const classification = [...ruleResults][0];
      suggestions.push({
        transactionId: row.id,
        classification,
        confidence: "rule",
        explanation: "Matched an enabled bank rule",
      });
      continue;
    }
    if (ruleResults.size > 1) continue;

    const normalized = normalizeBankDescription(row.description);
    const group = learned.get(
      `${accountUse(row)}:${rowDirection}:${normalized}`,
    );
    if (
      normalized.length < 4 ||
      !group ||
      group.count < 2 ||
      group.classifications.size !== 1
    )
      continue;
    const classification = [...group.classifications][0];
    if (!validDirection(classification, rowDirection)) continue;
    suggestions.push({
      transactionId: row.id,
      classification,
      confidence: "learned",
      explanation: `Matched ${group.count} consistent manual decisions`,
    });
  }
  return suggestions;
}

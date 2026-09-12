import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import {
  suggestBankClassifications,
  type AutoBankClassification,
  type ClassifierTransaction,
} from "@/lib/bank-classifier";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";

export type BankRuleClassification = AutoBankClassification;
export interface BankRule {
  id: number;
  name: string;
  description_pattern: string;
  classification: BankRuleClassification;
  account_use: "all" | "business" | "mixed" | "personal";
  enabled: number;
  created_at: string;
  updated_at: string;
}
export interface AutoClassifyResult {
  classified: number;
  fromRules: number;
  fromHistory: number;
  leftForReview: number;
}

export function useBankRules() {
  return useQuery({
    queryKey: ["bank-rules"],
    queryFn: () => query<BankRule>("SELECT * FROM bank_rules ORDER BY name"),
  });
}
function invalidate(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["bank-rules"] });
  client.invalidateQueries({ queryKey: ["bank-reconciliation"] });
  client.invalidateQueries({ queryKey: ["dashboard"] });
}
export function useCreateBankRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (
      rule: Pick<
        BankRule,
        "name" | "description_pattern" | "classification" | "account_use"
      >,
    ) =>
      execute(
        "INSERT INTO bank_rules (name, description_pattern, classification, account_use) VALUES (?, ?, ?, ?)",
        [
          rule.name.trim(),
          rule.description_pattern.trim(),
          rule.classification,
          rule.account_use,
        ],
      ),
    onSuccess: () => invalidate(client),
  });
}
export function useDeleteBankRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute("DELETE FROM bank_rules WHERE id = ?", [id]),
    onSuccess: () => invalidate(client),
  });
}
export function useAutoClassifyBankTransactions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<AutoClassifyResult> => {
      const [rules, unmatched, history] = await Promise.all([
        query<BankRule>("SELECT * FROM bank_rules WHERE enabled = 1"),
        query<ClassifierTransaction>(
          `SELECT b.id, b.description, b.amount_in, b.amount_out, a.account_use, b.classification, b.status, b.match_confidence
					 FROM bank_transactions b INNER JOIN bank_accounts a ON a.id = b.bank_account_id
					 WHERE b.status = 'unmatched'`,
        ),
        query<ClassifierTransaction>(
          `SELECT b.id, b.description, b.amount_in, b.amount_out, a.account_use, b.classification, b.status, b.match_confidence
					 FROM bank_transactions b INNER JOIN bank_accounts a ON a.id = b.bank_account_id
					 WHERE b.status IN ('matched', 'ignored') AND b.match_confidence = 'manual'
						 AND b.auto_classified = 0
						 AND b.classification IN ('owner_contribution', 'owner_withdrawal', 'transfer', 'loan', 'refund', 'ignored')`,
        ),
      ]);
      const suggestions = suggestBankClassifications(unmatched, history, rules);
      const groups = new Map<string, typeof suggestions>();
      for (const suggestion of suggestions) {
        const key = `${suggestion.classification}:${suggestion.confidence}`;
        groups.set(key, [...(groups.get(key) ?? []), suggestion]);
      }
      let classified = 0;
      for (const group of groups.values()) {
        const { classification, confidence } = group[0];
        classified += await invoke<number>("bulk_classify_bank_transactions", {
          input: {
            workspace_id: getActiveWorkspaceId(),
            bank_transaction_ids: group.map(
              (suggestion) => suggestion.transactionId,
            ),
            classification,
            source: confidence,
          },
        });
      }
      return {
        classified,
        fromRules: suggestions.filter(
          (suggestion) => suggestion.confidence === "rule",
        ).length,
        fromHistory: suggestions.filter(
          (suggestion) => suggestion.confidence === "learned",
        ).length,
        leftForReview: unmatched.length - classified,
      };
    },
    onSuccess: () => invalidate(client),
  });
}

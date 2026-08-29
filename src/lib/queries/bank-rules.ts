import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";

export type BankRuleClassification = "owner_contribution" | "owner_withdrawal" | "transfer" | "loan" | "refund" | "ignored";
export interface BankRule { id: number; name: string; description_pattern: string; classification: BankRuleClassification; enabled: number; created_at: string; updated_at: string; }

export function useBankRules() { return useQuery({ queryKey: ["bank-rules"], queryFn: () => query<BankRule>("SELECT * FROM bank_rules ORDER BY name") }); }
function invalidate(client: ReturnType<typeof useQueryClient>) { client.invalidateQueries({ queryKey: ["bank-rules"] }); client.invalidateQueries({ queryKey: ["bank-reconciliation"] }); client.invalidateQueries({ queryKey: ["dashboard"] }); }
export function useCreateBankRule() { const client = useQueryClient(); return useMutation({ mutationFn: (rule: Pick<BankRule, "name" | "description_pattern" | "classification">) => execute("INSERT INTO bank_rules (name, description_pattern, classification) VALUES (?, ?, ?)", [rule.name.trim(), rule.description_pattern.trim(), rule.classification]), onSuccess: () => invalidate(client) }); }
export function useDeleteBankRule() { const client = useQueryClient(); return useMutation({ mutationFn: (id: number) => execute("DELETE FROM bank_rules WHERE id = ?", [id]), onSuccess: () => invalidate(client) }); }
export function useApplyBankRules() { const client = useQueryClient(); return useMutation({ mutationFn: async () => { const [rules, rows] = await Promise.all([query<BankRule>("SELECT * FROM bank_rules WHERE enabled = 1"), query<{ id: number; description: string }>("SELECT id, description FROM bank_transactions WHERE status = 'unmatched'")]); let applied = 0; for (const row of rows) { const rule = rules.find((candidate) => { try { return new RegExp(candidate.description_pattern, "i").test(row.description); } catch { return false; } }); if (!rule) continue; await invoke("classify_bank_transaction", { input: { workspace_id: getActiveWorkspaceId(), bank_transaction_id: row.id, classification: rule.classification } }); applied += 1; } return applied; }, onSuccess: () => invalidate(client) }); }

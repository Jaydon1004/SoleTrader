import { invoke } from "@tauri-apps/api/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getActiveWorkspaceId, query } from "@/lib/database";

export interface LedgerSummary {
  entries: number;
  lines: number;
  debitPence: number;
  creditPence: number;
  balanced: boolean;
}

export interface YearEndCloseResult {
  taxYear: string;
  closedAt: string;
  ledger: LedgerSummary;
}

export function rebuildShadowLedger() {
  return invoke<LedgerSummary>("rebuild_shadow_ledger", {
    input: { workspaceId: getActiveWorkspaceId() },
  });
}

export function closeYearEnd(taxYear: string) {
  return invoke<YearEndCloseResult>("close_year_end", {
    input: { workspaceId: getActiveWorkspaceId(), taxYear },
  });
}

export function reopenYearEnd(taxYear: string) {
  return invoke<void>("reopen_year_end", {
    input: { workspaceId: getActiveWorkspaceId(), taxYear },
  });
}

export interface YearEndStatus {
  tax_year: string;
  status: "open" | "review" | "closed";
  closed_at: string | null;
}

export function useYearEndStatus(taxYear: string) {
  return useQuery({
    queryKey: ["year-end", taxYear],
    enabled: !!taxYear,
    queryFn: async () =>
      (
        await query<YearEndStatus>(
          "SELECT tax_year, status, closed_at FROM year_end_closes WHERE tax_year = ?",
          [taxYear],
        )
      )[0] ?? null,
  });
}

export function useCloseYearEnd() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: closeYearEnd,
    onSuccess: (_, taxYear) =>
      client.invalidateQueries({ queryKey: ["year-end", taxYear] }),
  });
}

export function useReopenYearEnd() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: reopenYearEnd,
    onSuccess: (_, taxYear) =>
      client.invalidateQueries({ queryKey: ["year-end", taxYear] }),
  });
}

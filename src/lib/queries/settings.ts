import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { query, execute, getActiveWorkspaceId } from "@/lib/database";
import type {
  UserProfile,
  TaxYearConfig,
  InvoiceSettings,
} from "@/types/database";

// ─── User Profile ───────────────────────────────────────────────────────────

export function useUserProfile() {
  return useQuery({
    queryKey: ["user-profile"],
    queryFn: async () => {
      const rows = await query<UserProfile>(
        "SELECT * FROM user_profile WHERE id = 1",
      );
      return rows[0] ?? null;
    },
  });
}

export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      // Filter out id, created_at, and any undefined/null values
      const entries = Object.entries(data).filter(
        ([k, v]) =>
          k !== "id" && k !== "created_at" && v !== undefined && v !== null,
      );
      if (entries.length === 0) return;
      const fields = entries.map(([k]) => `${k} = ?`).join(", ");
      const values = entries.map(([, v]) => v);
      await execute(
        `UPDATE user_profile SET ${fields}, updated_at = datetime('now') WHERE id = 1`,
        values,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-profile"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["vat"] });
    },
  });
}

// ─── Tax Year Config ─────────────────────────────────────────────────────────

export function useTaxYearConfigs() {
  return useQuery({
    queryKey: ["tax-year-configs"],
    queryFn: () =>
      query<TaxYearConfig>(
        "SELECT * FROM tax_year_config ORDER BY year_start DESC",
      ),
  });
}

export function useTaxYearConfig(taxYear: string) {
  return useQuery({
    queryKey: ["tax-year-config", taxYear],
    queryFn: async () => {
      const rows = await query<TaxYearConfig>(
        "SELECT * FROM tax_year_config WHERE tax_year = ?",
        [taxYear],
      );
      return rows[0] ?? null;
    },
    enabled: !!taxYear,
  });
}

export function useUpdateTaxYearConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<TaxYearConfig> & { tax_year: string }) => {
      const { tax_year, id: _id, created_at: _ca, ...fields } = data;
      const keys = Object.keys(fields).filter((k) => k !== "updated_at");
      const setClauses = keys.map((k) => `${k} = ?`).join(", ");
      const values = keys.map((k) => (fields as Record<string, unknown>)[k]);
      await execute(
        `UPDATE tax_year_config SET ${setClauses}, updated_at = datetime('now') WHERE tax_year = ?`,
        [...values, tax_year],
      );
      await invoke("recalculate_mileage", {
        input: { workspace_id: getActiveWorkspaceId(), tax_year },
      });
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["tax-year-configs"] });
      qc.invalidateQueries({ queryKey: ["tax-year-config", vars.tax_year] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["vat"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle-deduction-summary"] });
      qc.invalidateQueries({ queryKey: ["advanced-tax"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useCreateTaxYearConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      data: Pick<TaxYearConfig, "tax_year" | "year_start" | "year_end"> &
        Partial<TaxYearConfig>,
    ) => {
      await execute(
        `INSERT INTO tax_year_config (tax_year, year_start, year_end) VALUES (?, ?, ?)
         ON CONFLICT(tax_year) DO NOTHING`,
        [data.tax_year, data.year_start, data.year_end],
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tax-year-configs"] }),
  });
}

// ─── Invoice Settings ─────────────────────────────────────────────────────────

export function useInvoiceSettings() {
  return useQuery({
    queryKey: ["invoice-settings"],
    queryFn: async () => {
      const rows = await query<InvoiceSettings>(
        "SELECT * FROM invoice_settings WHERE id = 1",
      );
      return rows[0] ?? null;
    },
  });
}

export function useUpdateInvoiceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<InvoiceSettings>) => {
      const fields = Object.keys(data)
        .filter((k) => k !== "id" && k !== "created_at")
        .map((k) => `${k} = ?`)
        .join(", ");
      const values = Object.keys(data)
        .filter((k) => k !== "id" && k !== "created_at")
        .map((k) => (data as Record<string, unknown>)[k]);
      await execute(
        `UPDATE invoice_settings SET ${fields}, updated_at = datetime('now') WHERE id = 1`,
        values,
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice-settings"] }),
  });
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export function useAppSetting(key: string) {
  return useQuery({
    queryKey: ["app-setting", key],
    queryFn: async () => {
      const rows = await query<{ key: string; value: string }>(
        "SELECT value FROM app_settings WHERE key = ?",
        [key],
      );
      return rows[0]?.value ?? null;
    },
  });
}

export function useSetAppSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      await execute(
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        [key, value],
      );
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["app-setting", vars.key] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

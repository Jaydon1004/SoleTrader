import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  calculateCapitalAllowanceSchedules,
  type CapitalAllowanceSchedule,
} from "@/lib/capital-allowances";
import { execute, query } from "@/lib/database";
import type {
  CapitalAsset,
  CisTransaction,
  TaxYearConfig,
} from "@/types/database";

export type CapitalAssetInput = Pick<
  CapitalAsset,
  | "name"
  | "asset_type"
  | "description"
  | "purchase_date"
  | "purchase_price"
  | "business_percent"
  | "pool_type"
  | "claim_method"
  | "disposal_date"
  | "disposal_proceeds"
  | "notes"
>;

export type CisTransactionInput = Pick<
  CisTransaction,
  | "direction"
  | "date"
  | "party_name"
  | "party_utr"
  | "gross_amount"
  | "materials_amount"
  | "deduction_rate"
  | "deduction_amount"
  | "notes"
>;

export interface AdvancedTaxData {
  assets: CapitalAsset[];
  cisTransactions: CisTransaction[];
  schedule: CapitalAllowanceSchedule;
  cisReceived: number;
  cisMade: number;
}

function taxYearForDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  const startYear = date >= new Date(year, 3, 6) ? year : year - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function emptySchedule(taxYear: string): CapitalAllowanceSchedule {
  const pool = {
    openingValue: 0,
    additions: 0,
    disposals: 0,
    balancingCharge: 0,
    writingDownAllowance: 0,
    closingValue: 0,
  };
  return {
    taxYear,
    aiaLimit: 0,
    aiaClaim: 0,
    aiaRemaining: 0,
    mainPool: { ...pool },
    specialPool: { ...pool },
    totalAllowance: 0,
    balancingCharge: 0,
    netAllowance: 0,
    assetLines: [],
  };
}

function invalidateAdvancedTax(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["advanced-tax"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useAdvancedTaxData(taxYear: string) {
  return useQuery({
    queryKey: ["advanced-tax", taxYear],
    enabled: !!taxYear,
    queryFn: async (): Promise<AdvancedTaxData> => {
      const [assets, configs, cisTransactions, directCis] = await Promise.all([
        query<CapitalAsset>(
          "SELECT * FROM capital_assets WHERE deleted_at IS NULL ORDER BY purchase_date DESC, id DESC",
        ),
        query<TaxYearConfig>(
          "SELECT * FROM tax_year_config ORDER BY year_start",
        ),
        query<CisTransaction>(
          `SELECT ct.*,
          COALESCE(CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END, '') AS invoice_reference
          FROM cis_transactions ct LEFT JOIN invoices i ON i.id = ct.invoice_id
          WHERE ct.deleted_at IS NULL AND ct.tax_year = ? ORDER BY ct.date DESC, ct.id DESC`,
          [taxYear],
        ),
        query<{ id: number; date: string; deduction_amount: number }>(
          "SELECT id, income_date AS date, cis_deduction_amount AS deduction_amount FROM direct_income WHERE deleted_at IS NULL AND cis_deduction_amount > 0 AND tax_year = ?",
          [taxYear],
        ),
      ]);
      const schedules = calculateCapitalAllowanceSchedules(assets, configs);
      const schedule =
        schedules.find((candidate) => candidate.taxYear === taxYear) ??
        emptySchedule(taxYear);
      return {
        assets,
        cisTransactions,
        schedule,
        cisReceived: cisTransactions
          .filter((entry) => entry.direction === "received")
          .reduce((sum, entry) => sum + entry.deduction_amount, 0) + directCis.reduce((sum, entry) => sum + entry.deduction_amount, 0),
        cisMade: cisTransactions
          .filter((entry) => entry.direction === "made")
          .reduce((sum, entry) => sum + entry.deduction_amount, 0),
      };
    },
  });
}

export function useSaveCapitalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...asset }: CapitalAssetInput & { id?: number }) =>
      id
        ? execute(
            `UPDATE capital_assets SET name = ?, asset_type = ?, description = ?, purchase_date = ?,
           purchase_price = ?, business_percent = ?, pool_type = ?, claim_method = ?, disposal_date = ?,
           disposal_proceeds = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
            [
              asset.name,
              asset.asset_type,
              asset.description,
              asset.purchase_date,
              asset.purchase_price,
              asset.business_percent,
              asset.pool_type,
              asset.claim_method,
              asset.disposal_date,
              asset.disposal_proceeds,
              asset.notes,
              id,
            ],
          )
        : execute(
            `INSERT INTO capital_assets (name, asset_type, description, purchase_date, purchase_price,
           business_percent, pool_type, claim_method, disposal_date, disposal_proceeds, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              asset.name,
              asset.asset_type,
              asset.description,
              asset.purchase_date,
              asset.purchase_price,
              asset.business_percent,
              asset.pool_type,
              asset.claim_method,
              asset.disposal_date,
              asset.disposal_proceeds,
              asset.notes,
            ],
          ),
    onSuccess: () => invalidateAdvancedTax(queryClient),
  });
}

export function useDeleteCapitalAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE capital_assets SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidateAdvancedTax(queryClient),
  });
}

export function useSaveCisTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...entry }: CisTransactionInput & { id?: number }) => {
      const taxYear = taxYearForDate(entry.date);
      return id
        ? execute(
            `UPDATE cis_transactions SET direction = ?, date = ?, party_name = ?, party_utr = ?,
             gross_amount = ?, materials_amount = ?, deduction_rate = ?, deduction_amount = ?, notes = ?,
             tax_year = ?, updated_at = datetime('now') WHERE id = ? AND invoice_payment_id IS NULL`,
            [
              entry.direction,
              entry.date,
              entry.party_name,
              entry.party_utr,
              entry.gross_amount,
              entry.materials_amount,
              entry.deduction_rate,
              entry.deduction_amount,
              entry.notes,
              taxYear,
              id,
            ],
          )
        : execute(
            `INSERT INTO cis_transactions (direction, date, party_name, party_utr, gross_amount,
             materials_amount, deduction_rate, deduction_amount, notes, tax_year)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              entry.direction,
              entry.date,
              entry.party_name,
              entry.party_utr,
              entry.gross_amount,
              entry.materials_amount,
              entry.deduction_rate,
              entry.deduction_amount,
              entry.notes,
              taxYear,
            ],
          );
    },
    onSuccess: () => invalidateAdvancedTax(queryClient),
  });
}

export function useDeleteCisTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE cis_transactions SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND invoice_payment_id IS NULL",
        [id],
      ),
    onSuccess: () => invalidateAdvancedTax(queryClient),
  });
}

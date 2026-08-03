import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { execute, getActiveWorkspaceId, query } from "@/lib/database";
import type { StoredReceipt } from "@/lib/queries/expenses";
import { deleteStoredFile } from "@/lib/receipt-storage";

export type VehicleType = "car" | "van" | "motorcycle" | "bicycle";
export type VehicleCostMethod = "mileage" | "actual";
export type VehicleCostType =
  "fuel" | "insurance" | "mot" | "servicing" | "repairs" | "road_tax" | "other";

export interface Vehicle {
  id: number;
  name: string;
  make: string;
  model: string;
  registration: string;
  vehicle_type: VehicleType;
  cost_method: VehicleCostMethod;
  business_percent: number;
  archived: number;
  mileage_count: number;
  business_miles: number;
  mileage_allowance: number;
  cost_count: number;
  actual_costs: number;
  allowable_actual_costs: number;
  total_deduction: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleInput {
  name: string;
  make: string;
  model: string;
  registration: string;
  vehicle_type: VehicleType;
  cost_method: VehicleCostMethod;
  business_percent: number;
}

export interface MileageLog {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  date: string;
  start_location: string;
  end_location: string;
  purpose: string;
  distance_miles: number;
  passengers: number;
  rate_applied: number;
  amount: number;
  notes: string;
  tax_year: string;
  deleted_at: string | null;
  created_at: string;
}

export interface MileageInput {
  vehicle_id: number;
  date: string;
  start_location: string;
  end_location: string;
  purpose: string;
  distance_miles: number;
  passengers: number;
  notes: string;
}

export interface VehicleCost {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  date: string;
  cost_type: VehicleCostType;
  description: string;
  amount: number;
  vat_amount: number;
  vat_capital_asset: number;
  receipt_path: string;
  business_percent: number;
  allowable_amount: number;
  notes: string;
  tax_year: string;
  deleted_at: string | null;
  created_at: string;
}

export interface VehicleCostInput {
  vehicle_id: number;
  date: string;
  cost_type: VehicleCostType;
  description: string;
  amount: number;
  vat_amount: number;
  vat_capital_asset: boolean;
  receipt_path: string;
  receipt_file?: StoredReceipt | null;
  notes: string;
}

function invalidateVehicles(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  queryClient.invalidateQueries({ queryKey: ["mileage-logs"] });
  queryClient.invalidateQueries({ queryKey: ["vehicle-costs"] });
  queryClient.invalidateQueries({ queryKey: ["vehicle-deduction-summary"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["documents"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useVehicles(taxYear: string, includeArchived = false) {
  return useQuery({
    queryKey: ["vehicles", taxYear, includeArchived],
    queryFn: () =>
      query<Vehicle>(
        `SELECT v.*,
        COALESCE((SELECT COUNT(*) FROM mileage_logs m WHERE m.vehicle_id = v.id AND m.tax_year = ? AND m.deleted_at IS NULL), 0) AS mileage_count,
        COALESCE((SELECT SUM(distance_miles) FROM mileage_logs m WHERE m.vehicle_id = v.id AND m.tax_year = ? AND m.deleted_at IS NULL), 0) AS business_miles,
        COALESCE((SELECT SUM(amount) FROM mileage_logs m WHERE m.vehicle_id = v.id AND m.tax_year = ? AND m.deleted_at IS NULL), 0) AS mileage_allowance,
        COALESCE((SELECT COUNT(*) FROM vehicle_costs c WHERE c.vehicle_id = v.id AND c.tax_year = ? AND c.deleted_at IS NULL), 0) AS cost_count,
        COALESCE((SELECT SUM(amount) FROM vehicle_costs c WHERE c.vehicle_id = v.id AND c.tax_year = ? AND c.deleted_at IS NULL), 0) AS actual_costs,
        COALESCE((SELECT SUM((amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN vat_amount ELSE 0 END) * business_percent / 100) FROM vehicle_costs c WHERE c.vehicle_id = v.id AND c.tax_year = ? AND c.deleted_at IS NULL), 0) AS allowable_actual_costs,
        CASE WHEN v.cost_method = 'mileage' THEN
          COALESCE((SELECT SUM(amount) FROM mileage_logs m WHERE m.vehicle_id = v.id AND m.tax_year = ? AND m.deleted_at IS NULL), 0)
        ELSE COALESCE((SELECT SUM((amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN vat_amount ELSE 0 END) * business_percent / 100) FROM vehicle_costs c WHERE c.vehicle_id = v.id AND c.tax_year = ? AND c.deleted_at IS NULL), 0) END AS total_deduction
       FROM vehicles v WHERE ${includeArchived ? "1 = 1" : "v.archived = 0"} ORDER BY v.name`,
        [
          taxYear,
          taxYear,
          taxYear,
          taxYear,
          taxYear,
          taxYear,
          taxYear,
          taxYear,
        ],
      ),
  });
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: VehicleInput) =>
      execute(
        `INSERT INTO vehicles (name, make, model, registration, vehicle_type, cost_method, business_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          data.name,
          data.make,
          data.model,
          data.registration.toUpperCase(),
          data.vehicle_type,
          data.cost_method,
          data.cost_method === "actual" ? data.business_percent : 100,
        ],
      ),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: VehicleInput & { id: number }) =>
      invoke<void>("update_vehicle", {
        input: { workspace_id: getActiveWorkspaceId(), id, ...data },
      }),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useArchiveVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: number; archived: boolean }) =>
      execute(
        "UPDATE vehicles SET archived = ?, updated_at = datetime('now') WHERE id = ?",
        [archived ? 1 : 0, id],
      ),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useMileageLogs(vehicleId: string, taxYear: string) {
  return useQuery({
    queryKey: ["mileage-logs", vehicleId, taxYear],
    queryFn: () => {
      const conditions = ["m.deleted_at IS NULL"];
      const values: unknown[] = [];
      if (vehicleId !== "all") {
        conditions.push("m.vehicle_id = ?");
        values.push(Number(vehicleId));
      }
      if (taxYear !== "all") {
        conditions.push("m.tax_year = ?");
        values.push(taxYear);
      }
      return query<MileageLog>(
        `SELECT m.*, v.name AS vehicle_name FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id
         WHERE ${conditions.join(" AND ")} ORDER BY m.date DESC, m.id DESC`,
        values,
      );
    },
  });
}

export function useSaveMileage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: MileageInput & { id?: number }) =>
      invoke<number>("save_mileage", {
        input: { workspace_id: getActiveWorkspaceId(), id, ...data },
      }),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useDeleteMileage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      invoke<void>("delete_mileage", {
        input: { workspace_id: getActiveWorkspaceId(), id },
      }),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useVehicleCosts(vehicleId: string, taxYear: string) {
  return useQuery({
    queryKey: ["vehicle-costs", vehicleId, taxYear],
    queryFn: () => {
      const conditions = ["c.deleted_at IS NULL"];
      const values: unknown[] = [];
      if (vehicleId !== "all") {
        conditions.push("c.vehicle_id = ?");
        values.push(Number(vehicleId));
      }
      if (taxYear !== "all") {
        conditions.push("c.tax_year = ?");
        values.push(taxYear);
      }
      return query<VehicleCost>(
        `SELECT c.*, v.name AS vehicle_name, ROUND((c.amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN c.vat_amount ELSE 0 END) * c.business_percent / 100, 2) AS allowable_amount
         FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id
         WHERE ${conditions.join(" AND ")} ORDER BY c.date DESC, c.id DESC`,
        values,
      );
    },
  });
}

export function useSaveVehicleCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: VehicleCostInput & { id?: number }) => {
      try {
        return await invoke<number>("save_vehicle_cost", {
          input: { workspace_id: getActiveWorkspaceId(), id, ...data },
        });
      } catch (error) {
        if (data.receipt_file)
          await deleteStoredFile(data.receipt_file.path).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useDeleteVehicleCost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      execute(
        "UPDATE vehicle_costs SET deleted_at = datetime('now') WHERE id = ?",
        [id],
      ),
    onSuccess: () => invalidateVehicles(queryClient),
  });
}

export function useVehicleDeductionSummary(taxYear: string) {
  return useQuery({
    queryKey: ["vehicle-deduction-summary", taxYear],
    queryFn: async () => {
      const mileage = await query<{ miles: number; allowance: number }>(
        `SELECT COALESCE(SUM(m.distance_miles), 0) AS miles, COALESCE(SUM(m.amount), 0) AS allowance
         FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id
         WHERE m.deleted_at IS NULL AND m.tax_year = ? AND v.cost_method = 'mileage'`,
        [taxYear],
      );
      const costs = await query<{ paid: number; allowable: number }>(
        `SELECT COALESCE(SUM(c.amount), 0) AS paid,
          COALESCE(SUM((c.amount - CASE WHEN (SELECT vat_status FROM user_profile WHERE id = 1) != 'unregistered' THEN c.vat_amount ELSE 0 END) * c.business_percent / 100), 0) AS allowable
         FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id
         WHERE c.deleted_at IS NULL AND c.tax_year = ? AND v.cost_method = 'actual'`,
        [taxYear],
      );
      return {
        miles: mileage[0]?.miles ?? 0,
        mileageAllowance: mileage[0]?.allowance ?? 0,
        actualCostsPaid: costs[0]?.paid ?? 0,
        actualCostsAllowable: costs[0]?.allowable ?? 0,
        totalDeduction:
          (mileage[0]?.allowance ?? 0) + (costs[0]?.allowable ?? 0),
      };
    },
  });
}

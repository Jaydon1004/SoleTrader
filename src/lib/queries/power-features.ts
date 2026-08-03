import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getActiveWorkspaceId, query } from "@/lib/database";

export type SearchResultKind = "invoice" | "expense" | "client" | "document";

export interface GlobalSearchResult {
  kind: SearchResultKind;
  id: number;
  title: string;
  subtitle: string;
  detail: string;
  route: string;
}

export interface AuditEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: "create" | "update" | "delete" | "restore";
  changes: string;
  created_at: string;
}

export interface RecycleBinItem {
  kind:
    | "invoice"
    | "expense"
    | "mileage"
    | "vehicle_cost"
    | "document"
    | "capital_asset"
    | "cis";
  id: number;
  title: string;
  detail: string;
  deletedAt: string;
}

export function useGlobalSearch(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["global-search", term],
    enabled: term.length >= 2,
    queryFn: () => {
      const like = `%${term}%`;
      return query<GlobalSearchResult>(
        `SELECT * FROM (
          SELECT 'invoice' AS kind, i.id, CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END AS title,
            COALESCE(NULLIF(c.company, ''), c.name) AS subtitle,
            i.issue_date || ' · £' || printf('%.2f', i.total) AS detail,
            '/invoices?search=' || replace(CASE WHEN i.source_type = 'self_billed' THEN i.external_reference ELSE i.invoice_number END, ' ', '%20') AS route, i.updated_at AS sort_date
          FROM invoices i INNER JOIN clients c ON c.id = i.client_id
          WHERE i.deleted_at IS NULL AND (i.invoice_number LIKE ? OR i.external_reference LIKE ? OR c.name LIKE ? OR c.company LIKE ?)
          UNION ALL
          SELECT 'expense', e.id, e.description, COALESCE(NULLIF(e.supplier, ''), ec.name),
            e.date || ' · £' || printf('%.2f', e.amount), '/expenses?search=' || replace(e.description, ' ', '%20'), e.updated_at
          FROM expenses e INNER JOIN expense_categories ec ON ec.id = e.category_id
          WHERE e.deleted_at IS NULL AND (e.description LIKE ? OR e.supplier LIKE ? OR ec.name LIKE ?)
          UNION ALL
          SELECT 'client', c.id, COALESCE(NULLIF(c.company, ''), c.name), c.name,
            COALESCE(NULLIF(c.email, ''), c.phone), '/clients?search=' || replace(c.name, ' ', '%20'), c.updated_at
          FROM clients c WHERE c.archived = 0 AND (c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)
          UNION ALL
          SELECT 'document', d.id, d.file_name, d.category,
            COALESCE(NULLIF(d.document_date, ''), d.created_at), '/documents?search=' || replace(d.file_name, ' ', '%20'), d.updated_at
          FROM documents d WHERE d.deleted_at IS NULL AND (d.file_name LIKE ? OR d.notes LIKE ? OR d.ocr_text LIKE ?)
        ) ORDER BY sort_date DESC LIMIT 60`,
        [
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
          like,
        ],
      );
    },
  });
}

export function useAuditLog(entityType: string, action: string, limit = 500) {
  return useQuery({
    queryKey: ["audit-log", entityType, action, limit],
    queryFn: () => {
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (entityType !== "all") {
        conditions.push("entity_type = ?");
        values.push(entityType);
      }
      if (action !== "all") {
        conditions.push("action = ?");
        values.push(action);
      }
      values.push(limit);
      return query<AuditEntry>(
        `SELECT * FROM audit_log ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC LIMIT ?`,
        values,
      );
    },
  });
}

export function useRecycleBin() {
  return useQuery({
    queryKey: ["recycle-bin"],
    queryFn: () =>
      query<RecycleBinItem>(
        `SELECT * FROM (
        SELECT 'invoice' AS kind, id, CASE WHEN source_type = 'self_billed' THEN external_reference ELSE invoice_number END AS title, status || ' · £' || printf('%.2f', total) AS detail, deleted_at AS deletedAt FROM invoices WHERE deleted_at IS NOT NULL
        UNION ALL SELECT 'expense', id, description, COALESCE(NULLIF(supplier, ''), 'Expense') || ' · £' || printf('%.2f', amount), deleted_at FROM expenses WHERE deleted_at IS NOT NULL
        UNION ALL SELECT 'mileage', m.id, m.purpose, v.name || ' · ' || printf('%.1f', m.distance_miles) || ' miles', m.deleted_at FROM mileage_logs m INNER JOIN vehicles v ON v.id = m.vehicle_id WHERE m.deleted_at IS NOT NULL
        UNION ALL SELECT 'vehicle_cost', c.id, COALESCE(NULLIF(c.description, ''), c.cost_type), v.name || ' · £' || printf('%.2f', c.amount), c.deleted_at FROM vehicle_costs c INNER JOIN vehicles v ON v.id = c.vehicle_id WHERE c.deleted_at IS NOT NULL
        UNION ALL SELECT 'document', id, file_name, category, deleted_at FROM documents WHERE deleted_at IS NOT NULL
        UNION ALL SELECT 'capital_asset', id, name, asset_type || ' · £' || printf('%.2f', purchase_price), deleted_at FROM capital_assets WHERE deleted_at IS NOT NULL
        UNION ALL SELECT 'cis', id, party_name, direction || ' · £' || printf('%.2f', gross_amount), deleted_at FROM cis_transactions WHERE deleted_at IS NOT NULL
      ) ORDER BY deletedAt DESC LIMIT 1000`,
      ),
  });
}

function invalidatePowerFeatures(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ["recycle-bin"] });
  queryClient.invalidateQueries({ queryKey: ["audit-log"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["invoices"] });
  queryClient.invalidateQueries({ queryKey: ["expenses"] });
  queryClient.invalidateQueries({ queryKey: ["documents"] });
  queryClient.invalidateQueries({ queryKey: ["vehicles"] });
  queryClient.invalidateQueries({ queryKey: ["mileage-logs"] });
  queryClient.invalidateQueries({ queryKey: ["vehicle-costs"] });
  queryClient.invalidateQueries({ queryKey: ["advanced-tax"] });
  queryClient.invalidateQueries({ queryKey: ["vehicle-deduction-summary"] });
  queryClient.invalidateQueries({ queryKey: ["expense-summary"] });
  queryClient.invalidateQueries({ queryKey: ["invoice-income-summary"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  queryClient.invalidateQueries({ queryKey: ["vat"] });
  queryClient.invalidateQueries({ queryKey: ["global-search"] });
}

export function useRestoreRecycleItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: RecycleBinItem[]) =>
      invoke<void>("restore_recycle_items", {
        input: {
          workspaceId: getActiveWorkspaceId(),
          items: items.map(({ kind, id }) => ({ kind, id })),
        },
      }),
    onSuccess: () => invalidatePowerFeatures(queryClient),
  });
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { getActiveWorkspaceId } from "@/lib/database";
import type {
  MigrationKind,
  MigrationPreviewRow,
} from "@/lib/migration-import";

interface MigrationImportResult {
  imported: number;
  duplicates: number;
  invalid: number;
}

export function useMigrationImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      kind,
      rows,
      defaultCategoryId,
    }: {
      kind: MigrationKind;
      rows: MigrationPreviewRow[];
      defaultCategoryId?: number;
    }) =>
      invoke<MigrationImportResult>("import_migration_rows", {
        input: {
          workspace_id: getActiveWorkspaceId(),
          kind,
          rows,
          default_category_id: defaultCategoryId,
        },
      }),
    onSuccess: () => {
      [
        "clients",
        "expenses",
        "expense-summary",
        "dashboard",
        "vat",
        "global-search",
      ].forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    },
  });
}

import { invoke, isTauri } from "@tauri-apps/api/core";

export interface BusinessWorkspace {
  id: string;
  name: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
  lastBackupAt?: number | null;
  lastBackupFileCount?: number | null;
}

export interface BackupResult {
  path: string;
  completedAt: number;
  fileCount: number;
}

export interface FileAuditResult {
  missing: string[];
  orphaned: string[];
}

export async function listBusinessWorkspaces() {
  if (!isTauri()) return [];
  return invoke<BusinessWorkspace[]>("list_business_workspaces");
}

export async function createBusinessWorkspace(name: string) {
  return invoke<BusinessWorkspace>("create_business_workspace", { name });
}

export async function prepareBusinessWorkspace(id: string) {
  return invoke<void>("prepare_business_workspace", { id });
}

export async function setBusinessArchived(id: string, archived: boolean) {
  return invoke<void>("set_business_archived", { id, archived });
}

export async function auditBusinessFiles(id: string) {
  return invoke<FileAuditResult>("audit_business_files", { id });
}

export async function backupBusinessWorkspace(id: string, destination: string) {
  return invoke<BackupResult>("backup_business_workspace", { id, destination });
}

export async function restoreBusinessWorkspace(source: string) {
  return invoke<BusinessWorkspace>("restore_business_workspace", { source });
}

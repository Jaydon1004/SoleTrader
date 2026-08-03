import { invoke } from "@tauri-apps/api/core";
import { getActiveWorkspaceId } from "@/lib/database";
import type { StoredReceipt } from "@/lib/queries/expenses";

export interface MobileUploadSession {
  url: string;
  expiresInSeconds: number;
}

export function startMobileReceiptUpload() {
  return invoke<MobileUploadSession>("start_mobile_receipt_upload", {
    workspaceId: getActiveWorkspaceId(),
  });
}

export function pollMobileReceiptUpload() {
  return invoke<StoredReceipt | null>("poll_mobile_receipt_upload");
}

export function stopMobileReceiptUpload() {
  return invoke<void>("stop_mobile_receipt_upload");
}

import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile, stat } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import { getActiveWorkspaceId } from "@/lib/database";
import type { StoredReceipt } from "@/lib/queries/expenses";

const fileTypes: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function signatureMatches(bytes: Uint8Array, extension: string) {
  if (extension === "pdf")
    return String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
  if (extension === "png")
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    );
  if (extension === "jpg" || extension === "jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === "gif")
    return String.fromCharCode(...bytes.slice(0, 3)) === "GIF";
  if (extension === "webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return true;
}

function workspacePath(relativePath: string) {
  return `businesses/${getActiveWorkspaceId()}/${relativePath}`;
}

async function chooseAndStoreFile(
  directory: string,
  filters?: { name: string; extensions: string[] }[],
): Promise<StoredReceipt | null> {
  const selected = await open({
    multiple: false,
    directory: false,
    filters,
  });
  if (!selected) return null;

  const originalName = selected.split(/[\\/]/).pop() ?? "receipt";
  const extension = originalName.includes(".")
    ? (originalName.split(".").pop()?.toLowerCase() ?? "")
    : "";
  const storedName = `${Date.now()}-${crypto.randomUUID()}.${extension || "bin"}`;
  const relativePath = `${directory}/${storedName}`;
  const metadata = await stat(selected);
  if (metadata.size > MAX_ATTACHMENT_BYTES)
    throw new Error("Attachments must be 25 MB or smaller.");
  if (!fileTypes[extension])
    throw new Error("This file type is not supported.");
  const bytes = await readFile(selected);
  if (!signatureMatches(bytes, extension))
    throw new Error("The file contents do not match its extension.");
  await invoke("write_workspace_file", {
    input: {
      workspaceId: getActiveWorkspaceId(),
      relativePath,
      bytes: Array.from(bytes),
    },
  });

  return {
    path: relativePath,
    fileName: originalName,
    fileType: fileTypes[extension] ?? "application/octet-stream",
    fileSize: metadata.size,
  };
}

export function chooseAndStoreReceipt(): Promise<StoredReceipt | null> {
  return chooseAndStoreFile("receipts", [
    { name: "Receipt", extensions: ["pdf", "png", "jpg", "jpeg", "webp"] },
  ]);
}

export function chooseAndStoreDocument(): Promise<StoredReceipt | null> {
  return chooseAndStoreFile("documents", [
    { name: "Document", extensions: Object.keys(fileTypes) },
  ]);
}

export async function deleteStoredFile(relativePath: string) {
  if (!/^(receipts|documents)\/[a-zA-Z0-9._-]+$/.test(relativePath))
    throw new Error("Stored file path is invalid.");
  await invoke("delete_workspace_file", {
    workspaceId: getActiveWorkspaceId(),
    relativePath,
  });
}

export async function createStoredFileUrl(
  relativePath: string,
  fileType: string,
) {
  const bytes = await readStoredFile(relativePath);
  return URL.createObjectURL(
    new Blob([new Uint8Array(bytes)], {
      type: fileType || "application/octet-stream",
    }),
  );
}

export async function readStoredFile(relativePath: string) {
  const bytes = await invoke<number[]>("read_workspace_file", {
    workspaceId: getActiveWorkspaceId(),
    relativePath,
  });
  return Uint8Array.from(bytes);
}

export async function openStoredReceipt(relativePath: string) {
  const absolutePath = await join(
    await appDataDir(),
    workspacePath(relativePath),
  );
  await openPath(absolutePath);
}

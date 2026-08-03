import { useEffect, useState } from "react";
import { File, FileText, ImageIcon } from "lucide-react";
import { createStoredFileUrl } from "@/lib/receipt-storage";
import { cn } from "@/lib/utils";

function inferType(path: string, supplied = "") {
  if (supplied) return supplied;
  const extension = path.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension ?? ""))
    return `image/${extension === "jpg" ? "jpeg" : extension}`;
  if (extension === "pdf") return "application/pdf";
  if (["txt", "csv", "json"].includes(extension ?? "")) return "text/plain";
  return "application/octet-stream";
}

export function DocumentPreview({
  path,
  fileType = "",
  compact = false,
  className,
}: {
  path: string;
  fileType?: string;
  compact?: boolean;
  className?: string;
}) {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const type = inferType(path, fileType);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setFailed(false);
    createStoredFileUrl(path, type)
      .then((created) => {
        objectUrl = created;
        if (active) setUrl(created);
        else URL.revokeObjectURL(created);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, type]);

  if (failed || !url)
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          compact ? "h-10 w-10" : "min-h-80",
          className,
        )}
      >
        <File className={compact ? "h-4 w-4" : "h-10 w-10"} />
      </div>
    );
  if (type.startsWith("image/"))
    return (
      <img
        src={url}
        alt="Document preview"
        className={cn(
          compact
            ? "h-10 w-10 rounded object-cover"
            : "max-h-[70vh] w-full object-contain",
          className,
        )}
      />
    );
  if (!compact && (type === "application/pdf" || type.startsWith("text/")))
    return (
      <iframe
        src={url}
        title="Document preview"
        className={cn("h-[70vh] w-full border-0", className)}
      />
    );
  const Icon =
    type === "application/pdf"
      ? FileText
      : type.startsWith("image/")
        ? ImageIcon
        : File;
  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted text-muted-foreground",
        compact ? "h-10 w-10 rounded" : "min-h-80",
        className,
      )}
    >
      <Icon className={compact ? "h-4 w-4" : "h-10 w-10"} />
    </div>
  );
}

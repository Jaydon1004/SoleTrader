import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Archive,
  ArchiveRestore,
  Building2,
  Download,
  FileSearch,
  FolderOpen,
  Plus,
  Upload,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingScreen } from "@/components/loading";
import {
  auditBusinessFiles,
  backupBusinessWorkspace,
  createBusinessWorkspace,
  listBusinessWorkspaces,
  restoreBusinessWorkspace,
  setBusinessArchived,
  type BusinessWorkspace,
} from "@/lib/workspaces";

export function AccountsSelector({
  onOpen,
}: {
  onOpen: (workspace: BusinessWorkspace) => Promise<void>;
}) {
  const [workspaces, setWorkspaces] = useState<BusinessWorkspace[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setWorkspaces(await listBusinessWorkspaces());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setError("");
    setBusyId("create");
    try {
      const workspace = await createBusinessWorkspace(name);
      setWorkspaces((current) => [...current, workspace]);
      setName("");
      setCreateOpen(false);
      await onOpen(workspace);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId("");
    }
  };

  const toggleArchive = async (workspace: BusinessWorkspace) => {
    setBusyId(workspace.id);
    setError("");
    try {
      await setBusinessArchived(workspace.id, !workspace.archived);
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspace.id
            ? { ...item, archived: !item.archived }
            : item,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId("");
    }
  };

  const backup = async (workspace: BusinessWorkspace) => {
    const destination = await open({
      directory: true,
      multiple: false,
      title: `Back up ${workspace.name}`,
    });
    if (!destination) return;
    setBusyId(workspace.id);
    setError("");
    setNotice("");
    try {
      const result = await backupBusinessWorkspace(workspace.id, destination);
      setWorkspaces((current) =>
        current.map((item) =>
          item.id === workspace.id
            ? {
                ...item,
                lastBackupAt: result.completedAt,
                lastBackupFileCount: result.fileCount,
              }
            : item,
        ),
      );
      setNotice(`Verified backup completed: ${result.path}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId("");
    }
  };

  const auditFiles = async (workspace: BusinessWorkspace) => {
    setBusyId(workspace.id);
    setError("");
    setNotice("");
    try {
      const result = await auditBusinessFiles(workspace.id);
      setNotice(
        result.missing.length === 0 && result.orphaned.length === 0
          ? `${workspace.name}: all referenced files are present and no orphaned files were found.`
          : `${workspace.name}: ${result.missing.length} missing referenced file(s), ${result.orphaned.length} unreferenced file(s). No files were deleted.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId("");
    }
  };

  const restore = async () => {
    const source = await open({
      directory: true,
      multiple: false,
      title: "Choose a SoleTrader backup folder",
    });
    if (!source) return;
    setBusyId("restore");
    setError("");
    setNotice("");
    try {
      const workspace = await restoreBusinessWorkspace(source);
      setWorkspaces((current) => [...current, workspace]);
      setNotice(`${workspace.name} was restored as a separate business.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <LoadingScreen />;
  const visible = workspaces.filter(
    (workspace) => workspace.archived === showArchived,
  );
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-md bg-primary p-2 text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold">SoleTrader Accounts</h1>
              <p className="text-sm text-muted-foreground">
                Choose a business workspace
              </p>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex">
            <Button
              className="h-auto min-w-0 whitespace-normal py-2 text-center"
              variant="outline"
              onClick={() => void restore()}
              disabled={Boolean(busyId)}
            >
              <Upload className="mr-2 h-4 w-4 shrink-0" />
              Restore backup
            </Button>
            <Button
              ref={createButtonRef}
              className="h-auto min-w-0 whitespace-normal py-2 text-center"
              onClick={() => setCreateOpen(true)}
              disabled={Boolean(busyId)}
            >
              <Plus className="mr-2 h-4 w-4 shrink-0" />
              New business
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-8">
        <div className="flex flex-col items-start gap-2 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">
              {showArchived ? "Archived businesses" : "Your businesses"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Each workspace keeps its records and documents separate.
            </p>
          </div>
          <Button
            className="h-auto max-w-full self-end whitespace-normal py-2 text-center sm:self-auto"
            variant="ghost"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? (
              <ArchiveRestore className="mr-2 h-4 w-4 shrink-0" />
            ) : (
              <Archive className="mr-2 h-4 w-4 shrink-0" />
            )}
            {showArchived ? "Active businesses" : "View archive"}
          </Button>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Accounts unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertTitle>Accounts updated</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
        {visible.length === 0 ? (
          <div className="border border-dashed py-16 text-center">
            <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 font-medium">
              {showArchived ? "No archived businesses" : "No businesses yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {showArchived
                ? "Archived workspaces will appear here."
                : "Create a business to start with a blank set of books."}
            </p>
          </div>
        ) : (
          <div className="divide-y rounded-md border bg-card">
            {visible.map((workspace) => (
              <div
                key={workspace.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-4 text-left"
                  disabled={workspace.archived || busyId === workspace.id}
                  onClick={() => void onOpen(workspace)}
                >
                  <div className="rounded-md border bg-muted p-3">
                    <FolderOpen className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{workspace.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Updated{" "}
                      {new Date(workspace.updatedAt).toLocaleDateString(
                        "en-GB",
                      )}
                    </p>
                    <p
                      className={`text-xs ${
                        workspace.lastBackupAt &&
                        Date.now() - workspace.lastBackupAt <=
                          30 * 24 * 60 * 60 * 1000
                          ? "text-emerald-700"
                          : "text-amber-700"
                      }`}
                    >
                      {workspace.lastBackupAt
                        ? `Verified backup ${new Date(workspace.lastBackupAt).toLocaleDateString("en-GB")} · ${workspace.lastBackupFileCount ?? 0} files`
                        : "No verified backup recorded"}
                    </p>
                  </div>
                </button>
                <div className="flex gap-2">
                  {!workspace.archived && (
                    <Button
                      onClick={() => void onOpen(workspace)}
                      disabled={busyId === workspace.id}
                    >
                      Open
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    title="Check stored files"
                    aria-label={`Check files for ${workspace.name}`}
                    onClick={() => void auditFiles(workspace)}
                    disabled={Boolean(busyId)}
                  >
                    <FileSearch className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title="Back up business"
                    aria-label={`Back up ${workspace.name}`}
                    onClick={() => void backup(workspace)}
                    disabled={Boolean(busyId)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    title={
                      workspace.archived
                        ? "Restore business"
                        : "Archive business"
                    }
                    aria-label={
                      workspace.archived
                        ? `Restore ${workspace.name}`
                        : `Archive ${workspace.name}`
                    }
                    onClick={() => void toggleArchive(workspace)}
                    disabled={busyId === workspace.id}
                  >
                    {workspace.archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            createButtonRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a business</DialogTitle>
            <DialogDescription>
              This creates a blank, isolated workspace with its own bookkeeping
              database and document folders.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="business-name">Business name</Label>
            <Input
              id="business-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              maxLength={100}
              placeholder="Trading name"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => void create()}
              disabled={name.trim().length < 2 || busyId === "create"}
            >
              {busyId === "create" ? "Creating..." : "Create and open"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

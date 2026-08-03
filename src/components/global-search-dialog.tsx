import { useDeferredValue, useEffect, useState } from "react";
import { FileText, FolderOpen, Receipt, Search, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useGlobalSearch,
  type SearchResultKind,
} from "@/lib/queries/power-features";

const icons = {
  invoice: FileText,
  expense: Receipt,
  client: Users,
  document: FolderOpen,
} satisfies Record<SearchResultKind, typeof FileText>;

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const { data, isFetching } = useGlobalSearch(deferredSearch);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);
  const openResult = (route: string) => {
    onOpenChange(false);
    navigate(route);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Search SoleTrader</DialogTitle>
          <DialogDescription>
            Search invoices, expenses, clients, and documents.
          </DialogDescription>
        </DialogHeader>
        <div className="relative border-b">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-14 border-0 pl-12 pr-4 text-base shadow-none focus-visible:ring-0"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoices, expenses, clients, documents..."
          />
        </div>
        <div className="max-h-105 overflow-y-auto p-2">
          {search.trim().length < 2 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Enter at least two characters to search all records.
            </p>
          ) : isFetching && !data ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Searching...
            </p>
          ) : (data ?? []).length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No matching records.
            </p>
          ) : (
            (data ?? []).map((result) => {
              const Icon = icons[result.kind];
              return (
                <button
                  key={`${result.kind}-${result.id}`}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => openResult(result.route)}
                >
                  <span className="rounded-md bg-muted p-2">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {result.title}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {result.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {result.detail}
                  </span>
                </button>
              );
            })
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span>
            <kbd className="rounded border px-1">Ctrl K</kbd> search
          </span>
          <span>
            <kbd className="rounded border px-1">Ctrl Alt I</kbd> invoices
          </span>
          <span>
            <kbd className="rounded border px-1">Ctrl Alt E</kbd> expenses
          </span>
          <span>
            <kbd className="rounded border px-1">Ctrl ,</kbd> settings
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

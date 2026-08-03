import { useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/loading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueryErrorState } from "@/components/page-shell";
import {
  useAuditLog,
  useRecycleBin,
  useRestoreRecycleItems,
  type RecycleBinItem,
} from "@/lib/queries/power-features";

const actionVariant = {
  create: "success",
  update: "outline",
  delete: "destructive",
  restore: "secondary",
} as const;

function AuditTrail() {
  const [entityType, setEntityType] = useState("all");
  const [action, setAction] = useState("all");
  const query = useAuditLog(entityType, action);
  const { data, isLoading } = query;
  const entries = data ?? [];
  if (query.isError)
    return (
      <QueryErrorState
        title="Audit history could not be loaded"
        onRetry={query.refetch}
        isRetrying={query.isFetching}
      />
    );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All record types</SelectItem>
            {[
              "client",
              "invoice",
              "expense",
              "vehicle",
              "mileage",
              "vehicle_cost",
              "document",
              "capital_asset",
              "cis",
              "reminder",
              "bank_transaction",
              "bank_import",
              "invoice_payment",
              "credit_note",
              "profile",
              "tax_year_config",
              "tax_calculator_input",
              "vat_settings",
              "bank_reconciliation_settings",
              "vat_return",
              "vat_adjustment",
              "self_billing_agreement",
            ].map((value) => (
              <SelectItem value={value} key={value}>
                {value.replace("_", " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="create">Created</SelectItem>
            <SelectItem value="update">Updated</SelectItem>
            <SelectItem value="delete">Deleted</SelectItem>
            <SelectItem value="restore">Restored</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-180 text-sm">
            <caption className="sr-only">Audit trail entries</caption>
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Time</th>
                <th className="px-3 py-2 font-medium">Record</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Changes</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr className="border-b last:border-0" key={entry.id}>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {new Date(`${entry.created_at}Z`).toLocaleString("en-GB")}
                  </td>
                  <td className="px-3 py-2.5 font-medium capitalize">
                    {entry.entity_type.replace("_", " ")} #{entry.entity_id}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={actionVariant[entry.action]}>
                      {entry.action}
                    </Badge>
                  </td>
                  <td
                    className="max-w-120 truncate px-3 py-2.5 font-mono text-xs text-muted-foreground"
                    title={entry.changes}
                  >
                    {entry.changes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entries.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No audit entries match these filters.
            </p>
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Showing the 500 most recent matching changes.
      </p>
    </div>
  );
}

function RecycleBin() {
  const query = useRecycleBin();
  const { data, isLoading } = query;
  const restore = useRestoreRecycleItems();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const items = data ?? [];
  const key = (item: RecycleBinItem) => `${item.kind}:${item.id}`;
  const selectedItems = items.filter((item) => selected.has(key(item)));
  const toggle = (item: RecycleBinItem) =>
    setSelected((current) => {
      const next = new Set(current);
      const value = key(item);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  const runRestore = async (targets: RecycleBinItem[]) => {
    await restore.mutateAsync(targets);
    setSelected(new Set());
  };
  if (query.isError)
    return (
      <QueryErrorState
        title="Recycle bin could not be loaded"
        onRetry={query.refetch}
        isRetrying={query.isFetching}
      />
    );
  return (
    <div className="space-y-4">
      {selectedItems.length > 0 && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
          <span className="text-sm font-medium">
            {selectedItems.length} selected
          </span>
          <Button
            size="sm"
            onClick={() => void runRestore(selectedItems)}
            disabled={restore.isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Restore selected
          </Button>
        </div>
      )}
      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed py-14 text-center">
          <Trash2 className="mx-auto h-9 w-9 text-muted-foreground/50" />
          <p className="mt-3 font-medium">Recycle bin is empty</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-170 text-sm">
            <caption className="sr-only">Records in the recycle bin</caption>
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="w-12 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all recycle bin items"
                    checked={selected.size === items.length}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(items.map(key))
                          : new Set(),
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Deleted</th>
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr className="border-b last:border-0" key={key(item)}>
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${item.title}`}
                      checked={selected.has(key(item))}
                      onChange={() => toggle(item)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </td>
                  <td className="px-3 py-3 capitalize">
                    {item.kind.replace("_", " ")}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">
                    {new Date(`${item.deletedAt}Z`).toLocaleString("en-GB")}
                  </td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void runRestore([item])}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restore
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ActivityPage() {
  return (
    <div className="space-y-6">
      <header className="border-b pb-5">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Control & recovery
        </p>
        <h2 className="mt-1 flex items-center gap-2 text-2xl font-semibold">
          <History className="h-6 w-6" />
          Activity
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review changes and restore records moved to the recycle bin.
        </p>
      </header>
      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">
            <History className="mr-2 h-4 w-4" />
            Audit trail
          </TabsTrigger>
          <TabsTrigger value="recycle">
            <RotateCcw className="mr-2 h-4 w-4" />
            Recycle bin
          </TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="pt-4">
          <AuditTrail />
        </TabsContent>
        <TabsContent value="recycle" className="pt-4">
          <RecycleBin />
        </TabsContent>
      </Tabs>
    </div>
  );
}

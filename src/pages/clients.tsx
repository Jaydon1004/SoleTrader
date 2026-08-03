import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  useClients,
  useArchiveClient,
  type Client,
} from "@/lib/queries/clients";
import { ClientDialog } from "@/components/clients/client-dialog";
import { ClientProfileDialog } from "@/components/clients/client-profile-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Building2,
  Mail,
  Phone,
  MoreVertical,
  Pencil,
  Archive,
  ArchiveRestore,
  TrendingUp,
  Eye,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  EmptyState,
  FilterToolbar,
  PageHeader,
  PageSkeleton,
  QueryErrorState,
  SavedViews,
} from "@/components/page-shell";
import { useFeedback } from "@/components/feedback-provider";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(n);
}

function ClientCard({
  client,
  onView,
  onEdit,
  onArchive,
}: {
  client: Client;
  onView: (c: Client) => void;
  onEdit: (c: Client) => void;
  onArchive: (c: Client) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={`relative rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md ${client.archived ? "opacity-60" : ""}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{client.name}</h3>
            {client.archived && (
              <Badge variant="secondary" className="text-xs">
                Archived
              </Badge>
            )}
          </div>
          {client.company && (
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <Building2 className="h-3 w-3 shrink-0" /> {client.company}
            </p>
          )}
        </div>
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Actions for ${client.name}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-10 w-36 rounded-lg border bg-popover shadow-lg">
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  onView(client);
                  setMenuOpen(false);
                }}
              >
                <Eye className="h-4 w-4" /> View profile
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  onEdit(client);
                  setMenuOpen(false);
                }}
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  onArchive(client);
                  setMenuOpen(false);
                }}
              >
                {client.archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {client.archived ? "Unarchive" : "Archive"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="mb-4 space-y-1">
        {client.email && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-3 w-3 shrink-0" />
            <a
              href={`mailto:${client.email}`}
              className="truncate hover:text-foreground"
            >
              {client.email}
            </a>
          </p>
        )}
        {client.phone && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <a href={`tel:${client.phone}`} className="hover:text-foreground">
              {client.phone}
            </a>
          </p>
        )}
        {client.city && (
          <p className="text-sm text-muted-foreground">
            {[client.city, client.postcode].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      {/* Financials */}
      <div className="grid grid-cols-3 gap-2 border-t pt-3">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Invoiced</p>
          <p className="text-sm font-semibold">
            {formatCurrency(client.total_invoiced ?? 0)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="text-sm font-semibold text-green-600 dark:text-green-400">
            {formatCurrency(client.total_paid ?? 0)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Outstanding</p>
          <p
            className={`text-sm font-semibold ${(client.outstanding ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}
          >
            {formatCurrency(client.outstanding ?? 0)}
          </p>
        </div>
      </div>

      {(client.invoice_count ?? 0) > 0 && (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="h-3 w-3" />
          {client.invoice_count} invoice
          {(client.invoice_count ?? 0) !== 1 ? "s" : ""}
        </p>
      )}
      <Button
        className="mt-3 w-full"
        variant="outline"
        size="sm"
        onClick={() => onView(client)}
      >
        <Eye className="mr-2 h-4 w-4" /> View profile
      </Button>
    </div>
  );
}

type SortOption =
  "name-asc" | "name-desc" | "outstanding-desc" | "invoiced-desc" | "newest";
type ClientView = "all" | "outstanding" | "recent";

export function ClientsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  useEffect(() => setSearch(searchParams.get("search") ?? ""), [searchParams]);
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortOption>("name-asc");
  const [view, setView] = useState<ClientView>(() =>
    ["outstanding", "recent"].includes(searchParams.get("view") ?? "")
      ? (searchParams.get("view") as ClientView)
      : "all",
  );
  const [layout, setLayout] = useState<"table" | "cards">("table");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [profileClient, setProfileClient] = useState<Client | null>(null);
  useEffect(() => {
    if (searchParams.get("new") !== "client") return;
    setEditClient(null);
    setDialogOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const clientQuery = useClients(showArchived);
  const { data: clients, isLoading } = clientQuery;
  const archive = useArchiveClient();
  const { confirm, toast } = useFeedback();

  const filtered = (clients ?? [])
    .filter((c) => {
      const q = search.trim().toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.city.toLowerCase().includes(q) ||
        c.postcode.toLowerCase().includes(q)
      );
    })
    .filter((client) => view !== "outstanding" || (client.outstanding ?? 0) > 0)
    .filter(
      (client) =>
        view !== "recent" ||
        Date.now() - new Date(`${client.created_at}Z`).getTime() <=
          90 * 24 * 60 * 60 * 1000,
    )
    .sort((left, right) => {
      if (sort === "name-desc") return right.name.localeCompare(left.name);
      if (sort === "outstanding-desc")
        return (right.outstanding ?? 0) - (left.outstanding ?? 0);
      if (sort === "invoiced-desc")
        return (right.total_invoiced ?? 0) - (left.total_invoiced ?? 0);
      if (sort === "newest")
        return right.created_at.localeCompare(left.created_at);
      return left.name.localeCompare(right.name);
    });

  const handleEdit = (c: Client) => {
    setEditClient(c);
    setDialogOpen(true);
  };
  const handleView = (c: Client) => setProfileClient(c);
  const handleArchive = async (c: Client) => {
    const action = c.archived ? "restore" : "archive";
    if (
      !(await confirm({
        title: `${c.archived ? "Restore" : "Archive"} ${c.name}?`,
        description: c.archived
          ? "The client will return to active client lists."
          : "Existing invoices and financial history remain unchanged.",
        confirmLabel: c.archived ? "Restore client" : "Archive client",
        destructive: !c.archived,
      }))
    )
      return;
    archive.mutate(
      { id: c.id, archived: !c.archived },
      {
        onSuccess: () =>
          toast(`Client ${action}d`, {
            actionLabel: "Undo",
            onAction: () =>
              archive.mutateAsync({ id: c.id, archived: Boolean(c.archived) }),
          }),
      },
    );
  };
  const handleAdd = () => {
    setEditClient(null);
    setDialogOpen(true);
  };

  const activeCount = (clients ?? []).filter((c) => !c.archived).length;
  const changeView = (nextView: ClientView) => {
    setView(nextView);
    const next = new URLSearchParams(searchParams);
    if (nextView === "all") next.delete("view");
    else next.set("view", nextView);
    setSearchParams(next, { replace: true });
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("search", value);
    else next.delete("search");
    setSearchParams(next, { replace: true });
  };

  if (isLoading) return <PageSkeleton rows={7} />;
  if (clientQuery.isError)
    return (
      <QueryErrorState
        title="Clients could not be loaded"
        onRetry={clientQuery.refetch}
        isRetrying={clientQuery.isFetching}
      />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customers"
        title="Clients"
        description={`${activeCount} active client${activeCount === 1 ? "" : "s"}. Review contact details, outstanding balances and complete financial history.`}
        primaryAction={
          <Button onClick={handleAdd}>
            <UserPlus className="mr-2 h-4 w-4" />
            Add client
          </Button>
        }
      />

      <SavedViews
        value={view}
        onChange={changeView}
        views={[
          { value: "all", label: "All clients", count: activeCount },
          { value: "outstanding", label: "Outstanding balances" },
          { value: "recent", label: "Recently added" },
        ]}
      />

      <FilterToolbar
        search={search}
        onSearchChange={changeSearch}
        placeholder="Search name, company, email or postcode..."
        activeCount={(search ? 1 : 0) + (showArchived ? 1 : 0)}
        onClear={() => {
          changeSearch("");
          setShowArchived(false);
        }}
        trailing={
          <div
            className="flex rounded-md border p-0.5"
            aria-label="Client layout"
          >
            <Button
              size="icon"
              variant={layout === "table" ? "secondary" : "ghost"}
              className="h-8 w-8"
              aria-label="Show clients in table view"
              onClick={() => setLayout("table")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={layout === "cards" ? "secondary" : "ghost"}
              className="h-8 w-8"
              aria-label="Show clients in card view"
              onClick={() => setLayout("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        }
      >
        <Select
          value={sort}
          onValueChange={(value) => setSort(value as SortOption)}
        >
          <SelectTrigger className="w-44" aria-label="Sort clients">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name: A to Z</SelectItem>
            <SelectItem value="name-desc">Name: Z to A</SelectItem>
            <SelectItem value="outstanding-desc">
              Outstanding: high first
            </SelectItem>
            <SelectItem value="invoiced-desc">Invoiced: high first</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch
            id="show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived" className="text-sm cursor-pointer">
            Show archived
          </Label>
        </div>
      </FilterToolbar>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={
            search || view !== "all"
              ? "No clients match this view"
              : "Add your first client"
          }
          description={
            search || view !== "all"
              ? "Clear the filters or choose another saved view."
              : "Client records keep invoices, payments, documents and contact details together."
          }
          action={
            !search && view === "all" ? (
              <Button onClick={handleAdd}>
                <UserPlus className="mr-2 h-4 w-4" />
                Add client
              </Button>
            ) : undefined
          }
        />
      ) : layout === "cards" ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              onView={handleView}
              onEdit={handleEdit}
              onArchive={handleArchive}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full min-w-210 text-sm">
            <caption className="sr-only">
              Clients and their invoiced, paid and outstanding totals
            </caption>
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 text-right font-medium">Invoiced</th>
                <th className="px-4 py-2 text-right font-medium">Paid</th>
                <th className="px-4 py-2 text-right font-medium">
                  Outstanding
                </th>
                <th className="w-36 px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr
                  key={client.id}
                  className={`border-b last:border-0 hover:bg-muted/40 ${client.archived ? "opacity-60" : ""}`}
                >
                  <td className="px-4 py-3">
                    <button
                      className="text-left"
                      onClick={() => handleView(client)}
                    >
                      <span className="block font-semibold">{client.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {client.company ||
                          [client.city, client.postcode]
                            .filter(Boolean)
                            .join(" · ") ||
                          "Individual client"}
                      </span>
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{client.email || "No email"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {client.phone || "No phone"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(client.total_invoiced ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCurrency(client.total_paid ?? 0)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-semibold tabular-nums ${(client.outstanding ?? 0) > 0 ? "text-amber-700 dark:text-amber-400" : ""}`}
                  >
                    {formatCurrency(client.outstanding ?? 0)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleView(client)}
                      >
                        View
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(client)}
                        aria-label={`Edit ${client.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => void handleArchive(client)}
                        aria-label={`${client.archived ? "Restore" : "Archive"} ${client.name}`}
                      >
                        {client.archived ? (
                          <ArchiveRestore className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditClient(null);
        }}
        client={editClient}
      />
      <ClientProfileDialog
        open={profileClient !== null}
        onOpenChange={(open) => {
          if (!open) setProfileClient(null);
        }}
        client={profileClient}
      />
    </div>
  );
}

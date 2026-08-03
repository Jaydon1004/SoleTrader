import {
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  History,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  UserRoundPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading";
import {
  useClientPayments,
  useClientWorkspace,
  type Client,
} from "@/lib/queries/clients";

interface ClientProfileDialogProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function ClientProfileDialog({
  client,
  open,
  onOpenChange,
}: ClientProfileDialogProps) {
  const { data: payments, isLoading } = useClientPayments(
    open ? (client?.id ?? null) : null,
  );
  const { data: workspace, isLoading: workspaceLoading } = useClientWorkspace(
    open ? (client?.id ?? null) : null,
  );

  if (!client) return null;

  const address = [
    client.address_line_1,
    client.address_line_2,
    client.city,
    client.county,
    client.postcode,
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="left-auto right-0 top-0 h-screen max-h-none w-full max-w-2xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-r-0">
        <DialogHeader>
          <div className="flex items-center gap-2 pr-8">
            <DialogTitle>{client.name}</DialogTitle>
            {client.archived === 1 && (
              <Badge variant="secondary">Archived</Badge>
            )}
          </div>
          <DialogDescription>
            {client.company || "Client profile and payment activity"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 border-y py-3">
          <Button asChild>
            <Link
              to={`/invoices?new=invoice&clientId=${client.id}`}
              onClick={() => onOpenChange(false)}
            >
              <UserRoundPlus className="mr-2 h-4 w-4" />
              Create invoice
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link
              to={`/invoices?view=outstanding&clientId=${client.id}`}
              onClick={() => onOpenChange(false)}
            >
              <CreditCard className="mr-2 h-4 w-4" />
              Record payment
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link
              to={`/documents?clientId=${client.id}`}
              onClick={() => onOpenChange(false)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Client documents
            </Link>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
          <section className="space-y-5">
            <div>
              <h3 className="mb-3 text-sm font-semibold">Contact details</h3>
              <div className="space-y-2 text-sm">
                {client.company && (
                  <p className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{client.company}</span>
                  </p>
                )}
                {client.email && (
                  <a
                    className="flex items-start gap-2 hover:underline"
                    href={`mailto:${client.email}`}
                  >
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="break-all">{client.email}</span>
                  </a>
                )}
                {client.phone && (
                  <a
                    className="flex items-start gap-2 hover:underline"
                    href={`tel:${client.phone}`}
                  >
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>{client.phone}</span>
                  </a>
                )}
                {address.length > 0 && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      {address.map((line) => (
                        <span className="block" key={line}>
                          {line}
                        </span>
                      ))}
                    </span>
                  </p>
                )}
                {!client.company &&
                  !client.email &&
                  !client.phone &&
                  address.length === 0 && (
                    <p className="text-muted-foreground">
                      No contact details added.
                    </p>
                  )}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold">Notes</h3>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {client.notes || "No notes added."}
              </p>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 self-start">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total invoiced</p>
              <p className="mt-1 font-semibold">
                {currencyFormatter.format(client.total_invoiced ?? 0)}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total paid</p>
              <p className="mt-1 font-semibold text-green-600 dark:text-green-400">
                {currencyFormatter.format(client.total_paid ?? 0)}
              </p>
            </div>
            <div className="col-span-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                Outstanding balance
              </p>
              <p className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
                {currencyFormatter.format(client.outstanding ?? 0)}
              </p>
            </div>
          </section>
        </div>

        <section className="border-t pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4" />
              Invoice history
            </h3>
            <span className="text-xs text-muted-foreground">
              {workspace?.invoices.length ?? 0} invoice
              {workspace?.invoices.length === 1 ? "" : "s"}
            </span>
          </div>
          {workspaceLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : workspace?.invoices.length ? (
            <div className="overflow-hidden rounded-md border">
              {workspace.invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b p-3 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold">{invoice.reference}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Issued{" "}
                      {dateFormatter.format(
                        new Date(`${invoice.issue_date}T00:00:00`),
                      )}{" "}
                      · due{" "}
                      {dateFormatter.format(
                        new Date(`${invoice.due_date}T00:00:00`),
                      )}{" "}
                      ·{" "}
                      <span className="capitalize">
                        {invoice.status.replace("_", " ")}
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {currencyFormatter.format(invoice.total)}
                    </p>
                    {invoice.balance_due > 0 && (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="mt-1"
                      >
                        <Link
                          to={`/invoices?open=${invoice.id}&action=payment`}
                          onClick={() => onOpenChange(false)}
                        >
                          Record payment
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No invoices for this client.
            </p>
          )}
        </section>

        <section className="border-t pt-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ReceiptText className="h-4 w-4" /> Payment history
            </h3>
            <span className="text-xs text-muted-foreground">
              {payments?.length ?? 0} payment{payments?.length === 1 ? "" : "s"}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : payments && payments.length > 0 ? (
            <div className="overflow-hidden rounded-md border">
              {payments.map((payment) => (
                <div
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b p-3 last:border-b-0"
                  key={payment.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      Invoice {payment.invoice_reference}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CalendarDays className="h-3 w-3" />
                        {dateFormatter.format(
                          new Date(`${payment.payment_date}T00:00:00`),
                        )}
                      </span>
                      {payment.payment_method && (
                        <span className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3" />{" "}
                          {payment.payment_method}
                        </span>
                      )}
                    </div>
                    {payment.notes && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {payment.notes}
                      </p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-green-600 dark:text-green-400">
                    {currencyFormatter.format(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-8 text-center">
              <ReceiptText className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
              <p className="text-sm font-medium">No payments recorded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Payments recorded against this client's invoices will appear
                here.
              </p>
            </div>
          )}
        </section>

        <div className="grid gap-5 border-t pt-5 md:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4" />
                Documents
              </h3>
              <Badge variant="secondary">
                {workspace?.documents.length ?? 0}
              </Badge>
            </div>
            {workspace?.documents.length ? (
              <div className="space-y-2">
                {workspace.documents.slice(0, 8).map((document) => (
                  <Link
                    key={document.id}
                    to={`/documents?search=${encodeURIComponent(document.file_name)}`}
                    onClick={() => onOpenChange(false)}
                    className="block rounded-md border p-2 hover:bg-muted"
                  >
                    <span className="block truncate text-sm font-medium">
                      {document.file_name}
                    </span>
                    <span className="text-xs capitalize text-muted-foreground">
                      {document.category.replace("_", " ")}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No client documents linked.
              </p>
            )}
          </section>
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" />
                Activity
              </h3>
              <Badge variant="secondary">
                {workspace?.activity.length ?? 0}
              </Badge>
            </div>
            {workspace?.activity.length ? (
              <div className="space-y-2">
                {workspace.activity.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="rounded-md border p-2">
                    <p className="text-sm font-medium capitalize">
                      {entry.entity_type} {entry.action}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(`${entry.created_at}Z`).toLocaleString("en-GB")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recorded activity yet.
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

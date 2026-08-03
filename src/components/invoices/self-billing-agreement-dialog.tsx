import { useEffect, useState } from "react";
import { Archive, FileCheck2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useClients } from "@/lib/queries/clients";
import {
  agreementStatus,
  useArchiveSelfBillingAgreement,
  useCreateSelfBillingAgreement,
  useSelfBillingAgreements,
  useSelfBillingDocuments,
  useUpdateSelfBillingAgreement,
  type SelfBillingAgreement,
} from "@/lib/queries/self-billing";
import { useFeedback } from "@/components/feedback-provider";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialClientId?: number | null;
}

const emptyForm = {
  clientId: "",
  startDate: "",
  expiryDate: "",
  vatNumber: "",
  documentId: "none",
  notes: "",
};

export function SelfBillingAgreementDialog({
  open,
  onOpenChange,
  initialClientId = null,
}: Props) {
  const { data: clients } = useClients(false);
  const { data: agreements } = useSelfBillingAgreements(undefined, true);
  const create = useCreateSelfBillingAgreement();
  const update = useUpdateSelfBillingAgreement();
  const archive = useArchiveSelfBillingAgreement();
  const { confirm, toast } = useFeedback();
  const [editing, setEditing] = useState<SelfBillingAgreement | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const { clearDirty, dirty, dirtyCaptureProps, requestClose } =
    useUnsavedDialog({ open, onOpenChange, subject: "self-billing agreement" });
  const selectedClientId = form.clientId ? Number(form.clientId) : null;
  const { data: documents } = useSelfBillingDocuments(
    selectedClientId,
    "agreement",
  );

  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setShowForm(Boolean(initialClientId));
    setForm({
      ...emptyForm,
      clientId: initialClientId ? String(initialClientId) : "",
    });
    setError("");
  }, [initialClientId, open]);

  const startEdit = (agreement: SelfBillingAgreement) => {
    setEditing(agreement);
    setShowForm(true);
    setForm({
      clientId: String(agreement.client_id),
      startDate: agreement.start_date,
      expiryDate: agreement.expiry_date,
      vatNumber: agreement.customer_vat_number,
      documentId: agreement.document_id
        ? String(agreement.document_id)
        : "none",
      notes: agreement.notes,
    });
    setError("");
  };

  const resetForm = () => {
    setEditing(null);
    setShowForm(false);
    setForm({
      ...emptyForm,
      clientId: initialClientId ? String(initialClientId) : "",
    });
    setError("");
  };

  const save = async () => {
    setError("");
    if (!form.clientId) return setError("Select a customer.");
    if (!form.startDate || !form.expiryDate)
      return setError("Enter the agreement start and expiry dates.");
    if (form.expiryDate < form.startDate)
      return setError("The expiry date cannot be before the start date.");
    const input = {
      client_id: Number(form.clientId),
      start_date: form.startDate,
      expiry_date: form.expiryDate,
      customer_vat_number: form.vatNumber,
      document_id: form.documentId === "none" ? null : Number(form.documentId),
      notes: form.notes,
    };
    try {
      if (editing) await update.mutateAsync({ id: editing.id, ...input });
      else await create.mutateAsync(input);
      clearDirty();
      resetForm();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The agreement could not be saved.",
      );
    }
  };

  const visibleAgreements = (agreements ?? []).filter(
    (agreement) => !initialClientId || agreement.client_id === initialClientId,
  );
  const pending = create.isPending || update.isPending || archive.isPending;
  const cancelForm = async () => {
    if (
      dirty &&
      !(await confirm({
        title: "Discard unsaved agreement?",
        description: "The agreement details have not been saved.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    clearDirty();
    resetForm();
  };
  const archiveAgreement = async (agreement: SelfBillingAgreement) => {
    if (
      !(await confirm({
        title: "Archive this agreement?",
        description: "Historical self-bills will retain the agreement link.",
        confirmLabel: "Archive agreement",
        destructive: true,
      }))
    )
      return;
    await archive.mutateAsync(agreement.id);
    toast("Self-billing agreement archived");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
    >
      <DialogContent
        className="max-h-[92vh] max-w-3xl overflow-y-auto"
        {...dirtyCaptureProps}
      >
        <DialogHeader>
          <DialogTitle>Self-billing agreements</DialogTitle>
          <DialogDescription>
            Keep the written customer agreement and its coverage dates with the
            bookkeeping record.
          </DialogDescription>
        </DialogHeader>

        {!showForm && (
          <Button className="w-fit" onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add agreement
          </Button>
        )}

        {showForm && (
          <div className="space-y-4 rounded-md border p-4">
            <h3 className="text-sm font-semibold">
              {editing ? "Edit agreement" : "New agreement"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Customer</Label>
                <Select
                  value={form.clientId}
                  onValueChange={(clientId) =>
                    setForm((current) => ({
                      ...current,
                      clientId,
                      documentId: "none",
                    }))
                  }
                  disabled={Boolean(initialClientId)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {(clients ?? []).map((client) => (
                      <SelectItem key={client.id} value={String(client.id)}>
                        {client.company || client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Starts</Label>
                <Input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Expires</Label>
                <Input
                  type="date"
                  value={form.expiryDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiryDate: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Customer VAT number</Label>
                <Input
                  value={form.vatNumber}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      vatNumber: event.target.value,
                    }))
                  }
                  placeholder="Required when self-bills include VAT"
                />
              </div>
              <div className="space-y-2">
                <Label>Signed agreement document</Label>
                <Select
                  value={form.documentId}
                  onValueChange={(documentId) =>
                    setForm((current) => ({ ...current, documentId }))
                  }
                  disabled={!selectedClientId}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No document selected</SelectItem>
                    {(documents ?? []).map((document) => (
                      <SelectItem key={document.id} value={String(document.id)}>
                        {document.file_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  File agreement evidence as a Contract in Documents first.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => void cancelForm()}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button onClick={() => void save()} disabled={pending}>
                {pending ? "Saving..." : "Save agreement"}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {visibleAgreements.map((agreement) => {
            const status = agreementStatus(agreement);
            return (
              <div
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                key={agreement.id}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{agreement.client_name}</span>
                    <Badge
                      variant={
                        status === "active"
                          ? "success"
                          : status === "expired"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {agreement.start_date} to {agreement.expiry_date}
                    {agreement.customer_vat_number
                      ? ` · VAT ${agreement.customer_vat_number}`
                      : ""}
                  </p>
                  {agreement.document_name && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <FileCheck2 className="h-3.5 w-3.5" />{" "}
                      {agreement.document_name}
                    </p>
                  )}
                </div>
                {!agreement.archived && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit agreement with ${agreement.client_name}`}
                      onClick={() => startEdit(agreement)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Archive agreement with ${agreement.client_name}`}
                      onClick={() => void archiveAgreement(agreement)}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {visibleAgreements.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No self-billing agreements recorded.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

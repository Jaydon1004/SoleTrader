import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateClient,
  useUpdateClient,
  type Client,
  type ClientInput,
} from "@/lib/queries/clients";

const EMPTY: ClientInput = {
  name: "",
  company: "",
  email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  county: "",
  postcode: "",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client | null;
}

export function ClientDialog({ open, onOpenChange, client }: Props) {
  const [form, setForm] = useState<ClientInput>(EMPTY);
  const create = useCreateClient();
  const update = useUpdateClient();
  const isEditing = !!client;

  useEffect(() => {
    setForm(client ? { ...EMPTY, ...client } : EMPTY);
  }, [client, open]);

  const set = (k: keyof ClientInput, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    if (isEditing && client) {
      await update.mutateAsync({ id: client.id, ...form });
    } else {
      await create.mutateAsync(form);
    }
    onOpenChange(false);
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Client" : "Add Client"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="John Smith"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>
                Company{" "}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Input
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="ABC Construction Ltd"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="07700 900000"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Address Line 1</Label>
            <Input
              value={form.address_line_1}
              onChange={(e) => set("address_line_1", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>
              Address Line 2{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              value={form.address_line_2}
              onChange={(e) => set("address_line_2", e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Town / City</Label>
              <Input
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>
                County{" "}
                <span className="text-muted-foreground text-xs">
                  (optional)
                </span>
              </Label>
              <Input
                value={form.county}
                onChange={(e) => set("county", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Postcode</Label>
              <Input
                value={form.postcode}
                onChange={(e) => set("postcode", e.target.value.toUpperCase())}
                maxLength={8}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              Notes{" "}
              <span className="text-muted-foreground text-xs">
                (internal only)
              </span>
            </Label>
            <Textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Payment terms, site contacts, special requirements..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !form.name.trim()}
          >
            {isPending
              ? "Saving..."
              : isEditing
                ? "Save Changes"
                : "Add Client"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

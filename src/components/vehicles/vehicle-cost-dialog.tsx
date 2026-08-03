import { useEffect, useState } from "react";
import { format } from "date-fns";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  chooseAndStoreReceipt,
  deleteStoredFile,
  openStoredReceipt,
} from "@/lib/receipt-storage";
import { useUserProfile } from "@/lib/queries/settings";
import {
  useSaveVehicleCost,
  type Vehicle,
  type VehicleCost,
  type VehicleCostType,
} from "@/lib/queries/vehicles";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  cost?: VehicleCost | null;
}

export function VehicleCostDialog({
  open,
  onOpenChange,
  vehicles,
  cost,
}: Props) {
  const saveCost = useSaveVehicleCost();
  const { data: profile } = useUserProfile();
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState("");
  const [type, setType] = useState<VehicleCostType>("fuel");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [capitalAsset, setCapitalAsset] = useState(false);
  const [notes, setNotes] = useState("");
  const [receiptPath, setReceiptPath] = useState("");
  const [receiptFile, setReceiptFile] =
    useState<Awaited<ReturnType<typeof chooseAndStoreReceipt>>>(null);
  const [error, setError] = useState("");
  const { closeAfterSave, dirtyCaptureProps, markDirty, requestClose } =
    useUnsavedDialog({
      open,
      onOpenChange,
      subject: "vehicle cost",
      onDiscard: async () => {
        if (receiptFile)
          await deleteStoredFile(receiptFile.path).catch(() => undefined);
      },
    });
  const eligible = vehicles.filter(
    (vehicle) => vehicle.cost_method === "actual" && vehicle.archived === 0,
  );
  const vatRegistered = profile?.vat_status !== "unregistered";

  useEffect(() => {
    if (!open) return;
    const defaultVehicle = vehicles.find(
      (vehicle) => vehicle.cost_method === "actual" && vehicle.archived === 0,
    );
    setVehicleId(
      cost
        ? String(cost.vehicle_id)
        : defaultVehicle
          ? String(defaultVehicle.id)
          : "",
    );
    setDate(cost?.date ?? format(new Date(), "yyyy-MM-dd"));
    setType(cost?.cost_type ?? "fuel");
    setDescription(cost?.description ?? "");
    setAmount(cost ? String(cost.amount) : "");
    setVatAmount(cost?.vat_amount ? String(cost.vat_amount) : "");
    setCapitalAsset(cost?.vat_capital_asset === 1);
    setNotes(cost?.notes ?? "");
    setReceiptPath(cost?.receipt_path ?? "");
    setReceiptFile(null);
    setError("");
  }, [open, cost, vehicles]);

  const pickReceipt = async () => {
    setError("");
    try {
      const file = await chooseAndStoreReceipt();
      if (file) {
        if (receiptFile)
          await deleteStoredFile(receiptFile.path).catch(() => undefined);
        markDirty();
        setReceiptFile(file);
        setReceiptPath(file.path);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Receipt could not be stored.",
      );
    }
  };

  const save = async () => {
    const parsedAmount = Number(amount);
    const parsedVat = vatRegistered ? Number(vatAmount || 0) : 0;
    if (!vehicleId) return setError("Add or select an actual-cost vehicle.");
    if (!date || !Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return setError("Enter a date and amount greater than zero.");
    if (
      !Number.isFinite(parsedVat) ||
      parsedVat < 0 ||
      parsedVat > parsedAmount
    )
      return setError("VAT must be between zero and the total amount.");
    try {
      await saveCost.mutateAsync({
        id: cost?.id,
        vehicle_id: Number(vehicleId),
        date,
        cost_type: type,
        description: description.trim(),
        amount: parsedAmount,
        vat_amount: parsedVat,
        vat_capital_asset: vatRegistered && capitalAsset,
        receipt_path: receiptPath,
        receipt_file: receiptFile,
        notes: notes.trim(),
      });
      setReceiptFile(null);
      closeAfterSave();
    } catch (caught) {
      if (receiptFile) {
        setReceiptFile(null);
        setReceiptPath(cost?.receipt_path ?? "");
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Vehicle cost could not be saved.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
    >
      <DialogContent
        className="max-h-[94vh] max-w-xl overflow-y-auto"
        {...dirtyCaptureProps}
      >
        <DialogHeader>
          <DialogTitle>
            {cost ? "Edit vehicle cost" : "Add vehicle cost"}
          </DialogTitle>
          <DialogDescription>
            The vehicle's business-use percentage is captured with this cost for
            accurate historical deductions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vehicle</Label>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Cost type</Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as VehicleCostType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">Fuel</SelectItem>
                  <SelectItem value="insurance">Insurance</SelectItem>
                  <SelectItem value="mot">MOT</SelectItem>
                  <SelectItem value="servicing">Servicing</SelectItem>
                  <SelectItem value="repairs">Repairs</SelectItem>
                  <SelectItem value="road_tax">Road tax</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Total amount</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>VAT included</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={vatAmount}
                onChange={(event) => setVatAmount(event.target.value)}
                disabled={!vatRegistered}
              />
              <p className="text-xs text-muted-foreground">
                {vatRegistered
                  ? "VAT shown on the receipt"
                  : "Enable VAT registration in Settings"}
              </p>
            </div>
            {vatRegistered && (
              <div className="flex items-start justify-between gap-3 rounded-md border p-3">
                <div>
                  <Label htmlFor="vehicle-capital-asset">
                    Flat-rate capital goods
                  </Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Potentially reclaimable under the Flat Rate Scheme.
                  </p>
                </div>
                <Switch
                  id="vehicle-capital-asset"
                  checked={capitalAsset}
                  onCheckedChange={setCapitalAsset}
                />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label>Receipt</Label>
                <p className="text-xs text-muted-foreground">
                  Stored locally on this device.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={pickReceipt}>
                <Paperclip className="mr-2 h-4 w-4" />
                {receiptPath ? "Replace" : "Attach"}
              </Button>
            </div>
            {receiptPath && (
              <div className="mt-3 flex items-center justify-between rounded-md bg-muted p-2 text-sm">
                <button
                  className="flex min-w-0 items-center gap-2 hover:underline"
                  onClick={() => void openStoredReceipt(receiptPath)}
                >
                  <FileText className="h-4 w-4" />
                  <span className="truncate">
                    {receiptFile?.fileName ?? receiptPath.split("/").pop()}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove receipt"
                  onClick={() => {
                    if (receiptFile)
                      void deleteStoredFile(receiptFile.path).catch(
                        () => undefined,
                      );
                    setReceiptPath("");
                    setReceiptFile(null);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => void requestClose()}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saveCost.isPending || eligible.length === 0}
          >
            {saveCost.isPending ? "Saving..." : "Save cost"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

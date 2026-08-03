import { useEffect, useState } from "react";
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
import {
  useCreateVehicle,
  useUpdateVehicle,
  type Vehicle,
  type VehicleCostMethod,
  type VehicleType,
} from "@/lib/queries/vehicles";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: Vehicle | null;
}

export function VehicleDialog({ open, onOpenChange, vehicle }: Props) {
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const [name, setName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [registration, setRegistration] = useState("");
  const [vehicleType, setVehicleType] = useState<VehicleType>("car");
  const [costMethod, setCostMethod] = useState<VehicleCostMethod>("mileage");
  const [businessPercent, setBusinessPercent] = useState("100");
  const [error, setError] = useState("");
  const { closeAfterSave, dirtyCaptureProps, requestClose } = useUnsavedDialog({
    open,
    onOpenChange,
    subject: "vehicle",
  });

  useEffect(() => {
    if (!open) return;
    setName(vehicle?.name ?? "");
    setMake(vehicle?.make ?? "");
    setModel(vehicle?.model ?? "");
    setRegistration(vehicle?.registration ?? "");
    setVehicleType(vehicle?.vehicle_type ?? "car");
    setCostMethod(vehicle?.cost_method ?? "mileage");
    setBusinessPercent(String(vehicle?.business_percent ?? 100));
    setError("");
  }, [open, vehicle]);

  const save = async () => {
    const percent = Number(businessPercent);
    if (!name.trim()) return setError("Enter a vehicle name.");
    if (
      costMethod === "actual" &&
      (!Number.isFinite(percent) || percent < 1 || percent > 100)
    )
      return setError("Business use must be between 1% and 100%.");
    try {
      const data = {
        name: name.trim(),
        make: make.trim(),
        model: model.trim(),
        registration: registration.trim(),
        vehicle_type: vehicleType,
        cost_method: costMethod,
        business_percent: costMethod === "actual" ? percent : 100,
      };
      if (vehicle) await update.mutateAsync({ id: vehicle.id, ...data });
      else await create.mutateAsync(data);
      closeAfterSave();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Vehicle could not be saved.",
      );
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) void requestClose();
      }}
    >
      <DialogContent className="max-w-xl" {...dirtyCaptureProps}>
        <DialogHeader>
          <DialogTitle>{vehicle ? "Edit vehicle" : "Add vehicle"}</DialogTitle>
          <DialogDescription>
            Choose one HMRC deduction method per vehicle. The method locks after
            activity is recorded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Work van"
              />
            </div>
            <div className="space-y-2">
              <Label>Registration</Label>
              <Input
                value={registration}
                onChange={(event) =>
                  setRegistration(event.target.value.toUpperCase())
                }
                placeholder="AB12 CDE"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Make</Label>
              <Input
                value={make}
                onChange={(event) => setMake(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vehicle type</Label>
              <Select
                value={vehicleType}
                onValueChange={(value) => setVehicleType(value as VehicleType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="van">Van</SelectItem>
                  <SelectItem value="motorcycle">Motorcycle</SelectItem>
                  <SelectItem value="bicycle">Bicycle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Deduction method</Label>
              <Select
                value={costMethod}
                onValueChange={(value) =>
                  setCostMethod(value as VehicleCostMethod)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mileage">HMRC mileage rates</SelectItem>
                  <SelectItem value="actual">Actual vehicle costs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {costMethod === "actual" && (
            <div className="space-y-2">
              <Label>Business use %</Label>
              <Input
                className="w-40"
                type="number"
                min="1"
                max="100"
                value={businessPercent}
                onChange={(event) => setBusinessPercent(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Applied to each cost when recorded and retained historically.
              </p>
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => void requestClose()}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving..." : "Save vehicle"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

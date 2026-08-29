import { useEffect, useState } from "react";
import { format } from "date-fns";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useSaveMileage,
  type MileageLog,
  type Vehicle,
} from "@/lib/queries/vehicles";
import { useTaxYearConfig } from "@/lib/queries/settings";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: Vehicle[];
  log?: MileageLog | null;
  copy?: boolean;
  currentTaxYear: string;
}
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function MileageDialog({
  open,
  onOpenChange,
  vehicles,
  log,
  copy = false,
  currentTaxYear,
}: Props) {
  const saveMileage = useSaveMileage();
  const { data: config } = useTaxYearConfig(currentTaxYear);
  const [vehicleId, setVehicleId] = useState("");
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [purpose, setPurpose] = useState("");
  const [distance, setDistance] = useState("");
  const [passengers, setPassengers] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const { closeAfterSave, dirtyCaptureProps, requestClose } = useUnsavedDialog({
    open,
    onOpenChange,
    subject: "mileage journey",
  });
  const eligible = vehicles.filter(
    (vehicle) => vehicle.cost_method === "mileage" && vehicle.archived === 0,
  );

  useEffect(() => {
    if (!open) return;
    const defaultVehicle = vehicles.find(
      (vehicle) => vehicle.cost_method === "mileage" && vehicle.archived === 0,
    );
    setVehicleId(
      log
        ? String(log.vehicle_id)
        : defaultVehicle
          ? String(defaultVehicle.id)
          : "",
    );
    setDate(log?.date ?? format(new Date(), "yyyy-MM-dd"));
    setStart(log?.start_location ?? "");
    setEnd(log?.end_location ?? "");
    setPurpose(log?.purpose ?? "");
    setDistance(log ? String(log.distance_miles) : "");
    setPassengers(String(log?.passengers ?? 0));
    setNotes(log?.notes ?? "");
    setError("");
  }, [open, log, vehicles]);

  const selected = eligible.find((vehicle) => vehicle.id === Number(vehicleId));
  const miles = Number(distance) || 0;
  const passengerCount = Number(passengers) || 0;
  const approximateRate =
    selected?.vehicle_type === "motorcycle"
      ? config?.mileage_motorcycle_rate
      : selected?.vehicle_type === "bicycle"
        ? config?.mileage_bicycle_rate
        : config?.mileage_car_first_tier_rate;
  const supportsPassengers =
    selected?.vehicle_type === "car" || selected?.vehicle_type === "van";
  const estimate =
    miles * (approximateRate ?? 0) +
    (supportsPassengers
      ? miles * passengerCount * (config?.mileage_passenger_rate ?? 0)
      : 0);

  const save = async () => {
    if (!vehicleId) return setError("Add or select a mileage-method vehicle.");
    if (!date || !purpose.trim())
      return setError("Enter a date and journey purpose.");
    if (!Number.isFinite(miles) || miles <= 0)
      return setError("Distance must be greater than zero.");
    if (!Number.isInteger(passengerCount) || passengerCount < 0)
      return setError("Passenger count must be zero or more.");
    try {
      await saveMileage.mutateAsync({
        id: copy ? undefined : log?.id,
        vehicle_id: Number(vehicleId),
        date,
        start_location: start.trim(),
        end_location: end.trim(),
        purpose: purpose.trim(),
        distance_miles: miles,
        passengers: supportsPassengers ? passengerCount : 0,
        notes: notes.trim(),
      });
      closeAfterSave();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Journey could not be saved.",
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
      <DialogContent className="max-w-2xl" {...dirtyCaptureProps}>
        <DialogHeader>
          <DialogTitle>{copy ? "Copy journey" : log ? "Edit journey" : "Log mileage"}</DialogTitle>
          <DialogDescription>
            {copy
              ? "Journey details copied. Choose the date for the new journey."
              : "The final allowance is recalculated chronologically using "}
            {!copy && currentTaxYear + " HMRC rates and the shared car/van tier."}
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
              <Label>Start point</Label>
              <Input
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Destination</Label>
              <Input
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Business purpose</Label>
            <Input
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="Client site visit"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Distance (miles)</Label>
              <Input
                type="number"
                min="0.1"
                step="0.1"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Business passengers</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={supportsPassengers ? passengers : "0"}
                disabled={!supportsPassengers}
                onChange={(event) => setPassengers(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Available for cars and vans.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Journey notes</Label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <span className="text-muted-foreground">
              Indicative allowance before tier position:{" "}
            </span>
            <strong>{money.format(estimate)}</strong>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => void requestClose()}>
            Cancel
          </Button>
          <Button
            onClick={save}
            disabled={saveMileage.isPending || eligible.length === 0}
          >
            {saveMileage.isPending
              ? "Saving..."
              : copy
                ? "Save copied journey"
                : "Save journey"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

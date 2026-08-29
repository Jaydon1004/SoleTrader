import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSaveMileage, type Vehicle } from "@/lib/queries/vehicles";

export function MonthlyMileageDialog({ open, onOpenChange, vehicles }: { open: boolean; onOpenChange: (open: boolean) => void; vehicles: Vehicle[] }) {
  const save = useSaveMileage();
  const eligible = vehicles.filter((vehicle) => vehicle.cost_method === "mileage" && vehicle.archived === 0);
  const [vehicleId, setVehicleId] = useState("");
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));
  const [miles, setMiles] = useState("");
  const [purpose, setPurpose] = useState("Business travel during the month");
  const [passengers, setPassengers] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setVehicleId((current) => current || (eligible[0] ? String(eligible[0].id) : ""));
    setMonth(format(new Date(), "yyyy-MM"));
    setMiles("");
    setPurpose("Business travel during the month");
    setPassengers("0");
    setNotes("");
    setError("");
  }, [open, eligible]);

  const selected = eligible.find((vehicle) => vehicle.id === Number(vehicleId));
  const distance = Number(miles) || 0;
  const passengerCount = Number(passengers) || 0;
  const approximateRate = selected?.vehicle_type === "motorcycle" ? 0.24 : selected?.vehicle_type === "bicycle" ? 0.2 : 0.45;

  const submit = async () => {
    if (!vehicleId) return setError("Select a mileage vehicle.");
    if (!month) return setError("Choose the month.");
    if (!Number.isFinite(distance) || distance <= 0) return setError("Enter total business miles for the month.");
    if (!purpose.trim()) return setError("Enter a business purpose.");
    if (!Number.isInteger(passengerCount) || passengerCount < 0) return setError("Passengers must be zero or more.");
    try {
      await save.mutateAsync({ vehicle_id: Number(vehicleId), date: `${month}-01`, start_location: "", end_location: "", purpose: purpose.trim(), distance_miles: distance, passengers: selected?.vehicle_type === "car" || selected?.vehicle_type === "van" ? passengerCount : 0, notes: `Monthly total · ${notes.trim()}`.replace(/ · $/, "") });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Monthly mileage could not be saved.");
    }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Add monthly mileage</DialogTitle><DialogDescription>Record one total for a month when you do not want to log every journey. Keep supporting notes or a calendar record if needed.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div><Label>Vehicle</Label><Select value={vehicleId} onValueChange={setVehicleId}><SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger><SelectContent>{eligible.map((vehicle) => <SelectItem key={vehicle.id} value={String(vehicle.id)}>{vehicle.name}</SelectItem>)}</SelectContent></Select></div><div><Label>Month</Label><Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></div><div><Label>Total business miles</Label><Input type="number" min="0.1" step="0.1" value={miles} onChange={(event) => setMiles(event.target.value)} placeholder="450" /></div><div><Label>Business passengers</Label><Input type="number" min="0" step="1" value={passengers} disabled={!selected || !["car", "van"].includes(selected.vehicle_type)} onChange={(event) => setPassengers(event.target.value)} /></div><div className="sm:col-span-2"><Label>Business purpose</Label><Input value={purpose} onChange={(event) => setPurpose(event.target.value)} /></div><div className="sm:col-span-2"><Label>Notes (optional)</Label><Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Regular visits to customer sites" /></div></div>{distance > 0 && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">Indicative allowance before the shared car/van tier: <strong className="text-foreground">£{(distance * approximateRate).toFixed(2)}</strong>. The final amount is recalculated against your tax-year mileage total.</p>}{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={() => void submit()} disabled={save.isPending || eligible.length === 0}>{save.isPending ? "Saving..." : "Save monthly total"}</Button></DialogFooter></DialogContent></Dialog>;
}

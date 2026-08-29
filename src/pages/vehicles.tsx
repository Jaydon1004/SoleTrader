import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  ArchiveRestore,
  Car,
  Copy,
  Pencil,
  Plus,
  Receipt,
  Route,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/loading";
import { VehicleDialog } from "@/components/vehicles/vehicle-dialog";
import { MileageDialog } from "@/components/vehicles/mileage-dialog";
import { MonthlyMileageDialog } from "@/components/vehicles/monthly-mileage-dialog";
import { VehicleCostDialog } from "@/components/vehicles/vehicle-cost-dialog";
import {
  useArchiveVehicle,
  useDeleteMileage,
  useDeleteVehicleCost,
  useMileageLogs,
  useVehicleCosts,
  useVehicleDeductionSummary,
  useVehicles,
  type MileageLog,
  type Vehicle,
  type VehicleCost,
} from "@/lib/queries/vehicles";
import { useTaxYearConfigs } from "@/lib/queries/settings";
import { useAppStore } from "@/stores/app-store";
import { openStoredReceipt } from "@/lib/receipt-storage";
import { useFeedback } from "@/components/feedback-provider";
import {
  PageHeader,
  PageSkeleton,
  QueryErrorState,
} from "@/components/page-shell";

const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});
const number = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function VehiclesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const storedTaxYear = useAppStore((state) => state.currentTaxYear);
  const [taxYear, setTaxYear] = useState(storedTaxYear);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [vehicleFilter, setVehicleFilter] = useState("all");
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [mileageOpen, setMileageOpen] = useState(false);
  const [monthlyMileageOpen, setMonthlyMileageOpen] = useState(false);
  const [editingMileage, setEditingMileage] = useState<MileageLog | null>(null);
  const [copyingMileage, setCopyingMileage] = useState(false);
  useEffect(() => {
    if (searchParams.get("new") !== "mileage") return;
    setEditingMileage(null);
    setCopyingMileage(false);
    setMileageOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const [costOpen, setCostOpen] = useState(false);
  const [editingCost, setEditingCost] = useState<VehicleCost | null>(null);
  const vehicleQuery = useVehicles(taxYear, includeArchived);
  const mileageQuery = useMileageLogs(vehicleFilter, taxYear);
  const costQuery = useVehicleCosts(vehicleFilter, taxYear);
  const summaryQuery = useVehicleDeductionSummary(taxYear);
  const taxYearQuery = useTaxYearConfigs();
  const { data: vehicles, isLoading } = vehicleQuery;
  const { data: mileage } = mileageQuery;
  const { data: costs } = costQuery;
  const { data: summary } = summaryQuery;
  const { data: taxYears } = taxYearQuery;
  const archive = useArchiveVehicle();
  const deleteMileage = useDeleteMileage();
  const deleteCost = useDeleteVehicleCost();
  const { confirm, toast } = useFeedback();
  const queries = [
    vehicleQuery,
    mileageQuery,
    costQuery,
    summaryQuery,
    taxYearQuery,
  ];
  const allVehicles = vehicles ?? [];
  const activeVehicles = allVehicles.filter(
    (vehicle) => vehicle.archived === 0,
  );
  const removeMileage = async (log: MileageLog) => {
    if (
      !(await confirm({
        title: "Delete this journey?",
        description: `${log.purpose} will be removed permanently.`,
        confirmLabel: "Delete journey",
        destructive: true,
      }))
    )
      return;
    deleteMileage.mutate(log.id, { onSuccess: () => toast("Journey deleted") });
  };
  const removeCost = async (cost: VehicleCost) => {
    if (
      !(await confirm({
        title: "Delete this vehicle cost?",
        description: `${cost.description || cost.cost_type} will be removed permanently.`,
        confirmLabel: "Delete cost",
        destructive: true,
      }))
    )
      return;
    deleteCost.mutate(cost.id, {
      onSuccess: () => toast("Vehicle cost deleted"),
    });
  };

  if (queries.some((query) => query.isLoading)) return <PageSkeleton />;
  if (queries.some((query) => query.isError))
    return (
      <QueryErrorState
        title="Vehicle records could not be loaded"
        onRetry={() => Promise.all(queries.map((query) => query.refetch()))}
        isRetrying={queries.some((query) => query.isFetching)}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Business travel"
        title="Vehicles & mileage"
        description="Track HMRC mileage allowances or actual running costs per vehicle."
        primaryAction={
          <Button
            onClick={() => {
              setEditingVehicle(null);
              setVehicleOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add vehicle
          </Button>
        }
        secondaryActions={
          <Select value={taxYear} onValueChange={setTaxYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(taxYears ?? []).map((year) => (
                <SelectItem key={year.tax_year} value={year.tax_year}>
                  {year.tax_year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Business miles</p>
          <p className="mt-1 text-xl font-semibold">
            {number.format(summary?.miles ?? 0)}
          </p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Mileage allowance</p>
          <p className="mt-1 text-xl font-semibold">
            {money.format(summary?.mileageAllowance ?? 0)}
          </p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">
            Allowable actual costs
          </p>
          <p className="mt-1 text-xl font-semibold">
            {money.format(summary?.actualCostsAllowable ?? 0)}
          </p>
        </div>
        <div className="rounded-md border p-4">
          <p className="text-xs text-muted-foreground">Vehicle deduction</p>
          <p className="mt-1 text-xl font-semibold text-green-600 dark:text-green-400">
            {money.format(summary?.totalDeduction ?? 0)}
          </p>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Vehicles</h3>
          <div className="flex items-center gap-2">
            <Switch
              id="archived-vehicles"
              checked={includeArchived}
              onCheckedChange={setIncludeArchived}
            />
            <Label htmlFor="archived-vehicles">Show archived</Label>
          </div>
        </div>
        {isLoading ? (
          <LoadingSpinner />
        ) : allVehicles.length === 0 ? (
          <div className="rounded-md border border-dashed py-10 text-center">
            <Car className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="font-medium">No vehicles added</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {allVehicles.map((vehicle) => (
              <div
                className={`rounded-md border p-4 ${vehicle.archived ? "opacity-60" : ""}`}
                key={vehicle.id}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{vehicle.name}</h4>
                      {vehicle.archived === 1 && (
                        <Badge variant="secondary">Archived</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[vehicle.make, vehicle.model, vehicle.registration]
                        .filter(Boolean)
                        .join(" · ") || vehicle.vehicle_type}
                    </p>
                  </div>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${vehicle.name}`}
                      onClick={() => {
                        setEditingVehicle(vehicle);
                        setVehicleOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`${vehicle.archived ? "Restore" : "Archive"} ${vehicle.name}`}
                      onClick={() =>
                        archive.mutate({
                          id: vehicle.id,
                          archived: vehicle.archived === 0,
                        })
                      }
                    >
                      {vehicle.archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
                  <Badge variant="outline">
                    {vehicle.cost_method === "mileage"
                      ? "Mileage rates"
                      : `${vehicle.business_percent}% actual costs`}
                  </Badge>
                  <span className="font-semibold">
                    {money.format(vehicle.total_deduction)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {vehicle.cost_method === "mileage"
                    ? `${number.format(vehicle.business_miles)} miles · ${vehicle.mileage_count} journeys`
                    : `${money.format(vehicle.actual_costs)} paid · ${vehicle.cost_count} costs`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Tabs defaultValue="mileage">
        <TabsList>
          <TabsTrigger value="mileage">
            <Route className="mr-2 h-4 w-4" /> Mileage log
          </TabsTrigger>
          <TabsTrigger value="costs">
            <Receipt className="mr-2 h-4 w-4" /> Actual costs
          </TabsTrigger>
        </TabsList>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {activeVehicles.map((vehicle) => (
                <SelectItem value={String(vehicle.id)} key={vehicle.id}>
                  {vehicle.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <TabsContent value="mileage" className="space-y-3">
          <div className="flex justify-end">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setMonthlyMileageOpen(true)} disabled={!activeVehicles.some((vehicle) => vehicle.cost_method === "mileage")}>
                <Plus className="mr-2 h-4 w-4" /> Add monthly total
              </Button>
              <Button onClick={() => { setEditingMileage(null); setCopyingMileage(false); setMileageOpen(true); }} disabled={!activeVehicles.some((vehicle) => vehicle.cost_method === "mileage")}>
                <Plus className="mr-2 h-4 w-4" /> Log journey
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <div className="min-w-205">
              <div className="grid grid-cols-[105px_130px_minmax(200px,1fr)_90px_90px_110px_80px] gap-3 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Date</span>
                <span>Vehicle</span>
                <span>Journey / purpose</span>
                <span className="text-right">Miles</span>
                <span className="text-right">Rate</span>
                <span className="text-right">Allowance</span>
                <span />
              </div>
              {(mileage ?? []).map((log) => (
                <div
                  className="grid grid-cols-[105px_130px_minmax(200px,1fr)_90px_90px_110px_80px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
                  key={log.id}
                >
                  <span className="text-muted-foreground">
                    {date.format(new Date(`${log.date}T00:00:00`))}
                  </span>
                  <span>{log.vehicle_name}</span>
                  <button
                    className="min-w-0 text-left"
                    onClick={() => {
                      setEditingMileage(log);
                      setCopyingMileage(false);
                      setMileageOpen(true);
                    }}
                  >
                    <span className="block truncate font-medium">
                      {log.purpose}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[log.start_location, log.end_location]
                        .filter(Boolean)
                        .join(" → ")}
                      {log.passengers
                        ? ` · ${log.passengers} passenger${log.passengers === 1 ? "" : "s"}`
                        : ""}
                    </span>
                  </button>
                  <span className="text-right">
                    {number.format(log.distance_miles)}
                  </span>
                  <span className="text-right">
                    £{log.rate_applied.toFixed(2)}
                  </span>
                  <span className="text-right font-semibold">
                    {money.format(log.amount)}
                  </span>
                  <div className="flex">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit journey ${log.purpose}`}
                      onClick={() => {
                        setEditingMileage(log);
                        setMileageOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Copy journey ${log.purpose}`}
                      onClick={() => {
                        setEditingMileage({ ...log, date: "" });
                        setCopyingMileage(true);
                        setMileageOpen(true);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete journey ${log.purpose}`}
                      onClick={() => void removeMileage(log)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {(mileage ?? []).length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No mileage recorded for these filters.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
        <TabsContent value="costs" className="space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingCost(null);
                setCostOpen(true);
              }}
              disabled={
                !activeVehicles.some(
                  (vehicle) => vehicle.cost_method === "actual",
                )
              }
            >
              <Plus className="mr-2 h-4 w-4" /> Add cost
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <div className="min-w-190">
              <div className="grid grid-cols-[105px_130px_110px_minmax(180px,1fr)_100px_110px_80px] gap-3 border-b bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Date</span>
                <span>Vehicle</span>
                <span>Type</span>
                <span>Description</span>
                <span className="text-right">Paid</span>
                <span className="text-right">Allowable</span>
                <span />
              </div>
              {(costs ?? []).map((cost) => (
                <div
                  className="grid grid-cols-[105px_130px_110px_minmax(180px,1fr)_100px_110px_80px] items-center gap-3 border-b px-4 py-3 text-sm last:border-0"
                  key={cost.id}
                >
                  <span className="text-muted-foreground">
                    {date.format(new Date(`${cost.date}T00:00:00`))}
                  </span>
                  <span>{cost.vehicle_name}</span>
                  <span className="capitalize">
                    {cost.cost_type.replace("_", " ")}
                  </span>
                  <button
                    className="min-w-0 truncate text-left"
                    onClick={() => {
                      setEditingCost(cost);
                      setCostOpen(true);
                    }}
                  >
                    {cost.description || "No description"}
                  </button>
                  <span className="text-right">
                    {money.format(cost.amount)}
                  </span>
                  <span className="text-right font-semibold">
                    {money.format(cost.allowable_amount)}
                  </span>
                  <div className="flex">
                    {cost.receipt_path && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Open receipt for ${cost.description || cost.cost_type}`}
                        onClick={() =>
                          void openStoredReceipt(cost.receipt_path)
                        }
                      >
                        <Receipt className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${cost.description || cost.cost_type}`}
                      onClick={() => void removeCost(cost)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {(costs ?? []).length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No actual vehicle costs recorded for these filters.
                </p>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <VehicleDialog
        open={vehicleOpen}
        onOpenChange={(open) => {
          setVehicleOpen(open);
          if (!open) setEditingVehicle(null);
        }}
        vehicle={editingVehicle}
      />
      <MileageDialog
        open={mileageOpen}
        onOpenChange={(open) => {
          setMileageOpen(open);
          if (!open) { setEditingMileage(null); setCopyingMileage(false); }
        }}
        vehicles={activeVehicles}
        log={editingMileage}
        copy={copyingMileage}
        currentTaxYear={taxYear}
      />
      <MonthlyMileageDialog
        open={monthlyMileageOpen}
        onOpenChange={setMonthlyMileageOpen}
        vehicles={activeVehicles}
      />
      <VehicleCostDialog
        open={costOpen}
        onOpenChange={(open) => {
          setCostOpen(open);
          if (!open) setEditingCost(null);
        }}
        vehicles={activeVehicles}
        cost={editingCost}
      />
    </div>
  );
}

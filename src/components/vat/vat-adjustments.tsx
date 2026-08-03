import { useState } from "react";
import { Plus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateVatAdjustment, useVatAdjustments } from "@/lib/queries/vat";
import { useUnsavedDialog } from "@/hooks/use-unsaved-dialog";

const adjustmentBoxes = [
  "box1",
  "box2",
  "box4",
  "box6",
  "box7",
  "box8",
  "box9",
] as const;
const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function VatAdjustments({
  filedReturnId,
  defaultDate,
}: {
  filedReturnId: number;
  defaultDate: string;
}) {
  const { data: adjustments = [], error } = useVatAdjustments(filedReturnId);
  const createAdjustment = useCreateVatAdjustment();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [boxes, setBoxes] = useState<
    Record<(typeof adjustmentBoxes)[number], string>
  >({
    box1: "0",
    box2: "0",
    box4: "0",
    box6: "0",
    box7: "0",
    box8: "0",
    box9: "0",
  });
  const [saveError, setSaveError] = useState("");
  const { closeAfterSave, dirtyCaptureProps, requestClose } = useUnsavedDialog({
    open,
    onOpenChange: setOpen,
    subject: "VAT adjustment",
  });

  const save = async () => {
    setSaveError("");
    try {
      await createAdjustment.mutateAsync({
        filed_return_id: filedReturnId,
        adjustment_date: date,
        reason: reason.trim(),
        ...Object.fromEntries(
          adjustmentBoxes.map((box) => [box, Number(boxes[box]) || 0]),
        ),
      } as Parameters<typeof createAdjustment.mutateAsync>[0]);
      setReason("");
      setBoxes({
        box1: "0",
        box2: "0",
        box4: "0",
        box6: "0",
        box7: "0",
        box8: "0",
        box9: "0",
      });
      closeAfterSave();
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="font-semibold">Post-filing adjustments</h4>
          <p className="text-sm text-muted-foreground">
            Corrections are applied to the open period matching their adjustment
            date.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (nextOpen) setOpen(true);
            else void requestClose();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Record adjustment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" {...dirtyCaptureProps}>
            <DialogHeader>
              <DialogTitle>Record VAT adjustment</DialogTitle>
              <DialogDescription>
                Enter signed box changes. Use negative values to reduce a box.
                The entry cannot be edited or deleted after saving.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="adjustment-date">Open-period date</Label>
                  <Input
                    id="adjustment-date"
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="adjustment-reason">Reason</Label>
                  <Input
                    id="adjustment-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    maxLength={500}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {adjustmentBoxes.map((box) => (
                  <div key={box} className="space-y-2">
                    <Label htmlFor={`adjustment-${box}`}>
                      {box.replace("box", "Box ")}
                    </Label>
                    <Input
                      id={`adjustment-${box}`}
                      type="number"
                      step="0.01"
                      value={boxes[box]}
                      onChange={(event) =>
                        setBoxes((current) => ({
                          ...current,
                          [box]: event.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
              {saveError && (
                <Alert variant="destructive">
                  <AlertDescription>{saveError}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => void requestClose()}>
                Cancel
              </Button>
              <Button
                onClick={() => void save()}
                disabled={
                  reason.trim().length < 3 ||
                  !date ||
                  createAdjustment.isPending
                }
              >
                {createAdjustment.isPending ? "Saving..." : "Save adjustment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            Adjustment history could not be loaded.
          </AlertDescription>
        </Alert>
      )}
      {adjustments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No adjustments recorded for this filed return.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {adjustments.map((adjustment) => (
            <div
              key={adjustment.id}
              className="flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">{adjustment.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Applied{" "}
                  {new Date(
                    `${adjustment.adjustment_date}T00:00:00`,
                  ).toLocaleDateString("en-GB")}
                </p>
              </div>
              <p className="text-sm tabular-nums">
                Box 1 {money.format(adjustment.box1)} · Box 4{" "}
                {money.format(adjustment.box4)}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

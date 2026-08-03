import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BellRing,
  CalendarClock,
  Check,
  CircleAlert,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useCompleteCustomReminder,
  useDeleteCustomReminder,
  useReminderCentre,
  useSaveCustomReminder,
  useSnoozeReminder,
  type CustomReminder,
} from "@/lib/queries/reminders";
import type { ReminderAlert } from "@/lib/reminder-engine";
import { useAppStore } from "@/stores/app-store";
import { useFeedback } from "@/components/feedback-provider";
import { PageHeader, PageSkeleton } from "@/components/page-shell";

const severityVariant = {
  info: "outline",
  warning: "warning",
  critical: "destructive",
} as const;
const kindLabels = {
  hmrc: "HMRC",
  vat: "VAT",
  invoice: "Invoice",
  threshold: "VAT threshold",
  expense: "Expense",
  tax_pot: "Tax pot",
  custom: "Custom",
};

function dueText(alert: ReminderAlert) {
  if (alert.daysUntil < 0)
    return `${Math.abs(alert.daysUntil)} day${alert.daysUntil === -1 ? "" : "s"} overdue`;
  if (alert.daysUntil === 0) return "Due today";
  return `Due in ${alert.daysUntil} day${alert.daysUntil === 1 ? "" : "s"}`;
}

function ReminderDialog({
  open,
  onOpenChange,
  reminder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reminder: CustomReminder | null;
}) {
  const save = useSaveCustomReminder();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [frequency, setFrequency] = useState("none");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setDescription(reminder?.description ?? "");
    setDueDate(reminder?.due_date ?? new Date().toISOString().slice(0, 10));
    setFrequency(reminder?.recurring_frequency ?? "none");
    setError("");
  }, [open, reminder]);
  const submit = async () => {
    if (!title.trim() || !dueDate)
      return setError("Title and due date are required.");
    try {
      await save.mutateAsync({
        id: reminder?.id,
        title: title.trim(),
        description: description.trim(),
        dueDate,
        recurringFrequency:
          frequency === "none"
            ? null
            : (frequency as CustomReminder["recurring_frequency"]),
      });
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Reminder could not be saved.",
      );
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {reminder ? "Edit reminder" : "New reminder"}
          </DialogTitle>
          <DialogDescription>
            Track equipment, insurance, renewals, and other dates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reminder-description">Details</Label>
            <Textarea
              id="reminder-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reminder-date">Due date</Label>
              <Input
                id="reminder-date"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Repeat</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Does not repeat</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving" : "Save reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RemindersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const taxYear = useAppStore((state) => state.currentTaxYear);
  const { data, isLoading, error } = useReminderCentre(taxYear);
  const snooze = useSnoozeReminder();
  const complete = useCompleteCustomReminder();
  const remove = useDeleteCustomReminder();
  const { confirm, toast } = useFeedback();
  const [filter, setFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomReminder | null>(null);
  useEffect(() => {
    if (searchParams.get("new") !== "reminder") return;
    setEditing(null);
    setDialogOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("new");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const deleteReminder = async (reminder: CustomReminder) => {
    if (
      !(await confirm({
        title: "Delete this reminder?",
        description: `“${reminder.title}” will be removed permanently.`,
        confirmLabel: "Delete reminder",
        destructive: true,
      }))
    )
      return;
    remove.mutate(reminder.id, { onSuccess: () => toast("Reminder deleted") });
  };
  if (isLoading) return <PageSkeleton rows={4} />;
  if (error || !data)
    return (
      <Alert variant="destructive">
        <AlertTitle>Reminders unavailable</AlertTitle>
        <AlertDescription>
          {error?.message ?? "Reminder data could not be loaded."}
        </AlertDescription>
      </Alert>
    );
  const visible = data.alerts.filter(
    (alert) =>
      filter === "all" ||
      (filter === "urgent" && alert.severity === "critical") ||
      (filter === "custom" && alert.kind === "custom") ||
      (filter === "financial" &&
        ["invoice", "threshold", "expense", "tax_pot"].includes(alert.kind)),
  );
  const openEditor = (reminder: CustomReminder | null) => {
    setEditing(reminder);
    setDialogOpen(true);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Notification centre"
        title="Deadlines & reminders"
        description={`Live alerts for ${taxYear}, invoices, VAT, record keeping, and your own dates.`}
        primaryAction={
          <Button onClick={() => openEditor(null)}>
            <Plus className="mr-2 h-4 w-4" />
            Add reminder
          </Button>
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active alerts</p>
            <p className="mt-1 text-2xl font-semibold">{data.alerts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Urgent</p>
            <p className="mt-1 text-2xl font-semibold text-destructive">
              {
                data.alerts.filter((item) => item.severity === "critical")
                  .length
              }
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overdue invoices</p>
            <p className="mt-1 text-2xl font-semibold">
              {data.alerts.filter((item) => item.kind === "invoice").length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Custom reminders</p>
            <p className="mt-1 text-2xl font-semibold">{data.custom.length}</p>
          </CardContent>
        </Card>
      </section>
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="urgent">Urgent</TabsTrigger>
          <TabsTrigger value="financial">Business alerts</TabsTrigger>
          <TabsTrigger value="custom">Custom</TabsTrigger>
        </TabsList>
      </Tabs>
      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed py-14 text-center">
          <BellRing className="mx-auto h-9 w-9 text-muted-foreground/50" />
          <p className="mt-3 font-medium">Nothing needs attention</p>
          <p className="mt-1 text-sm text-muted-foreground">
            New alerts will appear as configured deadlines approach.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((alert) => {
            const custom =
              alert.kind === "custom"
                ? data.custom.find((item) => `custom-${item.id}` === alert.id)
                : null;
            return (
              <Card
                className={
                  alert.severity === "critical" ? "border-destructive/60" : ""
                }
                key={alert.id}
              >
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
                  <div
                    className={`rounded-md p-2 ${alert.severity === "critical" ? "bg-destructive/10 text-destructive" : alert.severity === "warning" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"}`}
                  >
                    {alert.severity === "critical" ? (
                      <CircleAlert className="h-5 w-5" />
                    ) : (
                      <CalendarClock className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{alert.title}</h3>
                      <Badge variant={severityVariant[alert.severity]}>
                        {kindLabels[alert.kind]}
                      </Badge>
                      <Badge variant="outline">{dueText(alert)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {alert.description}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Due{" "}
                      {new Date(`${alert.dueDate}T00:00:00`).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {custom ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${custom.title}`}
                          onClick={() => openEditor(custom)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Complete ${custom.title}`}
                          onClick={() => complete.mutate(custom)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${custom.title}`}
                          onClick={() => void deleteReminder(custom)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => snooze.mutate({ alertId: alert.id })}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Snooze 7 days
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Your reminders</h3>
            <p className="text-xs text-muted-foreground">
              All future and recurring reminders remain editable before their
              alert window.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-150 text-sm">
            <caption className="sr-only">Custom reminders</caption>
            <thead>
              <tr className="border-b bg-muted/60 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Reminder</th>
                <th className="px-3 py-2 font-medium">Due</th>
                <th className="px-3 py-2 font-medium">Repeat</th>
                <th className="w-28 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.custom.map((reminder) => (
                <tr className="border-b last:border-0" key={reminder.id}>
                  <td className="px-3 py-3">
                    <p className="font-medium">{reminder.title}</p>
                    {reminder.description && (
                      <p className="text-xs text-muted-foreground">
                        {reminder.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {new Date(
                      `${reminder.due_date}T00:00:00`,
                    ).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-3 py-3 capitalize">
                    {reminder.recurring_frequency ?? "No"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${reminder.title}`}
                        onClick={() => openEditor(reminder)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Complete ${reminder.title}`}
                        onClick={() => complete.mutate(reminder)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${reminder.title}`}
                        onClick={() => void deleteReminder(reminder)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.custom.length === 0 && (
            <p className="py-9 text-center text-sm text-muted-foreground">
              No custom reminders yet.
            </p>
          )}
        </div>
      </section>
      <ReminderDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        reminder={editing}
      />
    </div>
  );
}

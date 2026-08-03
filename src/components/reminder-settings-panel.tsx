import { useEffect, useState } from "react";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { BellRing, Save } from "lucide-react";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useReminderPreferences,
  useSaveReminderPreferences,
} from "@/lib/queries/reminders";
import type { ReminderPreferences } from "@/lib/reminder-engine";

const fields: Array<{
  key: Exclude<keyof ReminderPreferences, "systemNotifications">;
  label: string;
  hint: string;
  min: number;
  max: number;
}> = [
  {
    key: "registrationLeadDays",
    label: "SA registration warning",
    hint: "Days before 5 October",
    min: 0,
    max: 365,
  },
  {
    key: "paperReturnLeadDays",
    label: "Paper return warning",
    hint: "Days before 31 October",
    min: 0,
    max: 365,
  },
  {
    key: "onlineReturnLeadDays",
    label: "Online return and payment",
    hint: "Days before 31 January",
    min: 0,
    max: 365,
  },
  {
    key: "paymentOnAccountLeadDays",
    label: "Payments on account",
    hint: "Days before each instalment",
    min: 0,
    max: 365,
  },
  {
    key: "vatLeadDays",
    label: "VAT return warning",
    hint: "Days before each quarterly deadline",
    min: 0,
    max: 180,
  },
  {
    key: "invoiceOverdueDays",
    label: "Invoice overdue grace",
    hint: "Alert after this many overdue days",
    min: 1,
    max: 365,
  },
  {
    key: "vatThresholdPercent",
    label: "VAT threshold warning",
    hint: "Percentage of registration threshold",
    min: 1,
    max: 100,
  },
  {
    key: "expenseNudgeDays",
    label: "No-expense nudge",
    hint: "Days without a recorded expense",
    min: 1,
    max: 365,
  },
  {
    key: "customLeadDays",
    label: "Custom reminder warning",
    hint: "Days before user reminders",
    min: 0,
    max: 365,
  },
];

export function ReminderSettingsPanel() {
  const { data, isLoading } = useReminderPreferences();
  const save = useSaveReminderPreferences();
  const [form, setForm] = useState<ReminderPreferences | null>(null);
  const [saved, setSaved] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState("");
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);
  if (isLoading || !form) return <LoadingSpinner />;
  const setNumber = (
    key: Exclude<keyof ReminderPreferences, "systemNotifications">,
    value: number,
  ) => setForm((current) => (current ? { ...current, [key]: value } : current));
  const submit = async () => {
    await save.mutateAsync(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };
  const enableWindowsNotifications = async () => {
    try {
      const granted =
        (await isPermissionGranted()) ||
        (await requestPermission()) === "granted";
      if (!granted) {
        setPermissionMessage(
          "Windows notification permission was not granted.",
        );
        return;
      }
      sendNotification({
        title: "SoleTrader notifications enabled",
        body: "Deadline and business alerts can now appear in Windows.",
      });
      setForm({ ...form, systemNotifications: true });
      setPermissionMessage(
        "Test notification sent. Save settings to keep Windows alerts enabled.",
      );
    } catch (caught) {
      setPermissionMessage(
        caught instanceof Error
          ? caught.message
          : "Windows notifications could not be enabled.",
      );
    }
  };
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5" />
            Reminder timing
          </CardTitle>
          <CardDescription>
            Choose how early each alert appears in the notification centre.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <div className="space-y-1.5" key={field.key}>
              <Label htmlFor={field.key}>{field.label}</Label>
              <Input
                id={field.key}
                type="number"
                min={field.min}
                max={field.max}
                value={form[field.key]}
                onChange={(event) =>
                  setNumber(
                    field.key,
                    Math.min(
                      field.max,
                      Math.max(field.min, Number(event.target.value) || 0),
                    ),
                  )
                }
              />
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Windows notifications</CardTitle>
          <CardDescription>
            Show due reminders through Windows as well as inside SoleTrader.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="system-notifications">System notifications</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Permission is requested only when you explicitly enable this
                setting.
              </p>
            </div>
            {form.systemNotifications ? (
              <Switch
                id="system-notifications"
                checked
                onCheckedChange={(checked) =>
                  setForm({ ...form, systemNotifications: checked })
                }
              />
            ) : (
              <Button
                id="system-notifications"
                variant="outline"
                onClick={enableWindowsNotifications}
              >
                Enable and test
              </Button>
            )}
          </div>
          {permissionMessage && (
            <p className="text-xs text-muted-foreground">{permissionMessage}</p>
          )}
        </CardContent>
      </Card>
      <Button onClick={submit} disabled={save.isPending}>
        <Save className="mr-2 h-4 w-4" />
        {save.isPending ? "Saving" : saved ? "Saved" : "Save reminder settings"}
      </Button>
    </div>
  );
}

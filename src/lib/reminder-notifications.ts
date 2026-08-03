import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { execute, query } from "@/lib/database";
import type { ReminderAlert } from "@/lib/reminder-engine";

export async function deliverReminderNotifications(
  alerts: ReminderAlert[],
  enabled: boolean,
) {
  if (!enabled || alerts.length === 0) return 0;
  if (!(await isPermissionGranted())) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const existing = await query<{ alert_id: string }>(
    "SELECT DISTINCT alert_id FROM reminder_deliveries",
  );
  const sent = new Set(existing.map((row) => row.alert_id));
  const pending = alerts.filter((alert) => !sent.has(alert.id)).slice(0, 5);
  for (const alert of pending) {
    sendNotification({
      title: alert.title,
      body: alert.description,
      group: "soletrader-reminders",
    });
    await execute(
      "INSERT OR IGNORE INTO reminder_deliveries (alert_id, delivered_on) VALUES (?, ?)",
      [alert.id, today],
    );
  }
  return pending.length;
}

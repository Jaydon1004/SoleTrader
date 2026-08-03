import { useEffect } from "react";
import { deliverReminderNotifications } from "@/lib/reminder-notifications";
import { useReminderCentre } from "@/lib/queries/reminders";
import { useAppStore } from "@/stores/app-store";

export function ReminderNotifier() {
  const taxYear = useAppStore((state) => state.currentTaxYear);
  const { data } = useReminderCentre(taxYear);
  useEffect(() => {
    if (data)
      void deliverReminderNotifications(
        data.alerts,
        data.preferences.systemNotifications,
      );
  }, [data]);
  return null;
}

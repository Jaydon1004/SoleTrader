import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { updaterConfigured } from "@/components/update-settings-panel";
import { useAppSetting } from "@/lib/queries/settings";

export function AutomaticUpdateChecker() {
  const { data: automatic } = useAppSetting("updates.automatic");
  useEffect(() => {
    if (!updaterConfigured || automatic === undefined || automatic === "false")
      return;
    let active = true;
    const timer = window.setTimeout(() => {
      void check({ timeout: 30_000 })
        .then((update) => {
          if (active && update)
            sendNotification({
              title: "SoleTrader update available",
              body: `Version ${update.version} is ready. Open Settings to review and install it.`,
            });
        })
        .catch(() => undefined);
    }, 10_000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [automatic]);
  return null;
}

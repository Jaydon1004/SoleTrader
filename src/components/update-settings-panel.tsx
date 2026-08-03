import { useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { Download, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAppSetting, useSetAppSetting } from "@/lib/queries/settings";

export const updaterConfigured =
  import.meta.env.VITE_UPDATER_CONFIGURED === "true";

export function UpdateSettingsPanel() {
  const { data: automatic } = useAppSetting("updates.automatic");
  const saveSetting = useSetAppSetting();
  const [status, setStatus] = useState("");
  const [update, setUpdate] = useState<Update | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const enabled = automatic !== "false";
  const runCheck = async () => {
    setChecking(true);
    setStatus("");
    setUpdate(null);
    try {
      const next = await check({ timeout: 30_000 });
      setUpdate(next);
      setStatus(
        next
          ? `Version ${next.version} is available.`
          : "SoleTrader is up to date.",
      );
    } catch (caught) {
      setStatus(
        caught instanceof Error
          ? caught.message
          : "The update service could not be reached.",
      );
    } finally {
      setChecking(false);
    }
  };
  const install = async () => {
    if (!update) return;
    setInstalling(true);
    let downloaded = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") downloaded += event.data.chunkLength;
        if (event.event === "Progress" && total)
          setProgress(Math.round((downloaded / total) * 100));
      });
    } catch (caught) {
      setStatus(
        caught instanceof Error
          ? caught.message
          : "The update could not be installed.",
      );
      setInstalling(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Application updates</CardTitle>
        <CardDescription>
          Check a signed release feed and install verified SoleTrader updates.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!updaterConfigured && (
          <Alert variant="warning">
            <AlertTitle>Release feed not configured</AlertTitle>
            <AlertDescription>
              The updater engine is installed, but this development build has no
              signed HTTPS release endpoint or public verification key.
              Configure those deployment values and build with
              VITE_UPDATER_CONFIGURED=true to enable checks.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex items-center justify-between gap-4 rounded-md border p-4">
          <div>
            <Label htmlFor="automatic-updates">Automatic update checks</Label>
            <p className="text-xs text-muted-foreground">
              Checks once after startup. Installation always requires
              confirmation.
            </p>
          </div>
          <Switch
            id="automatic-updates"
            checked={enabled}
            disabled={!updaterConfigured || saveSetting.isPending}
            onCheckedChange={(checked) =>
              saveSetting.mutate({
                key: "updates.automatic",
                value: String(checked),
              })
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!updaterConfigured || checking || installing}
            onClick={() => void runCheck()}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`}
            />
            Check now
          </Button>
          {update && (
            <Button disabled={installing} onClick={() => void install()}>
              <Download className="mr-2 h-4 w-4" />
              {installing
                ? `Installing ${progress}%`
                : `Install ${update.version}`}
            </Button>
          )}
          <span className="text-sm text-muted-foreground" role="status">
            {status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

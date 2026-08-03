import { useEffect, useState } from "react";
import {
  Camera,
  CheckCircle2,
  Clock3,
  Copy,
  Loader2,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wifi,
} from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StoredReceipt } from "@/lib/queries/expenses";
import {
  pollMobileReceiptUpload,
  startMobileReceiptUpload,
  stopMobileReceiptUpload,
  type MobileUploadSession,
} from "@/lib/mobile-receipt-upload";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReceived: (receipt: StoredReceipt) => Promise<void> | void;
}

export function MobileReceiptDialog({ open, onOpenChange, onReceived }: Props) {
  const [session, setSession] = useState<MobileUploadSession | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [error, setError] = useState("");
  const [received, setReceived] = useState(false);
  const [starting, setStarting] = useState(false);

  const start = async () => {
    setStarting(true);
    setSession(null);
    setQrCode("");
    setError("");
    setReceived(false);
    try {
      const nextSession = await startMobileReceiptUpload();
      setSession(nextSession);
      setQrCode(
        await QRCode.toDataURL(nextSession.url, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: "M",
        }),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void start();
    return () => {
      void stopMobileReceiptUpload();
    };
  }, [open]);

  useEffect(() => {
    if (!open || !session || received) return;
    const timer = window.setInterval(() => {
      void pollMobileReceiptUpload()
        .then(async (receipt) => {
          if (!receipt) return;
          window.clearInterval(timer);
          await onReceived(receipt);
          setReceived(true);
        })
        .catch((caught) =>
          setError(caught instanceof Error ? caught.message : String(caught)),
        );
    }, 800);
    return () => window.clearInterval(timer);
  }, [onReceived, open, received, session]);

  const close = () => {
    void stopMobileReceiptUpload();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      <DialogContent className="max-h-[92vh] max-w-2xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5 pr-12 text-left">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle>Send receipt from phone</DialogTitle>
              <DialogDescription className="mt-1">
                A private, single-use transfer on your local network.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {starting && (
          <div className="flex min-h-96 flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Starting private upload...</p>
          </div>
        )}

        {!starting && error && (
          <div className="m-6 space-y-4 rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <p className="wrap-break-word text-sm text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void start()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Try again
            </Button>
          </div>
        )}

        {!starting && session && !received && (
          <div className="grid min-w-0 gap-6 p-6 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:items-start">
            <div className="flex min-w-0 flex-col items-center">
              <div className="w-full max-w-[min(72vw,280px)] rounded-md border bg-white p-3 shadow-sm">
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="QR code for the temporary receipt upload page"
                    className="aspect-square h-auto w-full"
                  />
                ) : (
                  <div className="aspect-square w-full" />
                )}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Waiting for a receipt
              </div>
            </div>

            <div className="min-w-0 space-y-5">
              <div>
                <h3 className="font-semibold">Scan and send</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  No account or companion app is needed on the phone.
                </p>
              </div>
              <ol className="space-y-4 text-sm">
                <li className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Wifi className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 pt-1">
                    <strong className="block font-medium">
                      Use the same Wi-Fi
                    </strong>
                    <span className="text-muted-foreground">
                      Connect the phone and this computer to the same local
                      network.
                    </span>
                  </span>
                </li>
                <li className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 pt-1">
                    <strong className="block font-medium">
                      Open the private page
                    </strong>
                    <span className="text-muted-foreground">
                      Scan the code with the phone camera. Allow private-network
                      access if Windows asks.
                    </span>
                  </span>
                </li>
                <li className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">
                    <Camera className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 pt-1">
                    <strong className="block font-medium">
                      Take or choose a photo
                    </strong>
                    <span className="text-muted-foreground">
                      Review it on the phone, then select{" "}
                      <strong>Send to computer</strong>.
                    </span>
                  </span>
                </li>
              </ol>

              <div className="min-w-0">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Can&apos;t scan? Open this address on the phone:
                </p>
                <div className="flex min-w-0 items-start gap-2 rounded-md border bg-muted/60 p-2">
                  <code className="min-w-0 flex-1 break-all pt-1 text-xs leading-5">
                    {session.url}
                  </code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    aria-label="Copy upload address"
                    title="Copy upload address"
                    onClick={() =>
                      void navigator.clipboard.writeText(session.url)
                    }
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground md:col-span-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Private single-use link
              </span>
              <span className="flex items-center gap-1.5">
                <Clock3 className="h-4 w-4 text-primary" />
                Expires in {Math.round(session.expiresInSeconds / 60)} minutes
              </span>
            </div>
          </div>
        )}

        {received && (
          <div className="flex min-h-96 flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-accent text-primary">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div>
              <p className="text-lg font-semibold">Receipt received</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                It is attached to this expense and remains local to this
                business workspace.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="border-t bg-muted/30 px-6 py-4">
          <Button variant={received ? "default" : "outline"} onClick={close}>
            {received ? "Done" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

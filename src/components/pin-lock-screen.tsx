import { useEffect, useState, type FormEvent } from "react";
import { LockKeyhole } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 30_000;
const THROTTLE_KEY = "soletrader:pin-throttle";

function savedThrottle() {
  try {
    const value = JSON.parse(localStorage.getItem(THROTTLE_KEY) ?? "null") as {
      attempts?: number;
      lockedUntil?: number;
    } | null;
    return {
      attempts: Math.max(0, Number(value?.attempts) || 0),
      lockedUntil: Math.max(0, Number(value?.lockedUntil) || 0),
    };
  } catch {
    return { attempts: 0, lockedUntil: 0 };
  }
}

export function PinLockScreen({
  unlock,
}: {
  unlock: (pin: string) => Promise<boolean>;
}) {
  const [initialThrottle] = useState(savedThrottle);
  const [pin, setPin] = useState("");
  const [attempts, setAttempts] = useState(initialThrottle.attempts);
  const [lockedUntil, setLockedUntil] = useState(initialThrottle.lockedUntil);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!lockedUntil) return;
    const timeout = window.setTimeout(
      () => {
        setLockedUntil(0);
        setAttempts(0);
        setError("");
        localStorage.removeItem(THROTTLE_KEY);
      },
      Math.max(0, lockedUntil - Date.now()),
    );
    return () => window.clearTimeout(timeout);
  }, [lockedUntil]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lockedUntil > Date.now() || pin.length < 4) return;
    setChecking(true);
    setError("");
    try {
      if (await unlock(pin)) {
        localStorage.removeItem(THROTTLE_KEY);
        return;
      }
      const nextAttempts = attempts + 1;
      setPin("");
      if (nextAttempts >= MAX_ATTEMPTS) {
        const nextLockedUntil = Date.now() + LOCKOUT_MS;
        setLockedUntil(nextLockedUntil);
        localStorage.setItem(
          THROTTLE_KEY,
          JSON.stringify({
            attempts: nextAttempts,
            lockedUntil: nextLockedUntil,
          }),
        );
        setError("Too many incorrect attempts. Try again in 30 seconds.");
      } else {
        setAttempts(nextAttempts);
        localStorage.setItem(
          THROTTLE_KEY,
          JSON.stringify({ attempts: nextAttempts, lockedUntil: 0 }),
        );
        setError(
          `Incorrect PIN. ${MAX_ATTEMPTS - nextAttempts} attempts remaining.`,
        );
      }
    } finally {
      setChecking(false);
    }
  };

  const locked = lockedUntil > Date.now();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        className="w-full max-w-sm space-y-5 rounded-lg border bg-card p-6 shadow-sm"
        onSubmit={submit}
      >
        <div className="flex items-center gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <LockKeyhole className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">SoleTrader locked</h1>
            <p className="text-sm text-muted-foreground">
              Enter your PIN to continue.
            </p>
          </div>
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="unlock-pin">PIN</Label>
          <Input
            id="unlock-pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            minLength={4}
            maxLength={8}
            disabled={locked || checking}
          />
        </div>
        <Button
          className="w-full"
          type="submit"
          disabled={locked || checking || pin.length < 4}
        >
          {checking ? "Checking..." : locked ? "Temporarily locked" : "Unlock"}
        </Button>
      </form>
    </main>
  );
}

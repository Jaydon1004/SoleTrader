import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { RouterProvider } from "react-router-dom";
import { AccountsSelector } from "@/components/accounts/accounts-selector";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { FeedbackProvider } from "@/components/feedback-provider";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { PinLockScreen } from "@/components/pin-lock-screen";
import { LoadingScreen } from "@/components/loading";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { router } from "@/router";
import {
  useAppSetting,
  useSetAppSetting,
  useUserProfile,
} from "@/lib/queries/settings";
import { hashPin, pinHashNeedsUpgrade, verifyPin } from "@/lib/crypto";
import {
  closeWorkspaceDatabase,
  selectWorkspaceDatabase,
} from "@/lib/database";
import {
  prepareBusinessWorkspace,
  type BusinessWorkspace,
} from "@/lib/workspaces";
import { useAppStore } from "@/stores/app-store";
import { useEffect, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      retry: 1,
    },
  },
});

const PIN_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function AppInner() {
  const {
    data: profile,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useUserProfile();
  const pinEnabled = useAppSetting("pin_enabled");
  const pinHash = useAppSetting("pin_hash");
  const setAppSetting = useSetAppSetting();
  const savedTaxYear = useAppSetting("current_tax_year");
  const [pinSessionUnlocked, setPinSessionUnlocked] = useState(false);
  const [taxYearReady, setTaxYearReady] = useState(false);
  const { isOnboardingComplete, setOnboardingComplete } = useAppStore();
  const currentTaxYear = useAppStore((state) => state.currentTaxYear);
  const setCurrentTaxYear = useAppStore((state) => state.setCurrentTaxYear);

  useEffect(() => {
    if (savedTaxYear.isLoading || savedTaxYear.isError || taxYearReady) return;
    if (savedTaxYear.data) setCurrentTaxYear(savedTaxYear.data);
    setTaxYearReady(true);
  }, [
    savedTaxYear.data,
    savedTaxYear.isError,
    savedTaxYear.isLoading,
    setCurrentTaxYear,
    taxYearReady,
  ]);

  useEffect(() => {
    if (
      !taxYearReady ||
      !currentTaxYear ||
      savedTaxYear.data === currentTaxYear ||
      setAppSetting.isPending
    )
      return;
    setAppSetting.mutate({ key: "current_tax_year", value: currentTaxYear });
  }, [currentTaxYear, savedTaxYear.data, setAppSetting, taxYearReady]);

  useEffect(() => {
    if (profile?.onboarding_complete === 1) {
      setOnboardingComplete(true);
    }
  }, [profile, setOnboardingComplete]);

  useEffect(() => {
    if (pinEnabled.data !== "true" || !pinSessionUnlocked) return;
    let timeout = window.setTimeout(
      () => setPinSessionUnlocked(false),
      PIN_IDLE_TIMEOUT_MS,
    );
    const resetTimeout = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => setPinSessionUnlocked(false),
        PIN_IDLE_TIMEOUT_MS,
      );
    };
    const lockNow = () => setPinSessionUnlocked(false);
    const activityEvents = ["keydown", "pointerdown", "touchstart"] as const;
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, resetTimeout),
    );
    window.addEventListener("soletrader:lock", lockNow);
    return () => {
      window.clearTimeout(timeout);
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, resetTimeout),
      );
      window.removeEventListener("soletrader:lock", lockNow);
    };
  }, [pinEnabled.data, pinSessionUnlocked]);

  if (
    isLoading ||
    pinEnabled.isLoading ||
    pinHash.isLoading ||
    savedTaxYear.isLoading ||
    !taxYearReady
  )
    return <LoadingScreen />;
  if (
    isError ||
    pinEnabled.isError ||
    pinHash.isError ||
    savedTaxYear.isError
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Application data unavailable</AlertTitle>
          <AlertDescription className="mt-2 space-y-4">
            <p>
              SoleTrader could not load your profile. Your data has not been
              changed.
            </p>
            <Button
              variant="outline"
              onClick={() =>
                void Promise.all([
                  refetch(),
                  pinEnabled.refetch(),
                  pinHash.refetch(),
                  savedTaxYear.refetch(),
                ])
              }
              disabled={
                isFetching ||
                pinEnabled.isFetching ||
                pinHash.isFetching ||
                savedTaxYear.isFetching
              }
            >
              {isFetching ? "Retrying..." : "Try again"}
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (pinEnabled.data === "true" && !pinHash.data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>PIN configuration invalid</AlertTitle>
          <AlertDescription>
            PIN protection is enabled but no verifier is available. Restore a
            valid backup or contact support.
          </AlertDescription>
        </Alert>
      </main>
    );
  }
  if (pinEnabled.data === "true" && pinHash.data && !pinSessionUnlocked) {
    return (
      <PinLockScreen
        unlock={async (pin) => {
          if (!(await verifyPin(pin, pinHash.data ?? ""))) return false;
          if (pinHashNeedsUpgrade(pinHash.data ?? "")) {
            await setAppSetting.mutateAsync({
              key: "pin_hash",
              value: await hashPin(pin),
            });
          }
          setPinSessionUnlocked(true);
          return true;
        }}
      />
    );
  }
  if (!isOnboardingComplete && profile?.onboarding_complete !== 1) {
    return <OnboardingWizard />;
  }
  return <RouterProvider router={router} />;
}

function WorkspaceGate() {
  const [workspace, setWorkspace] = useState<BusinessWorkspace | null>(null);
  const setOnboardingComplete = useAppStore(
    (state) => state.setOnboardingComplete,
  );

  useEffect(() => {
    const closeWorkspace = () => {
      void closeWorkspaceDatabase().finally(() => {
        queryClient.clear();
        setOnboardingComplete(false);
        setWorkspace(null);
      });
    };
    window.addEventListener("soletrader:close-workspace", closeWorkspace);
    return () =>
      window.removeEventListener("soletrader:close-workspace", closeWorkspace);
  }, [setOnboardingComplete]);

  if (!isTauri())
    return (
      <AccountsSelector
        onOpen={async () => {
          throw new Error(
            "Business workspaces open in the installed desktop application.",
          );
        }}
      />
    );
  if (!workspace)
    return (
      <AccountsSelector
        onOpen={async (selected) => {
          await prepareBusinessWorkspace(selected.id);
          await selectWorkspaceDatabase(selected.id);
          queryClient.clear();
          setOnboardingComplete(false);
          setWorkspace(selected);
        }}
      />
    );
  return <AppInner key={workspace.id} />;
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FeedbackProvider>
            <WorkspaceGate />
          </FeedbackProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;

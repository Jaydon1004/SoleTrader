import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleCheckBig, CircleX, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ToastTone = "success" | "error" | "info" | "warning";
interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => unknown | Promise<unknown>;
}
interface ConfirmOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
}
interface FeedbackContextValue {
  toast: (
    title: string,
    options?: {
      description?: string;
      tone?: ToastTone;
      actionLabel?: string;
      onAction?: () => unknown | Promise<unknown>;
    },
  ) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context)
    throw new Error("useFeedback must be used inside FeedbackProvider");
  return context;
}

const icons = {
  success: CircleCheckBig,
  error: CircleX,
  info: Info,
  warning: TriangleAlert,
};
const tones = {
  success:
    "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  error:
    "border-destructive/40 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-100",
  info: "border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-100",
  warning:
    "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const nextId = useRef(1);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmation, setConfirmation] = useState<
    (ConfirmOptions & { resolve: (answer: boolean) => void }) | null
  >(null);

  const dismiss = (id: number) =>
    setToasts((current) => current.filter((item) => item.id !== id));
  const toast = (
    title: string,
    options: {
      description?: string;
      tone?: ToastTone;
      actionLabel?: string;
      onAction?: () => unknown | Promise<unknown>;
    } = {},
  ) => {
    const item = {
      id: nextId.current++,
      title,
      description: options.description,
      tone: options.tone ?? "success",
      actionLabel: options.actionLabel,
      onAction: options.onAction,
    };
    setToasts((current) => [...current.slice(-3), item]);
    window.setTimeout(() => dismiss(item.id), 5000);
  };
  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setConfirmation({ ...options, resolve }));
  const answer = (value: boolean) => {
    confirmation?.resolve(value);
    setConfirmation(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-100 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((item) => {
          const Icon = icons[item.tone];
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-md border p-3 shadow-lg ${tones[item.tone]}`}
              role={item.tone === "error" ? "alert" : "status"}
            >
              <Icon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs opacity-80">
                    {item.description}
                  </p>
                )}
                {item.actionLabel && item.onAction && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 bg-transparent"
                    onClick={() => {
                      void item.onAction?.();
                      dismiss(item.id);
                    }}
                  >
                    {item.actionLabel}
                  </Button>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="rounded p-0.5 opacity-70 hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <Dialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) answer(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => answer(false)}>
              Cancel
            </Button>
            <Button
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => answer(true)}
            >
              {confirmation?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FeedbackContext.Provider>
  );
}

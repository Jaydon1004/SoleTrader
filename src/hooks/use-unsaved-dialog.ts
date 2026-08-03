import { useEffect, useState, type PointerEvent } from "react";
import { useFeedback } from "@/components/feedback-provider";

export function useUnsavedDialog({
  open,
  onOpenChange,
  subject,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  onDiscard?: () => void | Promise<void>;
}) {
  const { confirm } = useFeedback();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (open && dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty, open]);

  const requestClose = async () => {
    if (
      dirty &&
      !(await confirm({
        title: `Discard unsaved ${subject}?`,
        description: "The changes in this editor have not been saved.",
        confirmLabel: "Discard changes",
        destructive: true,
      }))
    )
      return;
    await onDiscard?.();
    setDirty(false);
    onOpenChange(false);
  };

  const closeAfterSave = () => {
    setDirty(false);
    onOpenChange(false);
  };

  return {
    clearDirty: () => setDirty(false),
    closeAfterSave,
    dirty,
    dirtyCaptureProps: {
      onInputCapture: () => setDirty(true),
      onPointerDownCapture: (event: PointerEvent<HTMLElement>) => {
        if (
          (event.target as HTMLElement).closest(
            '[role="combobox"], [role="switch"]',
          )
        )
          setDirty(true);
      },
    },
    markDirty: () => setDirty(true),
    requestClose,
  };
}

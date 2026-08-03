import { create } from "zustand";
import { persist } from "zustand/middleware";

export function currentUkTaxYear(date = new Date()) {
  const year = date.getFullYear();
  const startsThisYear =
    date.getMonth() > 3 || (date.getMonth() === 3 && date.getDate() >= 6);
  const start = startsThisYear ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
}

interface AppState {
  currentTaxYear: string;
  setCurrentTaxYear: (year: string) => void;
  isOnboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
  isPinLocked: boolean;
  setPinLocked: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentTaxYear: currentUkTaxYear(),
      setCurrentTaxYear: (year) => set({ currentTaxYear: year }),
      isOnboardingComplete: false,
      setOnboardingComplete: (v) => set({ isOnboardingComplete: v }),
      isPinLocked: false,
      setPinLocked: (v) => set({ isPinLocked: v }),
    }),
    { name: "sole-trader-app" },
  ),
);

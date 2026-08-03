import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PersonalDetailsStep } from "./steps/personal-details-step";
import { BusinessDetailsStep } from "./steps/business-details-step";
import { TaxSetupStep } from "./steps/tax-setup-step";
import { OpeningBalancesStep } from "./steps/opening-balances-step";
import { CompleteStep } from "./steps/complete-step";
import { useUpdateUserProfile } from "@/lib/queries/settings";
import { useAppStore } from "@/stores/app-store";
import { execute } from "@/lib/database";
import type { UserProfile } from "@/types/database";

const STEPS = [
  {
    title: "Personal Details",
    description: "Your name and contact information",
  },
  {
    title: "Business Details",
    description: "Your trading name and business description",
  },
  {
    title: "Tax & Accounting",
    description: "VAT, CIS, student loan and accounting basis",
  },
  {
    title: "Opening Balances",
    description: "Figures from earlier this tax year (optional)",
  },
  { title: "All Done", description: "You're ready to go" },
];

type OpeningBalances = {
  income_to_date: string;
  expenses_to_date: string;
  tax_paid_to_date: string;
};

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [profileData, setProfileData] = useState<Partial<UserProfile>>({
    accounting_basis: "cash",
    vat_status: "unregistered",
    student_loan_plan: "none",
    cis_status: "none",
  });
  const [openingBalances, setOpeningBalances] = useState<OpeningBalances>({
    income_to_date: "",
    expenses_to_date: "",
    tax_paid_to_date: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const updateProfile = useUpdateUserProfile();
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);

  const isLastStep = step === STEPS.length - 1;
  const progress = (step / (STEPS.length - 1)) * 100;

  const handleNext = async () => {
    if (isLastStep) {
      await handleComplete();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    setSaveError("");
    try {
      // Filter out undefined/null values so the SQL update doesn't fail
      const cleanData = Object.fromEntries(
        Object.entries({ ...profileData, onboarding_complete: 1 }).filter(
          ([, v]) => v !== undefined && v !== null,
        ),
      ) as Partial<UserProfile>;
      await updateProfile.mutateAsync(cleanData);

      // Save opening balances using separate inserts (safer than multi-row)
      const income = parseFloat(openingBalances.income_to_date) || 0;
      const expenses = parseFloat(openingBalances.expenses_to_date) || 0;
      const taxPaid = parseFloat(openingBalances.tax_paid_to_date) || 0;
      const upsert =
        "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";
      if (income > 0)
        await execute(upsert, ["opening_income", income.toString()]);
      if (expenses > 0)
        await execute(upsert, ["opening_expenses", expenses.toString()]);
      if (taxPaid > 0)
        await execute(upsert, ["opening_tax_paid", taxPaid.toString()]);
      setOnboardingComplete(true);
    } catch (error) {
      console.error("Onboarding save error:", error);
      setSaveError(
        "Your setup could not be saved. Check the application data connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 0)
      return !!(
        profileData.first_name?.trim() && profileData.last_name?.trim()
      );
    return true;
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold">Welcome to SoleTrader</h1>
          <p className="mt-2 text-muted-foreground">
            Let's get your account set up. It only takes a minute.
          </p>
        </div>

        {/* Step indicator */}
        <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>{STEPS[step].title}</span>
          <span>
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <Progress value={progress} className="mb-6" />

        {/* Step description */}
        <p className="mb-6 text-sm text-muted-foreground">
          {STEPS[step].description}
        </p>

        {saveError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Setup not saved</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Content */}
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          {step === 0 && (
            <PersonalDetailsStep data={profileData} onChange={setProfileData} />
          )}
          {step === 1 && (
            <BusinessDetailsStep data={profileData} onChange={setProfileData} />
          )}
          {step === 2 && (
            <TaxSetupStep data={profileData} onChange={setProfileData} />
          )}
          {step === 3 && (
            <OpeningBalancesStep
              data={openingBalances}
              onChange={setOpeningBalances}
            />
          )}
          {step === 4 && <CompleteStep name={profileData.first_name ?? ""} />}
        </div>

        {/* Navigation */}
        <div className="mt-6 flex justify-between">
          <Button
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
          >
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canProceed() || saving}>
            {saving ? "Saving..." : isLastStep ? "Go to Dashboard" : "Continue"}
          </Button>
        </div>
      </div>
    </div>
  );
}

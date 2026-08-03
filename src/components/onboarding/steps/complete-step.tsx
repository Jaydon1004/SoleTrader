import { CheckCircle2, LayoutDashboard, Settings } from "lucide-react";

type Props = {
  name: string;
};

export function CompleteStep({ name }: Props) {
  return (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold">
          You're all set{name ? `, ${name}` : ""}!
        </h3>
        <p className="mt-2 text-muted-foreground">
          SoleTrader is configured and ready to use. Your data is stored
          securely on this device only.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-left">
        <div className="rounded-lg border bg-card p-4">
          <LayoutDashboard className="mb-2 h-5 w-5 text-primary" />
          <p className="font-medium text-sm">Dashboard</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your financial overview updates in real time as you add data
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <Settings className="mb-2 h-5 w-5 text-primary" />
          <p className="font-medium text-sm">Settings</p>
          <p className="text-xs text-muted-foreground mt-1">
            Update your details, tax year rates, and invoice template anytime
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground italic">
        All tax calculations are estimates only — always confirm with HMRC or a
        qualified accountant.
      </p>
    </div>
  );
}

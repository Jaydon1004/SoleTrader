import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

type OpeningBalances = {
  income_to_date: string;
  expenses_to_date: string;
  tax_paid_to_date: string;
};

type Props = {
  data: OpeningBalances;
  onChange: (data: OpeningBalances) => void;
};

export function OpeningBalancesStep({ data, onChange }: Props) {
  const set = (field: keyof OpeningBalances, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <AlertDescription>
          <strong>Starting mid-year?</strong> Enter what you've already earned
          and spent in this tax year (6 April onwards) so your totals are
          accurate from day one. Leave blank if you're starting from zero.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="income_to_date">
          Income received so far this tax year
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            £
          </span>
          <Input
            id="income_to_date"
            className="pl-7"
            type="number"
            min="0"
            step="0.01"
            value={data.income_to_date}
            onChange={(e) => set("income_to_date", e.target.value)}
            placeholder="0.00"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Total payments received from clients since 6 April
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expenses_to_date">
          Business expenses paid so far this tax year
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            £
          </span>
          <Input
            id="expenses_to_date"
            className="pl-7"
            type="number"
            min="0"
            step="0.01"
            value={data.expenses_to_date}
            onChange={(e) => set("expenses_to_date", e.target.value)}
            placeholder="0.00"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Total allowable business expenses paid since 6 April
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tax_paid_to_date">
          Tax already paid this year (CIS deductions, payments on account, etc.)
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            £
          </span>
          <Input
            id="tax_paid_to_date"
            className="pl-7"
            type="number"
            min="0"
            step="0.01"
            value={data.tax_paid_to_date}
            onChange={(e) => set("tax_paid_to_date", e.target.value)}
            placeholder="0.00"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Leave as 0 if you haven't made any tax payments yet
        </p>
      </div>
    </div>
  );
}

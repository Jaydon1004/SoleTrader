import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserProfile } from "@/types/database";

type Props = {
  data: Partial<UserProfile>;
  onChange: (data: Partial<UserProfile>) => void;
};

export function TaxSetupStep({ data, onChange }: Props) {
  const set = (field: keyof UserProfile, value: unknown) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <AlertDescription>
          All tax calculations are <strong>estimates only</strong>. Always
          confirm with HMRC or a qualified accountant.
        </AlertDescription>
      </Alert>

      {/* Accounting Basis */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Accounting Basis</Label>
        <RadioGroup
          value={data.accounting_basis ?? "cash"}
          onValueChange={(v) => set("accounting_basis", v)}
          className="grid grid-cols-1 gap-3"
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="cash" className="mt-0.5" />
            <div>
              <p className="font-medium">
                Cash Basis{" "}
                <span className="text-xs text-muted-foreground ml-1">
                  (recommended for most sole traders)
                </span>
              </p>
              <p className="text-sm text-muted-foreground">
                Record income when you receive payment, expenses when you pay
                them.
              </p>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="accrual" className="mt-0.5" />
            <div>
              <p className="font-medium">Accrual Basis (Traditional)</p>
              <p className="text-sm text-muted-foreground">
                Record income when invoiced, expenses when committed — even if
                unpaid.
              </p>
            </div>
          </label>
        </RadioGroup>
      </div>

      {/* VAT Status */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">VAT Status</Label>
        <RadioGroup
          value={data.vat_status ?? "unregistered"}
          onValueChange={(v) => set("vat_status", v)}
          className="grid grid-cols-1 gap-3"
        >
          {[
            {
              value: "unregistered",
              label: "Not VAT Registered",
              desc: "Your turnover is below the VAT threshold (£90,000)",
            },
            {
              value: "voluntary",
              label: "Voluntarily VAT Registered",
              desc: "You've chosen to register below the threshold",
            },
            {
              value: "compulsory",
              label: "Compulsorily VAT Registered",
              desc: "Your turnover exceeded the threshold",
            },
          ].map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border p-4 hover:bg-accent has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem value={opt.value} className="mt-0.5" />
              <div>
                <p className="font-medium">{opt.label}</p>
                <p className="text-sm text-muted-foreground">{opt.desc}</p>
              </div>
            </label>
          ))}
        </RadioGroup>

        {data.vat_status !== "unregistered" && (
          <div className="space-y-2 pl-1">
            <Label htmlFor="vat_number">VAT Registration Number</Label>
            <Input
              id="vat_number"
              value={data.vat_number ?? ""}
              onChange={(e) => set("vat_number", e.target.value)}
              placeholder="GB123456789"
              maxLength={14}
            />
          </div>
        )}
      </div>

      {/* Student Loan */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Student Loan</Label>
        <Select
          value={data.student_loan_plan ?? "none"}
          onValueChange={(v) => set("student_loan_plan", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select plan..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No student loan</SelectItem>
            <SelectItem value="plan_1">Plan 1 (before Sept 2012)</SelectItem>
            <SelectItem value="plan_2">Plan 2 (from Sept 2012)</SelectItem>
            <SelectItem value="plan_4">Plan 4 (Scotland)</SelectItem>
            <SelectItem value="postgrad">Postgraduate Loan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* CIS */}
      <div className="flex items-center justify-between rounded-lg border p-4">
        <div>
          <p className="font-medium">Construction Industry Scheme (CIS)</p>
          <p className="text-sm text-muted-foreground">
            Are you registered under CIS as a subcontractor?
          </p>
        </div>
        <Switch
          checked={data.cis_status !== "none"}
          onCheckedChange={(v) => set("cis_status", v ? "registered" : "none")}
        />
      </div>
    </div>
  );
}

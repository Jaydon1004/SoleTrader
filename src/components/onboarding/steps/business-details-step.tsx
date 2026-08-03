import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { UserProfile } from "@/types/database";

type Props = {
  data: Partial<UserProfile>;
  onChange: (data: Partial<UserProfile>) => void;
};

export function BusinessDetailsStep({ data, onChange }: Props) {
  const set = (field: keyof UserProfile, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Your trading name and business description appear on invoices and
        reports.
      </p>
      <div className="space-y-2">
        <Label htmlFor="trading_name">Trading Name</Label>
        <Input
          id="trading_name"
          value={data.trading_name ?? ""}
          onChange={(e) => set("trading_name", e.target.value)}
          placeholder="John Smith Building Services"
        />
        <p className="text-xs text-muted-foreground">
          This is the name that appears on your invoices. Leave blank to use
          your full name.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="business_description">
          Business Description{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="business_description"
          value={data.business_description ?? ""}
          onChange={(e) => set("business_description", e.target.value)}
          placeholder="Civil engineer and surveyor specialising in residential and commercial projects"
          rows={3}
        />
      </div>
    </div>
  );
}

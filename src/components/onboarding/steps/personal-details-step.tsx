import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserProfile } from "@/types/database";

type Props = {
  data: Partial<UserProfile>;
  onChange: (data: Partial<UserProfile>) => void;
};

export function PersonalDetailsStep({ data, onChange }: Props) {
  const set = (field: keyof UserProfile, value: string) =>
    onChange({ ...data, [field]: value });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        This information is stored locally on your device only. It is used to
        pre-fill invoices and tax calculations.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name</Label>
          <Input
            id="first_name"
            value={data.first_name ?? ""}
            onChange={(e) => set("first_name", e.target.value)}
            placeholder="John"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name</Label>
          <Input
            id="last_name"
            value={data.last_name ?? ""}
            onChange={(e) => set("last_name", e.target.value)}
            placeholder="Smith"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="utr">
            UTR Number <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="utr"
            value={data.utr ?? ""}
            onChange={(e) => set("utr", e.target.value)}
            placeholder="1234567890"
            maxLength={10}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ni_number">
            NI Number <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="ni_number"
            value={data.ni_number ?? ""}
            onChange={(e) => set("ni_number", e.target.value.toUpperCase())}
            placeholder="AB123456C"
            maxLength={9}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email Address</Label>
        <Input
          id="email"
          type="email"
          value={data.email ?? ""}
          onChange={(e) => set("email", e.target.value)}
          placeholder="john@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <Input
          id="phone"
          type="tel"
          value={data.phone ?? ""}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="07700 900000"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address_line_1">Address Line 1</Label>
        <Input
          id="address_line_1"
          value={data.address_line_1 ?? ""}
          onChange={(e) => set("address_line_1", e.target.value)}
          placeholder="123 Main Street"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="address_line_2">
          Address Line 2{" "}
          <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="address_line_2"
          value={data.address_line_2 ?? ""}
          onChange={(e) => set("address_line_2", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="city">Town / City</Label>
          <Input
            id="city"
            value={data.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="county">
            County <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="county"
            value={data.county ?? ""}
            onChange={(e) => set("county", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postcode">Postcode</Label>
          <Input
            id="postcode"
            value={data.postcode ?? ""}
            onChange={(e) => set("postcode", e.target.value.toUpperCase())}
            placeholder="SW1A 1AA"
            maxLength={8}
          />
        </div>
      </div>
    </div>
  );
}

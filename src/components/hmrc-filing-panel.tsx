import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { useFeedback } from "@/components/feedback-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type HmrcFilingDetails,
  useSaveHmrcFilingDetails,
} from "@/lib/hmrc-filing";

function MoneyField({
  id,
  label,
  value,
  signed = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  signed?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          £
        </span>
        <Input
          id={id}
          className="pl-7"
          type="number"
          min={signed ? undefined : 0}
          step="0.01"
          value={value || ""}
          onChange={(event) =>
            onChange(
              signed
                ? Number(event.target.value) || 0
                : Math.max(0, Number(event.target.value) || 0),
            )
          }
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onCheckedChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function HmrcFilingPanel({ details }: { details: HmrcFilingDetails }) {
  const [form, setForm] = useState(details);
  const save = useSaveHmrcFilingDetails();
  const { toast } = useFeedback();

  useEffect(() => setForm(details), [details]);

  const set = <K extends keyof HmrcFilingDetails>(
    field: K,
    value: HmrcFilingDetails[K],
  ) =>
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field !== "reviewed" ? { reviewed: 0 } : {}),
    }));
  const submit = async () => {
    try {
      await save.mutateAsync(form);
      toast("HMRC declarations saved");
    } catch (caught) {
      toast("HMRC declarations were not saved", {
        tone: "error",
        description:
          caught instanceof Error ? caught.message : "Please try again.",
      });
    }
  };

  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">HMRC filing declarations</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These answers affect form selection and taxable profit. Changing an
          answer clears the reviewed status.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h4 className="text-sm font-semibold">Business circumstances</h4>
          <div className="mt-2 border-y">
            <Toggle
              label="Business started during this tax year"
              detail="Record the commencement date shown on the self-employment pages."
              checked={form.business_started === 1}
              onCheckedChange={(checked) =>
                set("business_started", checked ? 1 : 0)
              }
            />
            {form.business_started === 1 && (
              <div className="border-b py-3">
                <Label htmlFor="hmrc-start-date">Start date</Label>
                <Input
                  id="hmrc-start-date"
                  className="mt-1.5"
                  type="date"
                  value={form.start_date}
                  onChange={(event) => set("start_date", event.target.value)}
                />
              </div>
            )}
            <Toggle
              label="Business ceased during this tax year"
              detail="A cessation can change loss and capital allowance treatment."
              checked={form.business_ceased === 1}
              onCheckedChange={(checked) =>
                set("business_ceased", checked ? 1 : 0)
              }
            />
            {form.business_ceased === 1 && (
              <div className="border-b py-3">
                <Label htmlFor="hmrc-cessation-date">Cessation date</Label>
                <Input
                  id="hmrc-cessation-date"
                  className="mt-1.5"
                  type="date"
                  value={form.cessation_date}
                  onChange={(event) =>
                    set("cessation_date", event.target.value)
                  }
                />
              </div>
            )}
            <Toggle
              label="Business details changed"
              detail="Name, description, address or postcode changed during the last 12 months."
              checked={form.business_details_changed === 1}
              onCheckedChange={(checked) =>
                set("business_details_changed", checked ? 1 : 0)
              }
            />
            <Toggle
              label="More than one self-employed business"
              detail="Each business normally needs its own self-employment pages."
              checked={form.multiple_businesses === 1}
              onCheckedChange={(checked) =>
                set("multiple_businesses", checked ? 1 : 0)
              }
            />
            <Toggle
              label="Special tax arrangements apply"
              detail="Includes unusual basis periods, farmers or creators averaging, foster care relief, foreign income rules or other specialist treatment."
              checked={form.special_arrangements === 1}
              onCheckedChange={(checked) =>
                set("special_arrangements", checked ? 1 : 0)
              }
            />
            <Toggle
              label="Figures are provisional"
              detail="The return must say when provisional figures are used and may need amendment later."
              checked={form.provisional_figures === 1}
              onCheckedChange={(checked) =>
                set("provisional_figures", checked ? 1 : 0)
              }
            />
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold">Profit adjustments</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <MoneyField
              id="opening-stock"
              label="Opening stock / work in progress"
              value={form.opening_stock}
              onChange={(value) => set("opening_stock", value)}
            />
            <MoneyField
              id="goods-own-use"
              label="Goods/services for own use"
              value={form.goods_own_use}
              onChange={(value) => set("goods_own_use", value)}
            />
            <MoneyField
              id="other-business-income"
              label="Other business income"
              value={form.other_business_income}
              onChange={(value) => set("other_business_income", value)}
            />
            <MoneyField
              id="non-taxable-income"
              label="Non-taxable business income"
              value={form.non_taxable_business_income}
              onChange={(value) => set("non_taxable_business_income", value)}
            />
            <MoneyField
              id="disallowable-expenses"
              label="Disallowable expenses in accounts"
              value={form.disallowable_expenses}
              onChange={(value) => set("disallowable_expenses", value)}
            />
            <MoneyField
              id="basis-adjustment"
              label="Basis period adjustment"
              value={form.basis_period_adjustment}
              signed
              onChange={(value) => set("basis_period_adjustment", value)}
            />
            <MoneyField
              id="practice-adjustment"
              label="Accounting practice adjustment"
              value={form.accounting_practice_adjustment}
              signed
              onChange={(value) => set("accounting_practice_adjustment", value)}
            />
            <MoneyField
              id="averaging-adjustment"
              label="Averaging adjustment"
              value={form.averaging_adjustment}
              signed
              onChange={(value) => set("averaging_adjustment", value)}
            />
            <MoneyField
              id="transition-profit"
              label="Transition profit arising"
              value={form.transition_profit}
              onChange={(value) => set("transition_profit", value)}
            />
            <MoneyField
              id="transition-relief"
              label="Loss against transition profit"
              value={form.transition_profit_loss_relief}
              onChange={(value) => set("transition_profit_loss_relief", value)}
            />
            <MoneyField
              id="loss-brought-forward"
              label="Loss brought forward used"
              value={form.loss_brought_forward}
              onChange={(value) => set("loss_brought_forward", value)}
            />
            <MoneyField
              id="loss-other-income"
              label="Current loss against other income"
              value={form.current_loss_other_income}
              onChange={(value) => set("current_loss_other_income", value)}
            />
            <MoneyField
              id="loss-carry-back"
              label="Current loss carried back"
              value={form.current_loss_carry_back}
              onChange={(value) => set("current_loss_carry_back", value)}
            />
            <MoneyField
              id="loss-forward"
              label="Total loss carried forward"
              value={form.loss_carry_forward}
              onChange={(value) => set("loss_carry_forward", value)}
            />
            <MoneyField
              id="other-tax-taken"
              label="Other tax taken off trading income"
              value={form.other_tax_taken_off}
              onChange={(value) => set("other_tax_taken_off", value)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="border-y">
          <Toggle
            label="Pay Class 2 NICs voluntarily"
            detail="Only relevant below the small profits threshold; confirm eligibility before filing."
            checked={form.class2_voluntary === 1}
            onCheckedChange={(checked) =>
              set("class2_voluntary", checked ? 1 : 0)
            }
          />
          <Toggle
            label="Exempt from Class 4 NICs"
            detail="Only select this where an HMRC exemption applies."
            checked={form.class4_exempt === 1}
            onCheckedChange={(checked) => set("class4_exempt", checked ? 1 : 0)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hmrc-other-information">
            Other information for the return
          </Label>
          <Textarea
            id="hmrc-other-information"
            value={form.other_information}
            onChange={(event) => set("other_information", event.target.value)}
            placeholder="Explain provisional figures, changes or specialist treatment."
          />
        </div>
      </div>

      <Alert variant="warning">
        <AlertTitle>Whole-return scope check</AlertTitle>
        <AlertDescription>
          Consider property, partnerships, foreign income, capital gains,
          pensions, employment, savings, dividends, trusts, benefits and High
          Income Child Benefit Charge. This package cannot infer them from the
          business ledger.
        </AlertDescription>
      </Alert>

      <div className="border-y">
        <Toggle
          label="I have considered unsupported circumstances"
          detail="Any relevant items are recorded above, in the personal tax checklist, or will be handled by an accountant or filing product."
          checked={form.unsupported_circumstances_confirmed === 1}
          onCheckedChange={(checked) =>
            set("unsupported_circumstances_confirmed", checked ? 1 : 0)
          }
        />
        <Toggle
          label="I have reviewed these HMRC declarations"
          detail="This confirms review only; it is not a declaration that a tax return has been filed."
          checked={form.reviewed === 1}
          onCheckedChange={(checked) => set("reviewed", checked ? 1 : 0)}
        />
      </div>

      <Button disabled={save.isPending} onClick={() => void submit()}>
        <Save className="mr-2 h-4 w-4" /> Save HMRC declarations
      </Button>
    </section>
  );
}

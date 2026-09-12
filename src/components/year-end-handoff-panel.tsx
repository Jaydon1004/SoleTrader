import { useEffect, useState } from "react";
import { CheckCircle2, Save } from "lucide-react";
import { useFeedback } from "@/components/feedback-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  type BankYearEndConfirmation,
  type YearEndHandoffData,
  type YearEndHandoffDetails,
  useSaveBankYearEndConfirmation,
  useSaveYearEndHandoff,
} from "@/lib/year-end-handoff";

const moneyFields: {
  key: keyof YearEndHandoffDetails;
  label: string;
  detail: string;
}[] = [
  {
    key: "stock_value",
    label: "Closing stock / WIP",
    detail: "Cost value at year end",
  },
  {
    key: "cash_on_hand",
    label: "Business cash held",
    detail: "Cash not in a bank account",
  },
  {
    key: "loans_balance",
    label: "Loans outstanding",
    detail: "Closing business loan balance",
  },
  {
    key: "hire_purchase_balance",
    label: "Hire purchase outstanding",
    detail: "Closing finance balance",
  },
  {
    key: "capital_introduced",
    label: "Capital introduced",
    detail: "Personal funds put into the business",
  },
  {
    key: "drawings",
    label: "Owner drawings",
    detail: "Business funds taken personally",
  },
];

const personalFields: {
  key: keyof YearEndHandoffDetails;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "employment_details",
    label: "Employment and P60/P45",
    placeholder: "Enter details or None",
  },
  {
    key: "pension_details",
    label: "Pension income and contributions",
    placeholder: "Enter details or None",
  },
  {
    key: "interest_details",
    label: "Bank and savings interest",
    placeholder: "Enter details or None",
  },
  {
    key: "dividend_details",
    label: "Dividends",
    placeholder: "Enter details or None",
  },
  {
    key: "benefit_details",
    label: "State benefits and other income",
    placeholder: "Enter details or None",
  },
  {
    key: "student_loan_details",
    label: "Student or postgraduate loans",
    placeholder: "Plan and balance details, or None",
  },
  {
    key: "payments_on_account_details",
    label: "Self Assessment payments on account",
    placeholder: "Amounts and dates, or None",
  },
];

function CompletionSwitch({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t pt-4">
      <Label className="leading-5">{label}</Label>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

export function YearEndHandoffPanel({
  data,
  yearEnd,
  yearStart,
}: {
  data: YearEndHandoffData;
  yearEnd: string;
  yearStart: string;
}) {
  const { toast } = useFeedback();
  const saveDetails = useSaveYearEndHandoff();
  const saveBank = useSaveBankYearEndConfirmation();
  const [form, setForm] = useState(data.details);
  const [banks, setBanks] = useState(data.bankConfirmations);
  const banksReady =
    banks.length > 0 &&
    banks.every(
      (bank) =>
        bank.confirmed_complete === 1 &&
        bank.statement_start <= yearStart &&
        bank.statement_end >= yearEnd,
    );
  const approvalReady =
    form.questionnaire_complete === 1 &&
    form.personal_tax_complete === 1 &&
    banksReady;

  useEffect(() => setForm(data.details), [data.details]);
  useEffect(() => setBanks(data.bankConfirmations), [data.bankConfirmations]);

  const set = (
    key: keyof YearEndHandoffDetails,
    value: string | number | null,
  ) =>
    setForm((current) => ({
      ...current,
      [key]: value,
      approved: 0,
      approved_at: null,
    }));
  const updateBank = (
    bankAccountId: number,
    key: keyof BankYearEndConfirmation,
    value: string | number,
  ) =>
    setBanks((current) =>
      current.map((bank) =>
        bank.bank_account_id === bankAccountId
          ? { ...bank, [key]: value }
          : bank,
      ),
    );
  const persistDetails = async (message: string) => {
    try {
      const details = {
        ...form,
        approved_at: form.approved
          ? (form.approved_at ?? new Date().toISOString())
          : null,
      };
      await saveDetails.mutateAsync(details);
      setForm(details);
      toast(message);
    } catch (caught) {
      toast("Year-end information was not saved", {
        tone: "error",
        description:
          caught instanceof Error ? caught.message : "Please try again.",
      });
    }
  };
  const persistBanks = async () => {
    try {
      await Promise.all(banks.map((bank) => saveBank.mutateAsync(bank)));
      if (form.approved === 1) {
        const details = { ...form, approved: 0, approved_at: null };
        await saveDetails.mutateAsync(details);
        setForm(details);
      }
      toast("Bank confirmations saved");
    } catch (caught) {
      toast("Bank confirmations were not saved", {
        tone: "error",
        description:
          caught instanceof Error ? caught.message : "Please try again.",
      });
    }
  };

  return (
    <section>
      <div className="mb-4">
        <h3 className="text-lg font-semibold">Year-end information</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Complete these once for the selected tax year. Saved answers are
          included in the handoff.
        </p>
      </div>
      <Tabs defaultValue="business">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="business">Business declarations</TabsTrigger>
          <TabsTrigger value="personal">Personal tax checklist</TabsTrigger>
          <TabsTrigger value="bank">Bank confirmation</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="border-y py-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {moneyFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  type="number"
                  min="0"
                  step="0.01"
                  value={Number(form[field.key]) || ""}
                  onChange={(event) =>
                    set(field.key, Number(event.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">{field.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="private-use-notes">Private use adjustments</Label>
              <Textarea
                id="private-use-notes"
                value={form.private_use_notes}
                onChange={(event) =>
                  set("private_use_notes", event.target.value)
                }
                placeholder="Vehicles, phone, utilities or other mixed-use costs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="home-office-notes">Use of home</Label>
              <Textarea
                id="home-office-notes"
                value={form.home_office_notes}
                onChange={(event) =>
                  set("home_office_notes", event.target.value)
                }
                placeholder="Rooms, hours, method used, or None"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="other-year-end-notes">
                Other year-end information
              </Label>
              <Textarea
                id="other-year-end-notes"
                value={form.other_year_end_notes}
                onChange={(event) =>
                  set("other_year_end_notes", event.target.value)
                }
                placeholder="Commitments, unusual transactions, disputes or anything your accountant should know"
              />
            </div>
          </div>
          <CompletionSwitch
            checked={form.questionnaire_complete === 1}
            label="I have reviewed these business year-end answers and entered zero where none applies."
            onCheckedChange={(checked) =>
              set("questionnaire_complete", checked ? 1 : 0)
            }
          />
          <div className="mt-4 flex justify-end">
            <Button
              disabled={saveDetails.isPending}
              onClick={() => void persistDetails("Year-end declarations saved")}
            >
              <Save className="mr-2 h-4 w-4" /> Save declarations
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="personal" className="border-y py-5">
          <div className="grid gap-4 md:grid-cols-2">
            {personalFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key}>{field.label}</Label>
                <Textarea
                  id={field.key}
                  rows={2}
                  value={String(form[field.key] ?? "")}
                  onChange={(event) => set(field.key, event.target.value)}
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>
          <CompletionSwitch
            checked={form.personal_tax_complete === 1}
            label="I have reviewed every personal tax category and entered None where it does not apply."
            onCheckedChange={(checked) =>
              set("personal_tax_complete", checked ? 1 : 0)
            }
          />
          <div className="mt-4 flex justify-end">
            <Button
              disabled={saveDetails.isPending}
              onClick={() =>
                void persistDetails("Personal tax checklist saved")
              }
            >
              <Save className="mr-2 h-4 w-4" /> Save checklist
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="bank" className="border-y py-5">
          <div className="space-y-6">
            {banks.map((bank) => (
              <div
                key={bank.bank_account_id}
                className="border-b pb-6 last:border-0 last:pb-0"
              >
                <div className="mb-3">
                  <h4 className="font-semibold">{bank.account_name}</h4>
                  <p className="text-xs capitalize text-muted-foreground">
                    {bank.account_type.replace("_", " ")}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Statement starts</Label>
                    <Input
                      type="date"
                      value={bank.statement_start}
                      onChange={(event) =>
                        updateBank(
                          bank.bank_account_id,
                          "statement_start",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Statement ends</Label>
                    <Input
                      type="date"
                      value={bank.statement_end}
                      onChange={(event) =>
                        updateBank(
                          bank.bank_account_id,
                          "statement_end",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Confirmed closing balance</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={bank.closing_balance || ""}
                      onChange={(event) =>
                        updateBank(
                          bank.bank_account_id,
                          "closing_balance",
                          Number(event.target.value) || 0,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes</Label>
                    <Input
                      value={bank.notes}
                      onChange={(event) =>
                        updateBank(
                          bank.bank_account_id,
                          "notes",
                          event.target.value,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <Switch
                    checked={bank.confirmed_complete === 1}
                    onCheckedChange={(checked) =>
                      updateBank(
                        bank.bank_account_id,
                        "confirmed_complete",
                        checked ? 1 : 0,
                      )
                    }
                  />
                  <Label>
                    Statements cover the full tax year and the closing balance
                    is confirmed
                  </Label>
                </div>
              </div>
            ))}
            {banks.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No active bank accounts were found.
              </p>
            )}
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              disabled={saveBank.isPending}
              onClick={() => void persistBanks()}
            >
              <Save className="mr-2 h-4 w-4" /> Save bank confirmations
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="approval" className="border-y py-5">
          <div className="max-w-2xl space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="approved-by">Approved by</Label>
              <Input
                id="approved-by"
                value={form.approved_by}
                onChange={(event) => set("approved_by", event.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="declaration">
                Declaration or accountant notes
              </Label>
              <Textarea
                id="declaration"
                value={form.declaration}
                onChange={(event) => set("declaration", event.target.value)}
                placeholder="I confirm these records are complete and accurate to the best of my knowledge."
              />
            </div>
            <CompletionSwitch
              checked={form.approved === 1}
              disabled={!approvalReady}
              label="Approve this year-end information for accountant handoff"
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  approved: checked ? 1 : 0,
                  approved_at: null,
                }))
              }
            />
            {!approvalReady && (
              <p className="text-sm text-amber-700">
                Complete the business, personal tax and bank sections before
                approval.
              </p>
            )}
            {form.approved_at && (
              <p className="flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" /> Approved{" "}
                {new Date(form.approved_at).toLocaleString("en-GB")}
              </p>
            )}
            <Button
              disabled={
                saveDetails.isPending ||
                (form.approved === 1 && !approvalReady) ||
                (form.approved === 1 &&
                  (!form.approved_by.trim() || !form.declaration.trim()))
              }
              onClick={() => void persistDetails("Year-end approval saved")}
            >
              <Save className="mr-2 h-4 w-4" /> Save approval
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}

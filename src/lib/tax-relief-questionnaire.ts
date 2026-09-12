import { taxReliefItems, type TaxReliefItem } from "@/lib/tax-relief-guide";

export type QuestionnaireAnswer = "yes" | "no" | "unsure";

export interface TaxReliefQuestion {
  id: string;
  section: string;
  question: string;
  help: string;
  itemIds: string[];
}

export interface QuestionnaireResult {
  item: TaxReliefItem;
  status: "possible-claim" | "check-details" | "exclude";
  reasons: string[];
}

export const taxReliefQuestions: TaxReliefQuestion[] = [
  {
    id: "turnover-expenses",
    section: "Business basics",
    question: "Do you earn self-employed income and pay business costs?",
    help: "This compares the £1,000 trading allowance with actual expenses. They cannot be claimed together for the same trade.",
    itemIds: ["trading-allowance"],
  },
  {
    id: "stock-office",
    section: "Business basics",
    question:
      "Do you buy stock, materials, stationery, postage, software or subscriptions for your business?",
    help: "Include small recurring costs and goods bought for resale, but not items taken for personal use.",
    itemIds: ["stock-materials", "office-software"],
  },
  {
    id: "phone-internet",
    section: "Business basics",
    question:
      "Do you use a phone, mobile or internet connection for your business?",
    help: "A shared household contract needs a reasonable, evidenced business-use split.",
    itemIds: ["phone-internet"],
  },
  {
    id: "before-trading",
    section: "Business basics",
    question:
      "Do you have business costs from before you started trading that you have not claimed?",
    help: "Qualifying revenue costs from up to seven years before trading can sometimes be claimed.",
    itemIds: ["pretrading-costs"],
  },
  {
    id: "home-working",
    section: "Home and premises",
    question: "Do you regularly work from home?",
    help: "HMRC simplified expenses or a supportable share of actual household costs may apply. Exclusive business use of a room can have Capital Gains Tax implications.",
    itemIds: ["working-home"],
  },
  {
    id: "separate-premises",
    section: "Home and premises",
    question:
      "Do you rent, own or run premises away from your home for the business?",
    help: "Rent, rates and running costs can qualify. Buying or improving the property is not an ordinary expense.",
    itemIds: ["business-premises", "repairs-renewals", "equipment-assets"],
  },
  {
    id: "live-at-premises",
    section: "Home and premises",
    question:
      "Do you live at premises that you also use for the business, such as a guesthouse or care home?",
    help: "Private living costs must be removed; HMRC flat rates may be available for qualifying businesses.",
    itemIds: ["living-business-premises"],
  },
  {
    id: "domestic-appliances",
    section: "Home and premises",
    question:
      "Do you use a washing machine or another household appliance for both business and personal purposes?",
    help: "An ordinary household appliance is private by default. Only a genuine trade use may qualify, with private use excluded; cleaning qualifying uniforms or protective clothing is considered separately.",
    itemIds: [
      "equipment-assets",
      "repairs-renewals",
      "work-clothing",
      "personal-costs",
    ],
  },
  {
    id: "vehicle",
    section: "Travel and vehicles",
    question:
      "Do you use a car, van, motorcycle or bicycle for business journeys?",
    help: "Compare simplified mileage with actual running costs where eligible. Do not claim both methods for the same vehicle.",
    itemIds: ["vehicle-mileage", "vehicle-actual", "equipment-assets"],
  },
  {
    id: "travel",
    section: "Travel and vehicles",
    question:
      "Do you travel to customers, suppliers, temporary workplaces, training or overnight jobs?",
    help: "Tickets, accommodation and qualifying subsistence may apply. Ordinary commuting does not.",
    itemIds: ["business-travel", "food-subsistence", "personal-costs"],
  },
  {
    id: "staff-contractors",
    section: "People",
    question:
      "Do you pay employees, agency workers, freelancers or subcontractors?",
    help: "Employment status, PAYE, workplace pension and CIS duties may apply.",
    itemIds: ["staff-subcontractors", "staff-benefits-training"],
  },
  {
    id: "marketing",
    section: "Sales and customers",
    question:
      "Do you advertise your business or pay for a website, sponsorship, samples or promotional gifts?",
    help: "Commercial advertising and genuine samples can qualify; most gifts need closer review.",
    itemIds: ["marketing", "sponsorship-gifts-samples"],
  },
  {
    id: "client-entertaining",
    section: "Sales and customers",
    question:
      "Do you provide meals, hospitality or entertainment for clients, suppliers or business contacts?",
    help: "Client entertainment is normally disallowed even when there was a business purpose.",
    itemIds: ["entertaining"],
  },
  {
    id: "unpaid-sales",
    section: "Sales and customers",
    question:
      "Do you have a customer invoice that you are no longer able to collect?",
    help: "A bad-debt deduction generally matters only where the sale was already recognised under traditional accounting.",
    itemIds: ["bad-debts"],
  },
  {
    id: "insurance-finance",
    section: "Finance and advice",
    question:
      "Do you pay business insurance, bank fees, card charges, interest, leasing or hire-purchase costs?",
    help: "Private borrowing and repayment of loan capital are excluded; financed assets may need separate treatment.",
    itemIds: ["insurance-finance", "hire-purchase-leasing"],
  },
  {
    id: "professional-fees",
    section: "Finance and advice",
    question:
      "Do you pay an accountant, solicitor, bookkeeper, consultant or trade body for business support?",
    help: "Fees must relate to the trade. Some legal costs, fines and political or social memberships are excluded.",
    itemIds: ["professional-fees", "trade-memberships"],
  },
  {
    id: "equipment",
    section: "Equipment and skills",
    question:
      "Do you buy, repair, replace, lease or finance tools, computers, machinery, furniture or other equipment?",
    help: "The accounting basis, asset type, private use and whether work was a repair or improvement determine treatment.",
    itemIds: ["equipment-assets", "repairs-renewals", "hire-purchase-leasing"],
  },
  {
    id: "training",
    section: "Equipment and skills",
    question:
      "Do you pay for courses, qualifications or professional development related to your current business?",
    help: "Training for the existing trade can qualify; learning a new unrelated trade normally cannot.",
    itemIds: ["training"],
  },
  {
    id: "clothing-laundry",
    section: "Equipment and skills",
    question:
      "Do you buy, repair or clean uniforms, protective clothing, costumes or specialist workwear?",
    help: "Qualifying workwear and its reasonable laundry costs may be claimable. Ordinary clothing remains private even if worn only for work.",
    itemIds: ["work-clothing"],
  },
  {
    id: "vat",
    section: "Tax already paid and reliefs",
    question:
      "Are you VAT registered, or do you have purchase VAT that may be recoverable?",
    help: "Input VAT needs a valid invoice and cannot also be deducted as an Income Tax cost when recovered.",
    itemIds: ["vat-input-tax"],
  },
  {
    id: "cis",
    section: "Tax already paid and reliefs",
    question: "Do contractors deduct CIS tax before paying you?",
    help: "Record gross sales and claim supported CIS deductions as tax already paid, not as an expense.",
    itemIds: ["cis-deductions"],
  },
  {
    id: "pension-charity",
    section: "Tax already paid and reliefs",
    question:
      "Do you make personal pension contributions or Gift Aid donations?",
    help: "These are personal tax reliefs rather than business expenses and can affect higher-rate tax.",
    itemIds: ["pension-gift-aid"],
  },
  {
    id: "personal-allowances",
    section: "Tax already paid and reliefs",
    question: "Are you married, in a civil partnership or registered as blind?",
    help: "Marriage Allowance depends on both partners' circumstances; Blind Person's Allowance has specific registration rules.",
    itemIds: ["marriage-blind-allowances"],
  },
  {
    id: "losses",
    section: "Tax already paid and reliefs",
    question:
      "Is your business making a loss, or does it have unused losses from an earlier tax year?",
    help: "Losses may be carried forward or claimed in another way depending on timing and circumstances.",
    itemIds: ["trading-losses"],
  },
  {
    id: "employment",
    section: "Other income and earlier years",
    question:
      "Do you also have a PAYE job with required costs that your employer does not reimburse?",
    help: "Employee expense rules are stricter and must be kept separate from sole-trader costs.",
    itemIds: ["employee-job-expenses"],
  },
  {
    id: "property-income",
    section: "Other income and earlier years",
    question: "Do you receive income from renting out land or property?",
    help: "The property allowance is separate from the trading allowance and has important exclusions.",
    itemIds: ["property-allowance"],
  },
  {
    id: "savings-dividends",
    section: "Other income and earlier years",
    question: "Do you receive savings interest or dividends?",
    help: "These have separate allowances and rates and are not sole-trader turnover.",
    itemIds: ["savings-dividend-allowances"],
  },
  {
    id: "investments",
    section: "Other income and earlier years",
    question:
      "Do you have capital losses or investments through EIS, SEIS or VCT?",
    help: "Specialist relief and certificate rules apply; these amounts are not business expenses.",
    itemIds: ["investment-capital-reliefs"],
  },
  {
    id: "missed-claims",
    section: "Other income and earlier years",
    question:
      "Have you found an expense, allowance or relief missing from an earlier tax return?",
    help: "Amendment and overpayment-relief deadlines may allow a supported correction.",
    itemIds: ["amend-refund"],
  },
  {
    id: "private-spending",
    section: "Final checks",
    question:
      "Do any of your recorded costs include personal use, drawings, commuting, tax, fines or penalties?",
    help: "Private portions must be removed using a fair method. Drawings and personal taxes are not business expenses.",
    itemIds: ["personal-costs"],
  },
];

export function evaluateTaxReliefQuestionnaire(
  answers: Record<string, QuestionnaireAnswer>,
  items = taxReliefItems,
): QuestionnaireResult[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const matches = new Map<string, QuestionnaireResult>();

  for (const question of taxReliefQuestions) {
    const answer = answers[question.id];
    if (!answer || answer === "no") continue;

    for (const itemId of question.itemIds) {
      const item = itemById.get(itemId);
      if (!item) continue;
      const status =
        answer === "unsure"
          ? "check-details"
          : item.treatment === "not-allowable"
            ? "exclude"
            : "possible-claim";
      const existing = matches.get(itemId);
      if (existing) {
        existing.reasons.push(question.question);
        if (existing.status === "check-details" && status !== "check-details") {
          existing.status = status;
        }
      } else {
        matches.set(itemId, {
          item,
          status,
          reasons: [question.question],
        });
      }
    }
  }

  const order = { "possible-claim": 0, "check-details": 1, exclude: 2 };
  return [...matches.values()].sort(
    (left, right) =>
      order[left.status] - order[right.status] ||
      left.item.title.localeCompare(right.item.title),
  );
}

export function questionnaireCoverage(items = taxReliefItems) {
  const coveredIds = new Set(
    taxReliefQuestions.flatMap((question) => question.itemIds),
  );
  return items.filter((item) => !coveredIds.has(item.id));
}

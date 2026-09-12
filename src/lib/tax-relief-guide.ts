export type ReliefTreatment =
  "expense" | "capital" | "tax-relief" | "restricted" | "not-allowable";

export type ReliefCircumstance =
  | "home"
  | "live-in"
  | "vehicle"
  | "travel"
  | "staff"
  | "employed"
  | "premises"
  | "property"
  | "stock"
  | "equipment"
  | "finance";

export type HmrcSourceId =
  | "expenses"
  | "simplified"
  | "trading-allowance"
  | "cash-basis"
  | "capital-allowances"
  | "records"
  | "employee-expenses"
  | "amendments"
  | "pension-relief"
  | "gift-aid"
  | "marriage-allowance"
  | "blind-allowance"
  | "losses"
  | "cis"
  | "savings"
  | "dividends"
  | "investment-reliefs"
  | "vat-recovery";

export interface HmrcGuideSource {
  id: HmrcSourceId;
  title: string;
  url: string;
}

export interface TaxReliefItem {
  id: string;
  title: string;
  summary: string;
  treatment: ReliefTreatment;
  group: string;
  category?: string;
  circumstances: ReliefCircumstance[];
  conditions: string[];
  records: string[];
  action?: { label: string; to: string };
  basisActions?: Partial<
    Record<"cash" | "accrual", { label: string; to: string }>
  >;
  keywords: string[];
  sourceIds?: HmrcSourceId[];
  oftenMissed?: boolean;
  basisNotes?: Partial<Record<"cash" | "accrual", string>>;
}

export const hmrcGuideSources: HmrcGuideSource[] = [
  {
    id: "expenses",
    title: "Self-employed expenses",
    url: "https://www.gov.uk/expenses-if-youre-self-employed",
  },
  {
    id: "simplified",
    title: "Simplified expenses",
    url: "https://www.gov.uk/simpler-income-tax-simplified-expenses",
  },
  {
    id: "trading-allowance",
    title: "Trading and property allowances",
    url: "https://www.gov.uk/guidance/tax-free-allowances-on-property-and-trading-income",
  },
  {
    id: "cash-basis",
    title: "Cash-basis income and expenses",
    url: "https://www.gov.uk/simpler-income-tax-cash-basis/income-and-expenses-under-cash-basis",
  },
  {
    id: "capital-allowances",
    title: "Capital allowances",
    url: "https://www.gov.uk/capital-allowances",
  },
  {
    id: "records",
    title: "Business records and retention",
    url: "https://www.gov.uk/self-employed-records/how-long-to-keep-your-records",
  },
  {
    id: "employee-expenses",
    title: "Employee job-expense relief",
    url: "https://www.gov.uk/tax-relief-for-employees",
  },
  {
    id: "amendments",
    title: "Correcting a Self Assessment return",
    url: "https://www.gov.uk/self-assessment-tax-returns/corrections",
  },
  {
    id: "pension-relief",
    title: "Pension tax relief",
    url: "https://www.gov.uk/tax-on-your-private-pension/pension-tax-relief",
  },
  {
    id: "gift-aid",
    title: "Gift Aid",
    url: "https://www.gov.uk/donating-to-charity/gift-aid",
  },
  {
    id: "marriage-allowance",
    title: "Marriage Allowance",
    url: "https://www.gov.uk/marriage-allowance",
  },
  {
    id: "blind-allowance",
    title: "Blind Person's Allowance",
    url: "https://www.gov.uk/blind-persons-allowance",
  },
  {
    id: "losses",
    title: "Self Assessment losses helpsheet",
    url: "https://www.gov.uk/government/publications/losses-hs227-self-assessment-helpsheet",
  },
  {
    id: "cis",
    title: "Claiming back CIS deductions",
    url: "https://www.gov.uk/what-you-must-do-as-a-cis-subcontractor/pay-tax-and-claim-back-deductions",
  },
  {
    id: "savings",
    title: "Tax on savings interest",
    url: "https://www.gov.uk/apply-tax-free-interest-on-savings",
  },
  {
    id: "dividends",
    title: "Tax on dividends",
    url: "https://www.gov.uk/tax-on-dividends",
  },
  {
    id: "investment-reliefs",
    title: "Venture capital scheme reliefs",
    url: "https://www.gov.uk/guidance/venture-capital-schemes-tax-relief-for-investors",
  },
  {
    id: "vat-recovery",
    title: "Reclaiming VAT",
    url: "https://www.gov.uk/reclaim-vat",
  },
];

const defaultSourceIdsByGroup: Record<string, HmrcSourceId[]> = {
  "Premises and home working": ["expenses", "simplified"],
  "Travel and vehicles": ["expenses", "simplified"],
  "Assets and special claims": ["expenses", "capital-allowances"],
  "Other income and claims": ["trading-allowance"],
};

export function sourcesForTaxReliefItem(item: TaxReliefItem) {
  const ids = item.sourceIds ??
    defaultSourceIdsByGroup[item.group] ?? ["expenses"];
  return ids.map((id) => hmrcGuideSources.find((source) => source.id === id)!);
}

export function compareTradingAllowance(income: number, expenses: number) {
  const grossIncome = Math.max(0, income);
  const actualExpenses = Math.max(0, expenses);
  const tradingAllowance = Math.min(1000, grossIncome);
  const preferred =
    actualExpenses > tradingAllowance
      ? "expenses"
      : tradingAllowance > actualExpenses
        ? "allowance"
        : "equal";
  return {
    grossIncome,
    actualExpenses,
    tradingAllowance,
    preferred,
    deductionDifference: Number(
      Math.abs(actualExpenses - tradingAllowance).toFixed(2),
    ),
  } as const;
}

export const reliefTreatmentLabels: Record<ReliefTreatment, string> = {
  expense: "Business expense",
  capital: "Capital allowance",
  "tax-relief": "Personal tax relief",
  restricted: "Claim with restrictions",
  "not-allowable": "Not normally allowable",
};

export const taxReliefItems: TaxReliefItem[] = [
  {
    id: "trading-allowance",
    title: "£1,000 trading allowance",
    summary:
      "Deduct up to £1,000 from gross trading income instead of claiming actual expenses and capital allowances.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["finance"],
    conditions: [
      "Compare it with total allowable expenses: you cannot claim both for the same trade and tax year.",
      "The deduction cannot exceed gross trading income, so it cannot create a loss.",
      "It does not apply to partnership income or certain income from an employer or a connected company or partnership.",
      "Income of £1,000 or less may not need reporting, but exceptions apply for loss claims, voluntary Class 2 NI and certain benefits.",
    ],
    records: [
      "Complete income records",
      "Connected-party eligibility check",
      "Comparison with actual expenses and allowances",
    ],
    action: { label: "Review recorded expenses", to: "/expenses" },
    keywords: [
      "1000",
      "£1,000",
      "trading allowance",
      "side hustle",
      "casual income",
    ],
    sourceIds: ["trading-allowance"],
    oftenMissed: true,
  },
  {
    id: "stock-materials",
    title: "Stock, materials and goods for resale",
    summary: "Raw materials, components and goods bought to sell to customers.",
    treatment: "expense",
    group: "Purchases and stock",
    category: "Materials & Supplies",
    circumstances: ["stock"],
    conditions: [
      "The purchase must be for the trade, not goods taken for personal use.",
      "Under traditional accounting, year-end stock is handled through the stock adjustment rather than claimed twice.",
    ],
    records: [
      "Supplier invoice or receipt",
      "Stock records where relevant",
      "Business-use adjustment for goods taken personally",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: ["materials", "stock", "resale", "components", "goods"],
    basisNotes: {
      cash: "Claim qualifying stock and materials when paid.",
      accrual:
        "Adjust for closing stock so goods still held are not deducted twice.",
    },
  },
  {
    id: "office-software",
    title: "Office costs, software and subscriptions",
    summary:
      "Stationery, postage, printing, bookkeeping software and business subscriptions.",
    treatment: "expense",
    group: "Office and administration",
    category: "Office & Stationery or Software & Subscriptions",
    circumstances: [],
    conditions: [
      "Claim only the business portion of mixed-use services or subscriptions.",
    ],
    records: [
      "Receipt or supplier invoice",
      "Subscription period",
      "Business-use calculation if shared",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "stationery",
      "postage",
      "printer",
      "software",
      "subscription",
      "cloud",
    ],
  },
  {
    id: "phone-internet",
    title: "Phone, mobile and internet",
    summary:
      "Business calls, data and the business share of a mixed-use contract.",
    treatment: "restricted",
    group: "Office and administration",
    category: "Phone & Internet",
    circumstances: ["home"],
    conditions: [
      "A dedicated business service can normally be claimed in full.",
      "For a shared personal contract, claim only identifiable business use; the original private cost is not allowable.",
    ],
    records: [
      "Bills",
      "Business-use percentage and how it was calculated",
      "Itemised call evidence where used",
    ],
    action: { label: "Record mixed use", to: "/expenses?new=expense" },
    keywords: ["phone", "mobile", "broadband", "internet", "data"],
    oftenMissed: true,
  },
  {
    id: "working-home",
    title: "Working from home",
    summary:
      "Use HMRC simplified expenses or a reasonable business share of actual household costs.",
    treatment: "restricted",
    group: "Premises and home working",
    category: "Home Office",
    circumstances: ["home"],
    conditions: [
      "Simplified expenses use hours worked at home each month and do not include phone or internet costs.",
      "An actual-cost claim needs a reasonable method based on rooms, time and business use.",
      "Do not record the same cost as an expense and also claim it through the tax calculator.",
    ],
    records: [
      "Monthly hours or cost calculation",
      "Household bills for actual costs",
      "Basis used to split business and private use",
    ],
    action: { label: "Set home-office method", to: "/tax" },
    keywords: [
      "home",
      "rent",
      "heating",
      "electricity",
      "council tax",
      "mortgage interest",
    ],
    sourceIds: ["simplified", "expenses"],
    oftenMissed: true,
  },
  {
    id: "business-premises",
    title: "Business premises",
    summary:
      "Rent, business rates, utilities, security and repairs for business premises.",
    treatment: "expense",
    group: "Premises and home working",
    circumstances: ["premises"],
    conditions: [
      "Repairs and maintenance can be allowable, but buying or substantially improving premises is capital expenditure.",
      "The cost of buying premises is not an ordinary business expense.",
    ],
    records: [
      "Lease and bills",
      "Repair invoices",
      "Evidence separating repairs from improvements",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: ["rent", "rates", "utilities", "security", "repair", "premises"],
  },
  {
    id: "living-business-premises",
    title: "Living at business premises",
    summary:
      "Guesthouses, B&Bs and similar businesses may use flat rates to remove private living costs from total premises costs.",
    treatment: "restricted",
    group: "Premises and home working",
    circumstances: ["live-in", "premises"],
    conditions: [
      "Start with total premises expenses, then subtract the private-use flat rate for each month; this is not an extra deduction.",
      "Current monthly private-use deductions are £350 for one occupant, £500 for two and £650 for three or more.",
      "Compare simplified expenses with an actual private/business split.",
    ],
    records: [
      "Total premises bills",
      "Number of occupants by month",
      "Chosen method and annual comparison",
    ],
    action: { label: "Record premises costs", to: "/expenses?new=expense" },
    keywords: [
      "guesthouse",
      "bed and breakfast",
      "b&b",
      "care home",
      "live at work",
      "occupants",
    ],
    sourceIds: ["simplified"],
    oftenMissed: true,
  },
  {
    id: "business-travel",
    title: "Business travel and accommodation",
    summary:
      "Public transport, hotels, parking and similar costs for necessary business journeys.",
    treatment: "restricted",
    group: "Travel and vehicles",
    category: "Travel (non-vehicle)",
    circumstances: ["travel"],
    conditions: [
      "Travel must be for business, such as visiting a customer or temporary workplace.",
      "Ordinary travel between home and a permanent workplace is not allowable.",
      "Fines and penalties are not allowable even when incurred during business travel.",
    ],
    records: [
      "Tickets and receipts",
      "Date, destination and business purpose",
      "Private-use split for mixed trips",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "train",
      "flight",
      "hotel",
      "parking",
      "taxi",
      "travel",
      "accommodation",
    ],
  },
  {
    id: "food-subsistence",
    title: "Food and subsistence while travelling",
    summary:
      "Reasonable meals can qualify on certain necessary business journeys or where the trade is itinerant.",
    treatment: "restricted",
    group: "Travel and vehicles",
    category: "Food & Drink (site/travel)",
    circumstances: ["travel"],
    conditions: [
      "Everyday meals are personal costs; working away from the normal pattern of work does not automatically make them allowable.",
      "The journey must itself be allowable and the food cost must be reasonable and connected with that journey.",
      "Client entertaining is not converted into subsistence by discussing business over the meal.",
    ],
    records: [
      "Itemised receipt",
      "Journey and business purpose",
      "People present and reason for the meal",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "food",
      "drink",
      "meal",
      "lunch",
      "subsistence",
      "site",
      "overnight",
    ],
  },
  {
    id: "vehicle-mileage",
    title: "Vehicle simplified mileage",
    summary:
      "Claim HMRC mileage rates for eligible business journeys instead of actual running costs.",
    treatment: "restricted",
    group: "Travel and vehicles",
    circumstances: ["vehicle"],
    conditions: [
      "Use a contemporaneous mileage log showing the business purpose.",
      "Do not also claim fuel, insurance, repairs or other running costs for the same vehicle.",
      "Commuting and private journeys are excluded; method-switching restrictions can apply.",
    ],
    records: [
      "Journey date",
      "Start, destination and purpose",
      "Business miles and vehicle used",
    ],
    action: { label: "Log business mileage", to: "/vehicles?new=mileage" },
    keywords: ["car", "van", "motorcycle", "bike", "mileage", "fuel"],
    sourceIds: ["simplified"],
    oftenMissed: true,
  },
  {
    id: "vehicle-actual",
    title: "Actual vehicle running costs",
    summary:
      "Business share of fuel, insurance, repairs, servicing and vehicle tax.",
    treatment: "restricted",
    group: "Travel and vehicles",
    circumstances: ["vehicle"],
    conditions: [
      "Use this only when the vehicle is on the actual-cost method.",
      "Apply a supportable business-use percentage and do not also use simplified mileage.",
      "Buying the vehicle is handled separately, commonly through capital allowances where eligible.",
    ],
    records: [
      "Cost receipts",
      "Mileage or other business-use evidence",
      "Vehicle details and method election",
    ],
    action: { label: "Review vehicle method", to: "/vehicles" },
    keywords: [
      "fuel",
      "insurance",
      "mot",
      "servicing",
      "repair",
      "vehicle tax",
      "car",
    ],
  },
  {
    id: "staff-subcontractors",
    title: "Staff and subcontractor costs",
    summary:
      "Wages, employer costs, agency fees and genuine subcontractor charges.",
    treatment: "expense",
    group: "People",
    category: "Subcontractors",
    circumstances: ["staff"],
    conditions: [
      "Payments must be wholly for the business and comply with PAYE, pension and CIS duties where applicable.",
      "Money taken by the owner is drawings, not wages or a business expense.",
    ],
    records: [
      "Payroll records or invoices",
      "Employment-status decision",
      "CIS statements and deductions where applicable",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "wage",
      "salary",
      "employee",
      "freelancer",
      "contractor",
      "subcontractor",
      "cis",
    ],
  },
  {
    id: "staff-benefits-training",
    title: "Employer costs, staff training and welfare",
    summary:
      "Employer National Insurance, workplace pensions, employee training and qualifying staff costs can be business expenses.",
    treatment: "restricted",
    group: "People",
    circumstances: ["staff"],
    conditions: [
      "Meet PAYE, pension and benefit-reporting duties for genuine employee costs.",
      "Staff entertaining differs from disallowed client entertaining, but benefit and annual-event rules can apply.",
      "Your own drawings, pension and personal food are not staff expenses.",
    ],
    records: [
      "Payroll and pension reports",
      "Training invoices and relevance",
      "Attendee list and purpose for staff events",
    ],
    action: { label: "Record staff costs", to: "/expenses?new=expense" },
    keywords: [
      "employer ni",
      "workplace pension",
      "staff party",
      "employee training",
      "payroll",
    ],
    oftenMissed: true,
  },
  {
    id: "insurance-finance",
    title: "Insurance, bank charges and finance costs",
    summary:
      "Business insurance, bank fees, card charges and qualifying interest or finance charges.",
    treatment: "restricted",
    group: "Finance and professional services",
    category: "Insurance or Bank Charges",
    circumstances: ["finance"],
    conditions: [
      "Claim only the business element of mixed borrowing or accounts.",
      "Loan capital repayments are not expenses, and finance-cost restrictions can apply.",
      "Tax penalties, fines and interest on late tax are not normally allowable.",
    ],
    records: [
      "Policy or bank statement",
      "Loan agreement",
      "Interest and capital repayment breakdown",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "insurance",
      "bank",
      "interest",
      "loan",
      "overdraft",
      "card fee",
      "finance",
    ],
    oftenMissed: true,
  },
  {
    id: "hire-purchase-leasing",
    title: "Hire purchase, leasing and asset finance",
    summary:
      "Qualifying interest, finance charges and lease payments may be deductible even though repayment of borrowed capital is not.",
    treatment: "restricted",
    group: "Finance and professional services",
    category: "Bank Charges or the related cost category",
    circumstances: ["finance", "equipment"],
    conditions: [
      "Separate interest and charges from repayment of the amount borrowed.",
      "Ownership, accounting basis and asset type determine whether the asset cost is an expense or capital allowance.",
      "Apply the business-use proportion to mixed-use finance.",
    ],
    records: [
      "Finance agreement",
      "Capital and interest schedule",
      "Asset invoice and business-use calculation",
    ],
    action: { label: "Record finance costs", to: "/expenses?new=expense" },
    keywords: [
      "hire purchase",
      "lease",
      "leasing",
      "finance agreement",
      "interest",
      "asset finance",
    ],
    sourceIds: ["expenses", "cash-basis", "capital-allowances"],
    oftenMissed: true,
  },
  {
    id: "professional-fees",
    title: "Accountancy, legal and professional fees",
    summary:
      "Professional costs directly connected with running the existing business.",
    treatment: "restricted",
    group: "Finance and professional services",
    category: "Accountancy & Professional Fees",
    circumstances: [],
    conditions: [
      "Fees for normal accounts, bookkeeping and business advice are commonly allowable.",
      "Costs of buying assets, forming the business, personal matters, fines or defending criminal wrongdoing may not be allowable as ordinary expenses.",
    ],
    records: [
      "Engagement letter and invoice",
      "Description of the work",
      "Split between business, capital and personal advice",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "accountant",
      "solicitor",
      "legal",
      "professional",
      "consultant",
    ],
  },
  {
    id: "trade-memberships",
    title: "Trade memberships, licences and publications",
    summary:
      "Trade-body subscriptions, business licences and specialist publications needed for the existing trade.",
    treatment: "restricted",
    group: "Finance and professional services",
    category: "Accountancy & Professional Fees or Software & Subscriptions",
    circumstances: [],
    conditions: [
      "The organisation or publication must relate directly to the trade; private club subscriptions are not allowable.",
      "Political donations and many charitable payments are not ordinary business expenses.",
    ],
    records: [
      "Membership invoice",
      "Organisation and membership period",
      "Explanation of relevance to the trade",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "membership",
      "licence",
      "license",
      "trade body",
      "journal",
      "publication",
      "subscription",
    ],
  },
  {
    id: "marketing",
    title: "Advertising and marketing",
    summary:
      "Website, adverts, directories, mailshots and free samples used to promote the business.",
    treatment: "expense",
    group: "Sales and marketing",
    category: "Advertising & Marketing",
    circumstances: [],
    conditions: [
      "The cost must promote the trade rather than provide personal benefit.",
      "Customer gifts have specific conditions and limits; entertainment is treated separately.",
    ],
    records: [
      "Supplier invoice",
      "Campaign or business purpose",
      "Recipient and item details for gifts or samples",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: ["advert", "website", "marketing", "directory", "sample", "gift"],
  },
  {
    id: "sponsorship-gifts-samples",
    title: "Sponsorship, gifts and free samples",
    summary:
      "Commercial sponsorship and genuine samples can qualify, while most business gifts and charitable donations do not.",
    treatment: "restricted",
    group: "Sales and marketing",
    category: "Advertising & Marketing",
    circumstances: [],
    conditions: [
      "Keep evidence of the advertising or commercial benefit received for sponsorship.",
      "Free samples used to advertise the trade can qualify; most gifts to customers, suppliers or contacts cannot.",
      "Gift Aid and qualifying gifts of land or shares are personal reliefs, not marketing expenses.",
    ],
    records: [
      "Sponsorship agreement",
      "Recipient and item list",
      "Evidence of branding, promotion or sample campaign",
    ],
    action: { label: "Record eligible marketing", to: "/expenses?new=expense" },
    keywords: [
      "sponsor",
      "sponsorship",
      "gift",
      "free sample",
      "charity",
      "promotion",
    ],
  },
  {
    id: "training",
    title: "Training and professional development",
    summary:
      "Training that updates or develops skills used in the existing business.",
    treatment: "restricted",
    group: "Skills and clothing",
    category: "Training & CPD",
    circumstances: [],
    conditions: [
      "Training for the existing trade can be allowable, including related business or technology skills.",
      "Training undertaken to start a new, unrelated trade is not normally a current business expense.",
    ],
    records: [
      "Course invoice",
      "Syllabus or course description",
      "Note explaining relevance to the existing trade",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: ["course", "training", "cpd", "qualification", "skill"],
  },
  {
    id: "work-clothing",
    title: "Uniforms, protective and specialist clothing",
    summary: "Protective kit, uniforms and costumes required for the trade.",
    treatment: "restricted",
    group: "Skills and clothing",
    category: "Workwear & Clothing or PPE",
    circumstances: [],
    conditions: [
      "Protective clothing and recognisable uniforms can qualify.",
      "Ordinary clothing is not allowable just because it is bought or worn for work.",
    ],
    records: [
      "Receipt",
      "Description of protective purpose or uniform",
      "Business-use details",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "uniform",
      "ppe",
      "boots",
      "helmet",
      "overalls",
      "clothes",
      "costume",
    ],
  },
  {
    id: "equipment-assets",
    title: "Equipment, machinery and business vehicles",
    summary:
      "Long-life assets may need capital-allowance treatment instead of an ordinary expense.",
    treatment: "capital",
    group: "Assets and special claims",
    circumstances: ["equipment"],
    conditions: [
      "Under cash basis, most equipment kept for the business is claimed as a normal expense; business cars remain the main capital-allowance exception.",
      "Under traditional accounting, equipment, machinery and business vehicles are generally handled through capital allowances.",
      "Cars have separate rules and do not generally qualify for Annual Investment Allowance.",
      "Do not claim both the full purchase as an expense and capital allowances on the same cost.",
    ],
    records: [
      "Purchase invoice",
      "Date first used",
      "Business-use percentage",
      "Disposal proceeds and date when sold",
    ],
    action: { label: "Open capital allowances", to: "/tax?section=allowances" },
    basisActions: {
      cash: {
        label: "Record qualifying equipment",
        to: "/expenses?new=expense",
      },
      accrual: {
        label: "Open capital allowances",
        to: "/tax?section=allowances",
      },
    },
    keywords: [
      "equipment",
      "tools",
      "machine",
      "computer",
      "asset",
      "car",
      "aia",
      "allowance",
    ],
    sourceIds: ["capital-allowances", "cash-basis"],
    oftenMissed: true,
    basisNotes: {
      cash: "Claim most retained equipment as an expense; use capital allowances for qualifying business cars.",
      accrual:
        "Use capital allowances for qualifying equipment, machinery and business vehicles instead of accounting depreciation.",
    },
  },
  {
    id: "repairs-renewals",
    title: "Repairs, maintenance and small replacements",
    summary:
      "Costs that restore business property or equipment without creating a new or improved asset.",
    treatment: "restricted",
    group: "Assets and special claims",
    circumstances: ["equipment", "premises"],
    conditions: [
      "A repair generally restores the existing asset; an improvement or complete replacement may be capital.",
      "Private-use and non-business elements must be excluded.",
      "Depreciation in the accounts is not itself tax deductible; capital allowances may apply instead.",
    ],
    records: [
      "Invoice describing the work",
      "Condition before and after",
      "Allocation between repair and improvement where mixed",
    ],
    action: { label: "Record an expense", to: "/expenses?new=expense" },
    keywords: [
      "repair",
      "maintenance",
      "replacement",
      "renewal",
      "improvement",
      "depreciation",
    ],
  },
  {
    id: "bad-debts",
    title: "Bad debts from customers",
    summary:
      "A genuine trade debt may be deductible when it was previously recognised as income and is now irrecoverable.",
    treatment: "restricted",
    group: "Assets and special claims",
    circumstances: ["finance"],
    conditions: [
      "This normally matters under traditional accounting; unpaid sales are not income under the cash basis.",
      "The debt must be genuinely irrecoverable, not merely overdue or informally waived.",
      "Loans and non-trading debts follow different rules.",
    ],
    records: [
      "Original invoice",
      "Collection attempts and correspondence",
      "Date and reason for writing the balance off",
    ],
    action: { label: "Review unpaid invoices", to: "/invoices" },
    keywords: [
      "bad debt",
      "unpaid",
      "irrecoverable",
      "customer",
      "write off",
      "invoice",
    ],
    sourceIds: ["expenses", "cash-basis"],
    basisNotes: {
      cash: "No separate deduction: unpaid customer income was never recognised.",
      accrual:
        "A specific debt included in turnover may be deducted when genuinely irrecoverable.",
    },
  },
  {
    id: "pretrading-costs",
    title: "Costs before the business started",
    summary:
      "Certain qualifying costs from before trading began may be treated as incurred on the first day of trade.",
    treatment: "restricted",
    group: "Assets and special claims",
    circumstances: [],
    conditions: [
      "A qualifying revenue cost incurred within 7 years before trading starts is generally treated as incurred on the first day of trade.",
      "Stock, capital assets and formation costs can require different treatment.",
    ],
    records: [
      "Original receipt and payment date",
      "Business start date",
      "Explanation of how the cost relates to the trade",
    ],
    action: { label: "Record with evidence", to: "/expenses?new=expense" },
    keywords: [
      "startup",
      "start-up",
      "before trading",
      "pre-trading",
      "formation",
    ],
    oftenMissed: true,
  },
  {
    id: "vat-input-tax",
    title: "Recoverable VAT on purchases",
    summary:
      "VAT-registered businesses may recover eligible input VAT separately from the Income Tax expense deduction.",
    treatment: "restricted",
    group: "Assets and special claims",
    circumstances: ["finance"],
    conditions: [
      "Use a valid VAT invoice and apply business-use, partial-exemption and scheme rules.",
      "Do not deduct VAT twice: recoverable VAT is excluded from the Income Tax expense amount in normal VAT accounting.",
      "Flat Rate Scheme businesses usually cannot reclaim purchase VAT except for certain capital assets.",
    ],
    records: [
      "Valid VAT invoice",
      "Business-use calculation",
      "VAT period and recovery decision",
    ],
    action: { label: "Review VAT", to: "/vat" },
    keywords: [
      "vat",
      "input tax",
      "reclaim",
      "flat rate",
      "purchase vat",
      "vat invoice",
    ],
    sourceIds: ["vat-recovery"],
    oftenMissed: true,
  },
  {
    id: "pension-gift-aid",
    title: "Pension contributions and Gift Aid",
    summary:
      "These can affect personal tax but are not ordinary sole-trader business expenses.",
    treatment: "tax-relief",
    group: "Personal tax reliefs",
    circumstances: ["finance"],
    conditions: [
      "Enter eligible personal contributions and donations in the tax calculator, not the expense ledger.",
      "For relief-at-source pensions, enter the gross contribution including basic-rate relief; higher or additional-rate relief may need to be claimed.",
      "Gift Aid can extend tax bands for higher-rate relief, but you must have paid enough Income Tax or Capital Gains Tax to cover the charity's reclaim.",
      "A qualifying Gift Aid donation made before filing may sometimes be carried back to the previous return if claimed on time.",
    ],
    records: [
      "Pension annual statement",
      "Gift Aid donation record",
      "Tax-relief-at-source details",
    ],
    action: { label: "Enter tax reliefs", to: "/tax" },
    keywords: ["pension", "gift aid", "charity", "donation", "relief"],
    sourceIds: ["pension-relief", "gift-aid"],
    oftenMissed: true,
  },
  {
    id: "marriage-blind-allowances",
    title: "Marriage Allowance and Blind Person's Allowance",
    summary:
      "Personal allowances that can reduce tax when their specific eligibility conditions are met.",
    treatment: "tax-relief",
    group: "Personal tax reliefs",
    circumstances: [],
    conditions: [
      "Marriage Allowance depends on both partners' income, tax status and an eligible marriage or civil partnership.",
      "Blind Person's Allowance requires qualifying registration or the relevant Scottish or Northern Irish condition.",
      "Marriage Allowance claims can normally be backdated for up to 4 eligible tax years.",
      "These are personal claims, not entries in the business expense ledger.",
    ],
    records: [
      "HMRC claim or confirmation",
      "Partner details where relevant",
      "Registration evidence for Blind Person's Allowance",
    ],
    action: { label: "Enter personal allowances", to: "/tax" },
    keywords: [
      "marriage",
      "spouse",
      "civil partner",
      "blind",
      "allowance",
      "personal",
    ],
    sourceIds: ["marriage-allowance", "blind-allowance"],
    oftenMissed: true,
  },
  {
    id: "trading-losses",
    title: "Trading loss relief",
    summary:
      "A tax loss may be carried forward or, in eligible cases, claimed against other income or an earlier year.",
    treatment: "tax-relief",
    group: "Personal tax reliefs",
    circumstances: ["finance"],
    conditions: [
      "The available claims depend on timing, accounting basis, other income and whether the trade is new, continuing or ceased.",
      "Using a loss now can reduce relief available later, and claim deadlines apply.",
      "This is not a new expense: it is the tax treatment of a properly calculated trading loss.",
    ],
    records: [
      "Loss calculation",
      "Prior returns and loss claims",
      "Basis and year against which relief is claimed",
    ],
    action: { label: "Review HMRC declarations", to: "/hmrc-handoff" },
    keywords: [
      "loss",
      "carry forward",
      "carry back",
      "other income",
      "terminal loss",
      "relief",
    ],
    sourceIds: ["losses"],
    oftenMissed: true,
  },
  {
    id: "cis-deductions",
    title: "CIS tax already deducted",
    summary:
      "Contractor deductions are tax paid towards your bill, not an expense and not a reduction of sales income.",
    treatment: "tax-relief",
    group: "Personal tax reliefs",
    circumstances: ["staff", "finance"],
    conditions: [
      "Record gross income before the CIS deduction and record the deduction separately as tax already paid.",
      "Match deductions to contractor statements and resolve differences before filing.",
    ],
    records: [
      "Monthly CIS payment and deduction statements",
      "Related invoices or self-billed statements",
      "Amounts received into the bank",
    ],
    action: { label: "Review CIS records", to: "/tax" },
    keywords: [
      "cis",
      "contractor",
      "deduction",
      "tax paid",
      "statement",
      "construction",
    ],
    sourceIds: ["cis"],
    oftenMissed: true,
  },
  {
    id: "employee-job-expenses",
    title: "Job expenses from separate employment",
    summary:
      "If you also have employment, unreimbursed costs required wholly, exclusively and necessarily for that job may qualify.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["employed"],
    conditions: [
      "Keep employment expenses separate from sole-trader costs and exclude anything reimbursed by the employer.",
      "Employee tests are stricter than self-employed rules and relief cannot exceed tax paid for the year.",
      "If completing Self Assessment, claim eligible job expenses through the return.",
    ],
    records: [
      "Receipts",
      "Employer reimbursement policy",
      "Reason the cost was required for the job",
    ],
    keywords: [
      "employment",
      "employee",
      "job expense",
      "paye",
      "uniform",
      "reimbursement",
    ],
    sourceIds: ["employee-expenses"],
    oftenMissed: true,
  },
  {
    id: "property-allowance",
    title: "£1,000 property allowance",
    summary:
      "Individuals with property income may use up to £1,000 instead of actual property expenses, subject to exclusions.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["property"],
    conditions: [
      "Compare it with actual property expenses; the allowance cannot create a property loss.",
      "It cannot be combined with actual expenses for another property business or certain residential finance-cost and Rent a Room claims.",
      "Connected-company, partnership and employer income exclusions apply.",
    ],
    records: [
      "Gross property income",
      "Actual property expenses",
      "Eligibility and connected-party check",
    ],
    action: { label: "Review other income", to: "/tax" },
    keywords: [
      "property",
      "rental",
      "landlord",
      "£1,000",
      "property allowance",
      "rent",
    ],
    sourceIds: ["trading-allowance"],
    oftenMissed: true,
  },
  {
    id: "savings-dividend-allowances",
    title: "Savings and dividend allowances",
    summary:
      "Interest and dividends have separate allowances and rates; they are income, not business turnover.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["finance"],
    conditions: [
      "Record total taxable interest and dividends so the selected tax year's configured rules can be applied.",
      "Allowance amounts and eligibility depend on the tax year and income band.",
      "Low non-savings income may also qualify for the starting rate for savings; SoleTrader does not currently calculate that relief.",
      "Company dividends are not sole-trader drawings or sales income.",
    ],
    records: [
      "Bank interest statements",
      "Dividend vouchers",
      "Foreign income and tax details where relevant",
    ],
    action: { label: "Enter other income", to: "/tax" },
    keywords: [
      "interest",
      "savings",
      "dividend",
      "allowance",
      "bank interest",
      "shares",
    ],
    sourceIds: ["savings", "dividends"],
    oftenMissed: true,
  },
  {
    id: "investment-capital-reliefs",
    title: "Capital losses and investment reliefs",
    summary:
      "Capital losses and schemes such as EIS, SEIS or VCT can reduce tax but are not trading expenses.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["finance"],
    conditions: [
      "Do not enter investment subscriptions, disposals or capital losses as business expenses unless they genuinely belong to the trade.",
      "Relief conditions, holding periods, certificates, loss use and claim deadlines are scheme-specific.",
      "SoleTrader does not calculate these claims; obtain specialist review for material amounts.",
    ],
    records: [
      "Investment certificates",
      "Purchase and disposal contracts",
      "Gain or loss calculation",
      "Prior claims",
    ],
    keywords: [
      "eis",
      "seis",
      "vct",
      "capital loss",
      "shares",
      "investment",
      "certificate",
    ],
    sourceIds: ["investment-reliefs"],
    oftenMissed: true,
  },
  {
    id: "amend-refund",
    title: "Amend a return or claim overpayment relief",
    summary:
      "A missed expense or relief may still be recoverable after filing if the relevant deadline is open.",
    treatment: "tax-relief",
    group: "Other income and claims",
    circumstances: ["finance"],
    conditions: [
      "A Self Assessment return can normally be amended within 12 months of its filing deadline.",
      "After that, overpayment relief may be available up to 4 years after the end of the tax year, with a written claim and declaration.",
      "Keep evidence and consider effects on payments on account, losses and later returns.",
    ],
    records: [
      "Original return and calculation",
      "Evidence for the omitted claim",
      "Amendment or signed claim correspondence",
    ],
    action: { label: "Review HMRC handoff", to: "/hmrc-handoff" },
    keywords: [
      "amend",
      "amendment",
      "refund",
      "overpayment",
      "missed expense",
      "prior year",
      "correction",
    ],
    sourceIds: ["amendments"],
    oftenMissed: true,
  },
  {
    id: "entertaining",
    title: "Client entertainment and hospitality",
    summary:
      "Entertaining customers, suppliers or business contacts is not normally deductible from trading profit.",
    treatment: "not-allowable",
    group: "Common exclusions",
    circumstances: [],
    conditions: [
      "Business purpose alone does not make client entertainment tax deductible.",
      "Staff entertaining follows different rules and may be allowable when it is genuinely for employees.",
    ],
    records: [
      "Keep the receipt and purpose so the cost can be identified and excluded correctly",
    ],
    keywords: ["client", "customer", "meal", "hospitality", "entertainment"],
  },
  {
    id: "personal-costs",
    title: "Personal costs, drawings and ordinary commuting",
    summary:
      "Private spending, owner drawings and home-to-permanent-workplace travel are not business expenses.",
    treatment: "not-allowable",
    group: "Common exclusions",
    circumstances: [],
    conditions: [
      "Mixed costs must be split on a fair and supportable basis.",
      "Income Tax, National Insurance, loan capital, fines and penalties are not ordinary trading expenses.",
    ],
    records: [
      "Retain enough information to identify personal or capital transactions during reconciliation",
    ],
    keywords: [
      "personal",
      "drawings",
      "commute",
      "income tax",
      "national insurance",
      "fine",
      "penalty",
    ],
  },
];

export function filterTaxReliefItems(
  query: string,
  treatment: ReliefTreatment | "all" = "all",
  circumstances: ReliefCircumstance[] = [],
  items = taxReliefItems,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (treatment !== "all" && item.treatment !== treatment) return false;
    if (
      circumstances.length > 0 &&
      item.circumstances.length > 0 &&
      !item.circumstances.some((value) => circumstances.includes(value))
    )
      return false;
    const searchable = [
      item.title,
      item.summary,
      item.group,
      item.category ?? "",
      ...item.conditions,
      ...item.records,
      ...item.keywords,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

export interface HelpTopic {
  id: string;
  title: string;
  summary: string;
  details: string[];
  keywords: string[];
}

export const helpTopics: HelpTopic[] = [
  {
    id: "daily-bookkeeping",
    title: "Daily bookkeeping",
    summary: "Record sales, expenses, mileage, documents and bank activity.",
    details: [
      "Create clients before issuing invoices, and keep invoices as drafts until their details are final.",
      "Attach source evidence to expenses and reconcile imported bank transactions regularly.",
      "Use Reports and Accountant to review totals and export source records before year end.",
    ],
    keywords: ["client", "invoice", "expense", "mileage", "bank", "reconcile"],
  },
  {
    id: "bank-imports",
    title: "Bank statement imports",
    summary: "Import CSV, TSV, labelled text, QIF, OFX or QFX statements.",
    details: [
      "Review the preview before committing an import. SoleTrader deduplicates transactions already recorded.",
      "PDF statements and scanned images are not supported. Export a supported data format from your bank.",
      "Split files larger than 10 MB or batches containing more than 2,000 new transactions into smaller date ranges.",
    ],
    keywords: ["statement", "csv", "qif", "ofx", "qfx", "pdf", "duplicate"],
  },
  {
    id: "tax-vat-limitations",
    title: "Tax and VAT limitations",
    summary:
      "Treat calculations as working estimates until they are independently reviewed.",
    details: [
      "SoleTrader does not submit returns to HMRC and does not replace professional tax advice or filing confirmation.",
      "The MTD setting records digital-preparation readiness only. It does not authorise HMRC access or submit a VAT return.",
      "Have an accountant review VAT returns, Self Assessment, CIS, self-billing, capital allowances and unusual transactions before filing.",
      "Keep HMRC receipts and source evidence outside the app as part of your statutory records.",
    ],
    keywords: ["hmrc", "filing", "estimate", "vat", "tax", "cis", "accountant"],
  },
  {
    id: "bank-connections",
    title: "Bank connections and account data",
    summary: "Use local statement imports and keep account classifications accurate.",
    details: [
      "SoleTrader does not connect to banks or use open banking. Import a statement exported by your bank or payment provider.",
      "Create separate local accounts for current accounts, cash, PayPal, Stripe, cards and savings, then filter reconciliation by account.",
      "Classify owner movements, transfers, loans and refunds so they are not reported as sales or allowable expenses.",
    ],
    keywords: ["bank", "account", "open banking", "transfer", "owner", "classification"],
  },
  {
    id: "backup-restore",
    title: "Back up and restore a business",
    summary:
      "Create regular verified backups and keep at least one copy off the computer.",
    details: [
      "Open Accounts and use the backup action beside the business you want to protect.",
      "Store backups on an external or independently synchronised drive and confirm the latest backup date.",
      "Use Restore backup from Accounts. Restore publishes a separate verified workspace and does not overwrite the source business.",
    ],
    keywords: ["backup", "restore", "accounts", "external", "copy", "lost"],
  },
  {
    id: "migration-recovery",
    title: "Updates, migration and recovery",
    summary:
      "Back up before installing a newer build or opening older business data.",
    details: [
      "Database upgrades create and verify a versioned pre-migration copy before changing the live database.",
      "Automatic application updates are currently disabled. Install newer trusted builds manually after making a backup.",
      "If startup or migration fails, stop retrying, preserve the business folder and its pre-migration copies, then restore a verified backup.",
    ],
    keywords: [
      "update",
      "upgrade",
      "migration",
      "startup",
      "recovery",
      "version",
    ],
  },
  {
    id: "security-data-location",
    title: "Security and data location",
    summary:
      "Protect the Windows account and device that hold your bookkeeping files.",
    details: [
      "Business data is stored under %APPDATA%\\com.jaydo.soletrader and remains after uninstalling the application.",
      "The app PIN restricts access through SoleTrader but does not encrypt the database, attachments or backup files.",
      "Use Windows device encryption where available and do not send unencrypted business backups through insecure channels.",
    ],
    keywords: [
      "pin",
      "encryption",
      "appdata",
      "uninstall",
      "privacy",
      "security",
    ],
  },
];

export function filterHelpTopics(query: string, topics = helpTopics) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return topics;
  return topics.filter((topic) => {
    const searchable = [
      topic.title,
      topic.summary,
      ...topic.details,
      ...topic.keywords,
    ]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => searchable.includes(term));
  });
}

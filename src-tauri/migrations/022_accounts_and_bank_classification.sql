CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    account_type TEXT NOT NULL DEFAULT 'current' CHECK (account_type IN ('current', 'savings', 'cash', 'paypal', 'stripe', 'credit_card', 'other')),
    opening_balance REAL NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO bank_accounts (id, name, account_type) VALUES (1, 'Main bank account', 'current');
ALTER TABLE bank_transactions ADD COLUMN bank_account_id INTEGER NOT NULL DEFAULT 1 REFERENCES bank_accounts(id);
ALTER TABLE bank_transactions ADD COLUMN classification TEXT NOT NULL DEFAULT 'unclassified'
  CHECK (classification IN ('unclassified', 'invoice_payment', 'direct_income', 'expense', 'owner_contribution', 'owner_withdrawal', 'transfer', 'loan', 'refund', 'ignored'));
CREATE INDEX IF NOT EXISTS bank_transactions_account_idx ON bank_transactions(bank_account_id, transaction_date);
CREATE INDEX IF NOT EXISTS bank_transactions_classification_idx ON bank_transactions(classification);

UPDATE bank_transactions SET classification = CASE
  WHEN matched_payment_id IS NOT NULL THEN 'invoice_payment'
  WHEN matched_income_id IS NOT NULL THEN 'direct_income'
  WHEN matched_expense_id IS NOT NULL THEN 'expense'
  WHEN status = 'ignored' THEN 'ignored'
  ELSE 'unclassified'
END;

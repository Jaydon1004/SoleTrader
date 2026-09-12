DROP TRIGGER IF EXISTS self_billing_payments_default_cash;

CREATE TRIGGER self_billing_payments_default_cash AFTER INSERT ON invoice_payments
WHEN NEW.cash_amount IS NULL
BEGIN
  UPDATE invoice_payments
  SET cash_amount = NEW.amount - NEW.cis_deduction_amount
  WHERE id = NEW.id;
END;

CREATE TABLE ledger_accounts (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  system_account INTEGER NOT NULL DEFAULT 1 CHECK (system_account IN (0, 1))
);

INSERT INTO ledger_accounts (code, name, account_type) VALUES
  ('1000', 'Bank and cash', 'asset'),
  ('1100', 'Trade debtors', 'asset'),
  ('1200', 'VAT recoverable', 'asset'),
  ('2000', 'VAT payable', 'liability'),
  ('2100', 'CIS suffered', 'asset'),
  ('3000', 'Owner capital', 'equity'),
  ('3100', 'Owner drawings', 'equity'),
  ('4000', 'Sales', 'income'),
  ('4900', 'Other business income', 'income'),
  ('5000', 'Business expenses', 'expense'),
  ('5100', 'Vehicle expenses', 'expense'),
  ('5200', 'Bad debts', 'expense');

CREATE TABLE journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  description TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id INTEGER NOT NULL,
  tax_year TEXT NOT NULL,
  generated INTEGER NOT NULL DEFAULT 1 CHECK (generated IN (0, 1)),
  reversed_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_type, source_id)
);

CREATE TABLE journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL REFERENCES ledger_accounts(code),
  debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
  memo TEXT NOT NULL DEFAULT '',
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE INDEX idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_tax_year ON journal_entries(tax_year);
CREATE INDEX idx_journal_lines_entry ON journal_lines(entry_id);
CREATE INDEX idx_journal_lines_account ON journal_lines(account_code);

CREATE TRIGGER journal_entries_balanced_before_update BEFORE UPDATE ON journal_entries
WHEN EXISTS (SELECT 1 FROM journal_lines WHERE entry_id = OLD.id)
  AND (SELECT COALESCE(SUM(debit), 0) FROM journal_lines WHERE entry_id = OLD.id)
    <> (SELECT COALESCE(SUM(credit), 0) FROM journal_lines WHERE entry_id = OLD.id)
BEGIN SELECT RAISE(ABORT, 'Journal entry is not balanced'); END;

CREATE TABLE year_end_closes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year TEXT NOT NULL UNIQUE REFERENCES tax_year_config(tax_year),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'closed')),
  checklist_json TEXT NOT NULL DEFAULT '{}',
  snapshot_json TEXT,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER closed_year_invoices_insert BEFORE INSERT ON invoices
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.issue_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_invoices_update BEFORE UPDATE ON invoices
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.issue_date BETWEEN t.year_start AND t.year_end OR NEW.issue_date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_invoices_delete BEFORE DELETE ON invoices
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.issue_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_payments_insert BEFORE INSERT ON invoice_payments
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.payment_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_payments_update BEFORE UPDATE ON invoice_payments
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.payment_date BETWEEN t.year_start AND t.year_end OR NEW.payment_date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_payments_delete BEFORE DELETE ON invoice_payments
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.payment_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_credits_insert BEFORE INSERT ON credit_notes
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.issue_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_credits_update BEFORE UPDATE ON credit_notes
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.issue_date BETWEEN t.year_start AND t.year_end OR NEW.issue_date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_credits_delete BEFORE DELETE ON credit_notes
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.issue_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_expenses_insert BEFORE INSERT ON expenses
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_expenses_update BEFORE UPDATE ON expenses
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.date BETWEEN t.year_start AND t.year_end OR NEW.date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_expenses_delete BEFORE DELETE ON expenses
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_direct_income_insert BEFORE INSERT ON direct_income
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.income_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_direct_income_update BEFORE UPDATE ON direct_income
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.income_date BETWEEN t.year_start AND t.year_end OR NEW.income_date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_direct_income_delete BEFORE DELETE ON direct_income
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.income_date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_vehicle_costs_insert BEFORE INSERT ON vehicle_costs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_vehicle_costs_update BEFORE UPDATE ON vehicle_costs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.date BETWEEN t.year_start AND t.year_end OR NEW.date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_vehicle_costs_delete BEFORE DELETE ON vehicle_costs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_mileage_insert BEFORE INSERT ON mileage_logs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND NEW.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_mileage_update BEFORE UPDATE ON mileage_logs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND (OLD.date BETWEEN t.year_start AND t.year_end OR NEW.date BETWEEN t.year_start AND t.year_end))
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_mileage_delete BEFORE DELETE ON mileage_logs
WHEN EXISTS (SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year WHERE y.status = 'closed' AND OLD.date BETWEEN t.year_start AND t.year_end)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
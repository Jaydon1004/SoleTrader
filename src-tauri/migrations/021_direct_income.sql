CREATE TABLE IF NOT EXISTS direct_income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    income_date TEXT NOT NULL,
    description TEXT NOT NULL,
    income_type TEXT NOT NULL DEFAULT 'sale' CHECK (income_type IN ('sale', 'other_business_income', 'grant', 'refund', 'other')),
    amount REAL NOT NULL,
    vat_amount REAL NOT NULL DEFAULT 0,
    vat_rate REAL DEFAULT NULL,
    payment_method TEXT NOT NULL DEFAULT '',
    client_id INTEGER DEFAULT NULL REFERENCES clients(id),
    notes TEXT DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_frequency TEXT DEFAULT NULL CHECK (recurring_frequency IN (NULL, 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
    recurring_next_date TEXT DEFAULT NULL,
    recurring_auto_create INTEGER NOT NULL DEFAULT 0,
    tax_year TEXT NOT NULL DEFAULT '',
    bank_transaction_id INTEGER DEFAULT NULL REFERENCES bank_transactions(id),
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (amount > 0),
    CHECK (vat_amount >= 0 AND vat_amount <= amount),
    CHECK (vat_rate IS NULL OR (vat_rate >= 0 AND vat_rate <= 100))
);

ALTER TABLE bank_transactions ADD COLUMN matched_income_id INTEGER DEFAULT NULL REFERENCES direct_income(id);
CREATE UNIQUE INDEX IF NOT EXISTS direct_income_bank_transaction_unique
    ON direct_income(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS direct_income_date_idx ON direct_income(income_date, tax_year);

CREATE TRIGGER IF NOT EXISTS direct_income_financial_values
BEFORE UPDATE ON direct_income
WHEN NEW.amount <= 0 OR NEW.vat_amount < 0 OR NEW.vat_amount > NEW.amount
  OR date(NEW.income_date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Direct income contains invalid financial values or date'); END;

CREATE TRIGGER IF NOT EXISTS filed_direct_income_update
BEFORE UPDATE ON direct_income
WHEN (OLD.income_date IS NOT NEW.income_date OR OLD.amount IS NOT NEW.amount
  OR OLD.vat_amount IS NOT NEW.vat_amount OR OLD.vat_rate IS NOT NEW.vat_rate
  OR OLD.deleted_at IS NOT NEW.deleted_at)
  AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.income_date BETWEEN period_start AND period_end
    OR NEW.income_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This direct income belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER IF NOT EXISTS direct_income_audit_insert
AFTER INSERT ON direct_income
BEGIN INSERT INTO audit_log (entity_type, entity_id, action, changes)
  VALUES ('direct_income', NEW.id, 'create', NEW.description); END;

CREATE TRIGGER IF NOT EXISTS direct_income_audit_update
AFTER UPDATE ON direct_income
BEGIN INSERT INTO audit_log (entity_type, entity_id, action, changes)
  VALUES ('direct_income', NEW.id, 'update', NEW.description); END;

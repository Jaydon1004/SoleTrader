CREATE TABLE IF NOT EXISTS bank_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    duplicate_rows INTEGER NOT NULL DEFAULT 0,
    date_from TEXT NOT NULL DEFAULT '',
    date_to TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_reconciliation_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    match_tolerance_days INTEGER NOT NULL DEFAULT 3 CHECK (match_tolerance_days >= 0 AND match_tolerance_days <= 31),
    amount_tolerance REAL NOT NULL DEFAULT 0.01 CHECK (amount_tolerance >= 0 AND amount_tolerance <= 10),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO bank_reconciliation_settings (id) VALUES (1);

ALTER TABLE bank_transactions ADD COLUMN import_batch_id INTEGER DEFAULT NULL REFERENCES bank_import_batches(id);
ALTER TABLE bank_transactions ADD COLUMN matched_payment_id INTEGER DEFAULT NULL REFERENCES invoice_payments(id);
ALTER TABLE bank_transactions ADD COLUMN manual_category_id INTEGER DEFAULT NULL REFERENCES expense_categories(id);
ALTER TABLE bank_transactions ADD COLUMN tax_year TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_transactions ADD COLUMN match_confidence TEXT NOT NULL DEFAULT '' CHECK (match_confidence IN ('', 'exact', 'near', 'manual'));
ALTER TABLE bank_transactions ADD COLUMN raw_data TEXT NOT NULL DEFAULT '';
ALTER TABLE bank_transactions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

UPDATE bank_transactions SET updated_at = created_at WHERE updated_at = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_hash_unique ON bank_transactions(hash) WHERE hash != '';
CREATE INDEX IF NOT EXISTS idx_bank_transactions_tax_year ON bank_transactions(tax_year);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_batch ON bank_transactions(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_payment ON bank_transactions(matched_payment_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_expense ON bank_transactions(matched_expense_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(transaction_date);

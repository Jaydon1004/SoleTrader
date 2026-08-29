CREATE TABLE IF NOT EXISTS bank_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description_pattern TEXT NOT NULL,
    classification TEXT NOT NULL CHECK (classification IN ('owner_contribution', 'owner_withdrawal', 'transfer', 'loan', 'refund', 'ignored')),
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_transaction_splits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bank_transaction_id INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    classification TEXT NOT NULL CHECK (classification IN ('direct_income', 'expense', 'owner_contribution', 'owner_withdrawal', 'transfer', 'loan', 'refund', 'ignored')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE bank_transactions ADD COLUMN transfer_pair_id INTEGER DEFAULT NULL REFERENCES bank_transactions(id);
CREATE INDEX IF NOT EXISTS bank_transaction_transfer_idx ON bank_transactions(transfer_pair_id);

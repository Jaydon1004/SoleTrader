CREATE TABLE IF NOT EXISTS vat_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    quarter_start_month INTEGER NOT NULL DEFAULT 1 CHECK (quarter_start_month BETWEEN 1 AND 12),
    mtd_enabled INTEGER NOT NULL DEFAULT 0 CHECK (mtd_enabled IN (0, 1)),
    reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO vat_settings (id) VALUES (1);

ALTER TABLE invoices ADD COLUMN vat_ec_supply INTEGER NOT NULL DEFAULT 0
    CHECK (vat_ec_supply IN (0, 1));

ALTER TABLE expenses ADD COLUMN vat_ec_acquisition INTEGER NOT NULL DEFAULT 0
    CHECK (vat_ec_acquisition IN (0, 1));
ALTER TABLE expenses ADD COLUMN vat_capital_asset INTEGER NOT NULL DEFAULT 0
    CHECK (vat_capital_asset IN (0, 1));

ALTER TABLE vehicle_costs ADD COLUMN vat_amount REAL NOT NULL DEFAULT 0
    CHECK (vat_amount >= 0 AND vat_amount <= amount);
ALTER TABLE vehicle_costs ADD COLUMN vat_capital_asset INTEGER NOT NULL DEFAULT 0
    CHECK (vat_capital_asset IN (0, 1));

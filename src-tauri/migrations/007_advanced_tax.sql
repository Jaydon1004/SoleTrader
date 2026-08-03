CREATE TABLE IF NOT EXISTS capital_assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    asset_type TEXT NOT NULL DEFAULT 'equipment' CHECK (asset_type IN ('equipment', 'plant', 'machinery', 'vehicle', 'integral_feature', 'other')),
    description TEXT NOT NULL DEFAULT '',
    purchase_date TEXT NOT NULL,
    purchase_price REAL NOT NULL CHECK (purchase_price > 0),
    business_percent REAL NOT NULL DEFAULT 100 CHECK (business_percent > 0 AND business_percent <= 100),
    pool_type TEXT NOT NULL DEFAULT 'main' CHECK (pool_type IN ('main', 'special')),
    claim_method TEXT NOT NULL DEFAULT 'aia' CHECK (claim_method IN ('aia', 'wda')),
    disposal_date TEXT DEFAULT NULL,
    disposal_proceeds REAL NOT NULL DEFAULT 0 CHECK (disposal_proceeds >= 0),
    notes TEXT NOT NULL DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cis_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    direction TEXT NOT NULL CHECK (direction IN ('received', 'made')),
    date TEXT NOT NULL,
    party_name TEXT NOT NULL,
    party_utr TEXT NOT NULL DEFAULT '',
    gross_amount REAL NOT NULL CHECK (gross_amount > 0),
    materials_amount REAL NOT NULL DEFAULT 0 CHECK (materials_amount >= 0 AND materials_amount <= gross_amount),
    deduction_rate REAL NOT NULL DEFAULT 20 CHECK (deduction_rate >= 0 AND deduction_rate <= 100),
    deduction_amount REAL NOT NULL CHECK (deduction_amount >= 0),
    notes TEXT NOT NULL DEFAULT '',
    tax_year TEXT NOT NULL,
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_capital_assets_purchase_date ON capital_assets(purchase_date);
CREATE INDEX IF NOT EXISTS idx_capital_assets_disposal_date ON capital_assets(disposal_date);
CREATE INDEX IF NOT EXISTS idx_cis_transactions_tax_year ON cis_transactions(tax_year);
CREATE INDEX IF NOT EXISTS idx_cis_transactions_date ON cis_transactions(date);
CREATE INDEX IF NOT EXISTS idx_cis_transactions_direction ON cis_transactions(direction);

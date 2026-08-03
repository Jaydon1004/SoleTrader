-- SoleTrader App - Initial Database Schema
-- All financial data for UK sole traders

-- ======================
-- USER & SETTINGS
-- ======================

CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    utr TEXT DEFAULT '',
    ni_number TEXT DEFAULT '',
    address_line_1 TEXT DEFAULT '',
    address_line_2 TEXT DEFAULT '',
    city TEXT DEFAULT '',
    county TEXT DEFAULT '',
    postcode TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    trading_name TEXT DEFAULT '',
    business_description TEXT DEFAULT '',
    accounting_basis TEXT NOT NULL DEFAULT 'cash' CHECK (accounting_basis IN ('cash', 'accrual')),
    vat_status TEXT NOT NULL DEFAULT 'unregistered' CHECK (vat_status IN ('unregistered', 'voluntary', 'compulsory')),
    vat_number TEXT DEFAULT '',
    vat_scheme TEXT NOT NULL DEFAULT 'standard' CHECK (vat_scheme IN ('standard', 'flat_rate', 'cash_accounting')),
    vat_flat_rate_percent REAL DEFAULT NULL,
    cis_status TEXT NOT NULL DEFAULT 'none' CHECK (cis_status IN ('none', 'registered', 'unregistered', 'gross')),
    student_loan_plan TEXT NOT NULL DEFAULT 'none' CHECK (student_loan_plan IN ('none', 'plan_1', 'plan_2', 'plan_4', 'postgrad')),
    onboarding_complete INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- TAX YEAR CONFIGURATION
-- ======================

CREATE TABLE IF NOT EXISTS tax_year_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tax_year TEXT NOT NULL UNIQUE, -- e.g. '2025/26'
    year_start TEXT NOT NULL,      -- e.g. '2025-04-06'
    year_end TEXT NOT NULL,        -- e.g. '2026-04-05'

    -- Income Tax
    personal_allowance REAL NOT NULL DEFAULT 12570,
    basic_rate_percent REAL NOT NULL DEFAULT 20,
    basic_rate_upper REAL NOT NULL DEFAULT 50270,
    higher_rate_percent REAL NOT NULL DEFAULT 40,
    higher_rate_upper REAL NOT NULL DEFAULT 125140,
    additional_rate_percent REAL NOT NULL DEFAULT 45,
    pa_taper_start REAL NOT NULL DEFAULT 100000,
    pa_taper_rate REAL NOT NULL DEFAULT 0.5,
    blind_persons_allowance REAL NOT NULL DEFAULT 3070,
    marriage_allowance_percent REAL NOT NULL DEFAULT 10,

    -- National Insurance
    class2_weekly_rate REAL NOT NULL DEFAULT 3.45,
    class2_small_profits_threshold REAL NOT NULL DEFAULT 12570,
    class4_lower_threshold REAL NOT NULL DEFAULT 12570,
    class4_upper_threshold REAL NOT NULL DEFAULT 50270,
    class4_main_rate_percent REAL NOT NULL DEFAULT 6,
    class4_upper_rate_percent REAL NOT NULL DEFAULT 2,

    -- VAT
    vat_registration_threshold REAL NOT NULL DEFAULT 90000,
    vat_deregistration_threshold REAL NOT NULL DEFAULT 88000,
    vat_standard_rate_percent REAL NOT NULL DEFAULT 20,
    vat_reduced_rate_percent REAL NOT NULL DEFAULT 5,
    vat_payment_deadline_days INTEGER NOT NULL DEFAULT 37,

    -- Mileage
    mileage_car_first_tier_rate REAL NOT NULL DEFAULT 0.45,
    mileage_car_first_tier_limit REAL NOT NULL DEFAULT 10000,
    mileage_car_second_tier_rate REAL NOT NULL DEFAULT 0.25,
    mileage_motorcycle_rate REAL NOT NULL DEFAULT 0.24,
    mileage_bicycle_rate REAL NOT NULL DEFAULT 0.20,
    mileage_passenger_rate REAL NOT NULL DEFAULT 0.05,

    -- Capital Allowances
    aia_limit REAL NOT NULL DEFAULT 1000000,
    main_pool_wda_percent REAL NOT NULL DEFAULT 18,
    special_rate_wda_percent REAL NOT NULL DEFAULT 6,
    first_year_allowance_percent REAL NOT NULL DEFAULT 100,

    -- Payments on Account
    poa_threshold REAL NOT NULL DEFAULT 1000,
    poa_source_deducted_percent REAL NOT NULL DEFAULT 80,
    poa_rate_percent REAL NOT NULL DEFAULT 50,
    poa_first_deadline TEXT NOT NULL DEFAULT '01-31',  -- Jan 31
    poa_second_deadline TEXT NOT NULL DEFAULT '07-31', -- Jul 31

    -- Key Dates
    sa_registration_deadline TEXT NOT NULL DEFAULT '10-05',
    paper_return_deadline TEXT NOT NULL DEFAULT '10-31',
    online_return_deadline TEXT NOT NULL DEFAULT '01-31',
    late_filing_penalty REAL NOT NULL DEFAULT 100,
    late_payment_interest_rate REAL NOT NULL DEFAULT 2.5,
    boe_base_rate REAL NOT NULL DEFAULT 5.25,

    -- Student Loan
    student_loan_plan1_threshold REAL NOT NULL DEFAULT 24990,
    student_loan_plan1_rate REAL NOT NULL DEFAULT 9,
    student_loan_plan2_threshold REAL NOT NULL DEFAULT 28470,
    student_loan_plan2_rate REAL NOT NULL DEFAULT 9,
    student_loan_plan4_threshold REAL NOT NULL DEFAULT 32745,
    student_loan_plan4_rate REAL NOT NULL DEFAULT 9,
    student_loan_postgrad_threshold REAL NOT NULL DEFAULT 21000,
    student_loan_postgrad_rate REAL NOT NULL DEFAULT 6,

    -- Pensions
    pension_annual_allowance REAL NOT NULL DEFAULT 60000,
    pension_mpaa REAL NOT NULL DEFAULT 10000,
    pension_basic_rate_relief REAL NOT NULL DEFAULT 20,

    -- Home Office Flat Rates
    home_office_25_50_hours REAL NOT NULL DEFAULT 10,
    home_office_51_100_hours REAL NOT NULL DEFAULT 18,
    home_office_101_plus_hours REAL NOT NULL DEFAULT 26,

    -- Miscellaneous Allowances
    trading_allowance REAL NOT NULL DEFAULT 1000,
    property_allowance REAL NOT NULL DEFAULT 1000,
    savings_allowance_basic REAL NOT NULL DEFAULT 1000,
    savings_allowance_higher REAL NOT NULL DEFAULT 500,
    savings_allowance_additional REAL NOT NULL DEFAULT 0,
    dividend_allowance REAL NOT NULL DEFAULT 500,
    dividend_basic_rate REAL NOT NULL DEFAULT 8.75,
    dividend_higher_rate REAL NOT NULL DEFAULT 33.75,
    dividend_additional_rate REAL NOT NULL DEFAULT 39.35,

    -- CIS
    cis_standard_rate REAL NOT NULL DEFAULT 20,
    cis_unregistered_rate REAL NOT NULL DEFAULT 30,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- INVOICE SETTINGS
-- ======================

CREATE TABLE IF NOT EXISTS invoice_settings (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    logo_path TEXT DEFAULT '',
    bank_name TEXT DEFAULT '',
    account_name TEXT DEFAULT '',
    sort_code TEXT DEFAULT '',
    account_number TEXT DEFAULT '',
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    number_prefix TEXT NOT NULL DEFAULT 'INV-',
    number_next INTEGER NOT NULL DEFAULT 1,
    footer_text TEXT DEFAULT '',
    default_vat_rate REAL DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- CLIENTS
-- ======================

CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address_line_1 TEXT DEFAULT '',
    address_line_2 TEXT DEFAULT '',
    city TEXT DEFAULT '',
    county TEXT DEFAULT '',
    postcode TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- INVOICES
-- ======================

CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    invoice_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0,
    vat_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    amount_paid REAL NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    internal_notes TEXT DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_frequency TEXT DEFAULT NULL CHECK (recurring_frequency IN (NULL, 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
    recurring_next_date TEXT DEFAULT NULL,
    is_quote INTEGER NOT NULL DEFAULT 0,
    converted_from_quote_id INTEGER DEFAULT NULL REFERENCES invoices(id),
    tax_year TEXT DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    vat_rate REAL DEFAULT NULL,
    vat_amount REAL NOT NULL DEFAULT 0,
    line_total REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    payment_method TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- CREDIT NOTES
-- ======================

CREATE TABLE IF NOT EXISTS credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    credit_number TEXT NOT NULL UNIQUE,
    amount REAL NOT NULL,
    reason TEXT DEFAULT '',
    issue_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- EXPENSES
-- ======================

CREATE TABLE IF NOT EXISTS expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_system INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES expense_categories(id),
    date TEXT NOT NULL,
    supplier TEXT DEFAULT '',
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    vat_amount REAL NOT NULL DEFAULT 0,
    business_percent REAL NOT NULL DEFAULT 100,
    receipt_path TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_frequency TEXT DEFAULT NULL CHECK (recurring_frequency IN (NULL, 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
    recurring_next_date TEXT DEFAULT NULL,
    tax_year TEXT DEFAULT '',
    is_bad_debt INTEGER NOT NULL DEFAULT 0,
    source_invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id),
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- VEHICLES & MILEAGE
-- ======================

CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    make TEXT DEFAULT '',
    model TEXT DEFAULT '',
    registration TEXT DEFAULT '',
    vehicle_type TEXT NOT NULL DEFAULT 'car' CHECK (vehicle_type IN ('car', 'van', 'motorcycle', 'bicycle')),
    cost_method TEXT NOT NULL DEFAULT 'mileage' CHECK (cost_method IN ('mileage', 'actual')),
    business_percent REAL NOT NULL DEFAULT 100,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mileage_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    date TEXT NOT NULL,
    start_location TEXT DEFAULT '',
    end_location TEXT DEFAULT '',
    purpose TEXT NOT NULL,
    distance_miles REAL NOT NULL,
    passengers INTEGER NOT NULL DEFAULT 0,
    rate_applied REAL NOT NULL,
    amount REAL NOT NULL,
    notes TEXT DEFAULT '',
    tax_year TEXT DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicle_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    date TEXT NOT NULL,
    cost_type TEXT NOT NULL CHECK (cost_type IN ('fuel', 'insurance', 'mot', 'servicing', 'repairs', 'road_tax', 'other')),
    description TEXT DEFAULT '',
    amount REAL NOT NULL,
    receipt_path TEXT DEFAULT '',
    tax_year TEXT DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- DOCUMENTS
-- ======================

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT DEFAULT '',
    file_size INTEGER DEFAULT 0,
    category TEXT DEFAULT 'other' CHECK (category IN ('receipt', 'invoice_sent', 'invoice_received', 'contract', 'insurance', 'other')),
    linked_expense_id INTEGER DEFAULT NULL REFERENCES expenses(id),
    linked_invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id),
    client_id INTEGER DEFAULT NULL REFERENCES clients(id),
    tax_year TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    ocr_text TEXT DEFAULT '',
    deleted_at TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- REMINDERS
-- ======================

CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    due_date TEXT NOT NULL,
    reminder_type TEXT NOT NULL DEFAULT 'custom' CHECK (reminder_type IN ('tax_deadline', 'vat_deadline', 'invoice_overdue', 'expense_nudge', 'custom')),
    is_recurring INTEGER NOT NULL DEFAULT 0,
    recurring_frequency TEXT DEFAULT NULL,
    dismissed INTEGER NOT NULL DEFAULT 0,
    linked_invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- BANK IMPORTS
-- ======================

CREATE TABLE IF NOT EXISTS bank_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_date TEXT NOT NULL DEFAULT (datetime('now')),
    transaction_date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_in REAL NOT NULL DEFAULT 0,
    amount_out REAL NOT NULL DEFAULT 0,
    balance REAL DEFAULT NULL,
    matched_invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id),
    matched_expense_id INTEGER DEFAULT NULL REFERENCES expenses(id),
    status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
    source_file TEXT DEFAULT '',
    hash TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- AUDIT TRAIL
-- ======================

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
    changes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ======================
-- APP SETTINGS
-- ======================

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ======================
-- SEED DEFAULT EXPENSE CATEGORIES
-- ======================

INSERT OR IGNORE INTO expense_categories (name, is_system, sort_order) VALUES
    ('Tools & Equipment', 1, 1),
    ('PPE', 1, 2),
    ('Materials & Supplies', 1, 3),
    ('Subcontractors', 1, 4),
    ('Software & Subscriptions', 1, 5),
    ('Training & CPD', 1, 6),
    ('Insurance', 1, 7),
    ('Phone & Internet', 1, 8),
    ('Office & Stationery', 1, 9),
    ('Advertising & Marketing', 1, 10),
    ('Bank Charges', 1, 11),
    ('Accountancy & Professional Fees', 1, 12),
    ('Workwear & Clothing', 1, 13),
    ('Travel (non-vehicle)', 1, 14),
    ('Home Office', 1, 15),
    ('Food & Drink (site/travel)', 1, 16);

-- ======================
-- SEED DEFAULT TAX YEAR 2025/26
-- ======================

INSERT OR IGNORE INTO tax_year_config (tax_year, year_start, year_end) VALUES
    ('2025/26', '2025-04-06', '2026-04-05');

INSERT OR IGNORE INTO tax_year_config (tax_year, year_start, year_end,
    personal_allowance, basic_rate_percent, basic_rate_upper, higher_rate_percent,
    higher_rate_upper, additional_rate_percent, class4_main_rate_percent
) VALUES
    ('2024/25', '2024-04-06', '2025-04-05', 12570, 20, 50270, 40, 125140, 45, 8);

-- ======================
-- SEED DEFAULT SETTINGS
-- ======================

INSERT OR IGNORE INTO user_profile (id) VALUES (1);
INSERT OR IGNORE INTO invoice_settings (id) VALUES (1);
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('current_tax_year', '2025/26');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pin_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pin_hash', '');

-- ======================
-- INDEXES
-- ======================

CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_tax_year ON invoices(tax_year);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_tax_year ON expenses(tax_year);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_vehicle_id ON mileage_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_tax_year ON mileage_logs(tax_year);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_tax_year ON documents(tax_year);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status ON bank_transactions(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

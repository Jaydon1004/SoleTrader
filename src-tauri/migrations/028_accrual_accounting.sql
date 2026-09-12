INSERT INTO ledger_accounts (code, name, account_type) VALUES
  ('1300', 'Prepayments', 'asset'),
  ('2200', 'Trade creditors', 'liability'),
  ('2300', 'Accrued expenses', 'liability');

CREATE TABLE supplier_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  supplier TEXT NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  bill_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  gross_amount REAL NOT NULL CHECK (gross_amount > 0),
  vat_amount REAL NOT NULL DEFAULT 0 CHECK (vat_amount >= 0 AND vat_amount <= gross_amount),
  business_percent REAL NOT NULL DEFAULT 100 CHECK (business_percent > 0 AND business_percent <= 100),
  vat_capital_asset INTEGER NOT NULL DEFAULT 0 CHECK (vat_capital_asset IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  tax_year TEXT NOT NULL REFERENCES tax_year_config(tax_year),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (due_date >= bill_date)
);

CREATE TABLE supplier_bill_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL REFERENCES supplier_bills(id),
  payment_date TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE accrual_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tax_year TEXT NOT NULL REFERENCES tax_year_config(tax_year),
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('accrual', 'prepayment')),
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  adjustment_date TEXT NOT NULL,
  reversal_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (reversal_date > adjustment_date)
);

CREATE INDEX supplier_bills_year_idx ON supplier_bills(tax_year, bill_date);
CREATE INDEX supplier_bills_due_idx ON supplier_bills(due_date, deleted_at);
CREATE INDEX supplier_bill_payments_bill_idx ON supplier_bill_payments(bill_id, payment_date);
CREATE INDEX accrual_adjustments_year_idx ON accrual_adjustments(tax_year, adjustment_date);

CREATE TRIGGER supplier_bill_tax_year_insert BEFORE INSERT ON supplier_bills
WHEN NOT EXISTS (
  SELECT 1 FROM tax_year_config t
  WHERE t.tax_year = NEW.tax_year AND NEW.bill_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'Supplier bill date does not match its tax year'); END;

CREATE TRIGGER supplier_bill_tax_year_update BEFORE UPDATE ON supplier_bills
WHEN NOT EXISTS (
  SELECT 1 FROM tax_year_config t
  WHERE t.tax_year = NEW.tax_year AND NEW.bill_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'Supplier bill date does not match its tax year'); END;

CREATE TRIGGER supplier_bill_payment_limit_insert BEFORE INSERT ON supplier_bill_payments
WHEN NEW.amount + COALESCE((
  SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.bill_id = NEW.bill_id
), 0) > (SELECT gross_amount FROM supplier_bills WHERE id = NEW.bill_id) + 0.005
BEGIN SELECT RAISE(ABORT, 'Supplier bill payment exceeds the outstanding balance'); END;

CREATE TRIGGER supplier_bill_payment_limit_update BEFORE UPDATE ON supplier_bill_payments
WHEN NEW.amount + COALESCE((
  SELECT SUM(p.amount) FROM supplier_bill_payments p
  WHERE p.bill_id = NEW.bill_id AND p.id != OLD.id
), 0) > (SELECT gross_amount FROM supplier_bills WHERE id = NEW.bill_id) + 0.005
BEGIN SELECT RAISE(ABORT, 'Supplier bill payment exceeds the outstanding balance'); END;

CREATE TRIGGER supplier_bill_paid_total_update BEFORE UPDATE OF gross_amount ON supplier_bills
WHEN NEW.gross_amount + 0.005 < COALESCE((
  SELECT SUM(p.amount) FROM supplier_bill_payments p WHERE p.bill_id = OLD.id
), 0)
BEGIN SELECT RAISE(ABORT, 'Supplier bill total cannot be less than payments already recorded'); END;

CREATE TRIGGER accrual_adjustment_tax_year_insert BEFORE INSERT ON accrual_adjustments
WHEN NOT EXISTS (
  SELECT 1 FROM tax_year_config t
  WHERE t.tax_year = NEW.tax_year AND NEW.adjustment_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'Adjustment date does not match its tax year'); END;

CREATE TRIGGER accrual_adjustment_tax_year_update BEFORE UPDATE ON accrual_adjustments
WHEN NOT EXISTS (
  SELECT 1 FROM tax_year_config t
  WHERE t.tax_year = NEW.tax_year AND NEW.adjustment_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'Adjustment date does not match its tax year'); END;

CREATE TRIGGER closed_year_supplier_bills_insert BEFORE INSERT ON supplier_bills
WHEN EXISTS (SELECT 1 FROM year_end_closes WHERE tax_year = NEW.tax_year AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_supplier_bills_update BEFORE UPDATE ON supplier_bills
WHEN EXISTS (SELECT 1 FROM year_end_closes WHERE tax_year IN (OLD.tax_year, NEW.tax_year) AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_supplier_payments_insert BEFORE INSERT ON supplier_bill_payments
WHEN EXISTS (
  SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year
  WHERE y.status = 'closed' AND NEW.payment_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_supplier_payments_update BEFORE UPDATE ON supplier_bill_payments
WHEN EXISTS (
  SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year
  WHERE y.status = 'closed' AND (OLD.payment_date BETWEEN t.year_start AND t.year_end OR NEW.payment_date BETWEEN t.year_start AND t.year_end)
)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_supplier_payments_delete BEFORE DELETE ON supplier_bill_payments
WHEN EXISTS (
  SELECT 1 FROM year_end_closes y INNER JOIN tax_year_config t ON t.tax_year = y.tax_year
  WHERE y.status = 'closed' AND OLD.payment_date BETWEEN t.year_start AND t.year_end
)
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER closed_year_accrual_adjustments_insert BEFORE INSERT ON accrual_adjustments
WHEN EXISTS (SELECT 1 FROM year_end_closes WHERE tax_year = NEW.tax_year AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;
CREATE TRIGGER closed_year_accrual_adjustments_update BEFORE UPDATE ON accrual_adjustments
WHEN EXISTS (SELECT 1 FROM year_end_closes WHERE tax_year IN (OLD.tax_year, NEW.tax_year) AND status = 'closed')
BEGIN SELECT RAISE(ABORT, 'This tax year is closed; reopen it before changing financial records'); END;

CREATE TRIGGER audit_supplier_bills_insert AFTER INSERT ON supplier_bills BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'supplier_bill', NEW.id, 'create', json_object('supplier', NEW.supplier, 'reference', NEW.reference, 'gross_amount', NEW.gross_amount, 'tax_year', NEW.tax_year)
  );
END;
CREATE TRIGGER audit_supplier_bills_update AFTER UPDATE ON supplier_bills BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'supplier_bill', NEW.id, CASE WHEN NEW.deleted_at IS NULL THEN 'update' ELSE 'delete' END,
    json_object('supplier', NEW.supplier, 'reference', NEW.reference, 'gross_amount', NEW.gross_amount, 'tax_year', NEW.tax_year)
  );
END;
CREATE TRIGGER audit_supplier_bill_payments_insert AFTER INSERT ON supplier_bill_payments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'supplier_bill_payment', NEW.id, 'create', json_object('bill_id', NEW.bill_id, 'payment_date', NEW.payment_date, 'amount', NEW.amount)
  );
END;
CREATE TRIGGER audit_supplier_bill_payments_delete AFTER DELETE ON supplier_bill_payments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'supplier_bill_payment', OLD.id, 'delete', json_object('bill_id', OLD.bill_id, 'payment_date', OLD.payment_date, 'amount', OLD.amount)
  );
END;
CREATE TRIGGER audit_accrual_adjustments_insert AFTER INSERT ON accrual_adjustments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'accrual_adjustment', NEW.id, 'create', json_object('type', NEW.adjustment_type, 'description', NEW.description, 'amount', NEW.amount, 'tax_year', NEW.tax_year)
  );
END;
CREATE TRIGGER audit_accrual_adjustments_update AFTER UPDATE ON accrual_adjustments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES(
    'accrual_adjustment', NEW.id, CASE WHEN NEW.deleted_at IS NULL THEN 'update' ELSE 'delete' END,
    json_object('type', NEW.adjustment_type, 'description', NEW.description, 'amount', NEW.amount, 'tax_year', NEW.tax_year)
  );
END;
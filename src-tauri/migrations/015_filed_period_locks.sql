CREATE TABLE vat_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filed_return_id INTEGER NOT NULL REFERENCES vat_return_snapshots(id),
    adjustment_date TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3),
    box1 REAL NOT NULL DEFAULT 0,
    box2 REAL NOT NULL DEFAULT 0,
    box4 REAL NOT NULL DEFAULT 0,
    box6 REAL NOT NULL DEFAULT 0,
    box7 REAL NOT NULL DEFAULT 0,
    box8 REAL NOT NULL DEFAULT 0,
    box9 REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_vat_adjustments_return ON vat_adjustments(filed_return_id, adjustment_date);

CREATE TRIGGER vat_adjustments_open_period BEFORE INSERT ON vat_adjustments
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.adjustment_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'VAT adjustments must be dated in an open VAT period'); END;
CREATE TRIGGER vat_adjustments_no_update BEFORE UPDATE ON vat_adjustments BEGIN
  SELECT RAISE(ABORT, 'VAT adjustments cannot be changed; enter a reversing adjustment');
END;
CREATE TRIGGER vat_adjustments_no_delete BEFORE DELETE ON vat_adjustments BEGIN
  SELECT RAISE(ABORT, 'VAT adjustments cannot be deleted; enter a reversing adjustment');
END;
CREATE TRIGGER audit_vat_adjustment AFTER INSERT ON vat_adjustments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('vat_adjustment', NEW.id, 'create', json_object('filed_return_id', NEW.filed_return_id, 'reason', NEW.reason, 'box1', NEW.box1, 'box4', NEW.box4));
END;

CREATE TRIGGER filed_vat_invoices_insert BEFORE INSERT ON invoices
WHEN NEW.is_quote = 0 AND (NEW.status NOT IN ('draft', 'cancelled') OR NEW.bad_debt_written_off = 1)
 AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.issue_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_invoices_update BEFORE UPDATE ON invoices
WHEN (OLD.issue_date IS NOT NEW.issue_date OR OLD.subtotal IS NOT NEW.subtotal OR OLD.vat_amount IS NOT NEW.vat_amount
  OR OLD.total IS NOT NEW.total OR OLD.is_quote IS NOT NEW.is_quote OR OLD.deleted_at IS NOT NEW.deleted_at
  OR OLD.bad_debt_written_off IS NOT NEW.bad_debt_written_off
  OR (OLD.status IN ('draft', 'cancelled')) IS NOT (NEW.status IN ('draft', 'cancelled')))
 AND ((OLD.is_quote = 0 AND (OLD.status NOT IN ('draft', 'cancelled') OR OLD.bad_debt_written_off = 1)
      AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.issue_date BETWEEN period_start AND period_end))
  OR (NEW.is_quote = 0 AND (NEW.status NOT IN ('draft', 'cancelled') OR NEW.bad_debt_written_off = 1)
  AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.issue_date BETWEEN period_start AND period_end)))
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_invoices_delete BEFORE DELETE ON invoices
WHEN OLD.is_quote = 0 AND (OLD.status NOT IN ('draft', 'cancelled') OR OLD.bad_debt_written_off = 1)
 AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.issue_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER filed_vat_line_items_insert BEFORE INSERT ON invoice_line_items
WHEN EXISTS (SELECT 1 FROM invoices i JOIN vat_return_snapshots v ON i.issue_date BETWEEN v.period_start AND v.period_end
             WHERE i.id = NEW.invoice_id AND i.is_quote = 0 AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1))
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_line_items_update BEFORE UPDATE ON invoice_line_items
WHEN EXISTS (SELECT 1 FROM invoices i JOIN vat_return_snapshots v ON i.issue_date BETWEEN v.period_start AND v.period_end
             WHERE i.id IN (OLD.invoice_id, NEW.invoice_id) AND i.is_quote = 0 AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1))
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_line_items_delete BEFORE DELETE ON invoice_line_items
WHEN EXISTS (SELECT 1 FROM invoices i JOIN vat_return_snapshots v ON i.issue_date BETWEEN v.period_start AND v.period_end
             WHERE i.id = OLD.invoice_id AND i.is_quote = 0 AND (i.status NOT IN ('draft', 'cancelled') OR i.bad_debt_written_off = 1))
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER filed_vat_payments_insert BEFORE INSERT ON invoice_payments
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.payment_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This payment belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_payments_update BEFORE UPDATE ON invoice_payments
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.payment_date BETWEEN period_start AND period_end OR NEW.payment_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This payment belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_payments_delete BEFORE DELETE ON invoice_payments
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.payment_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This payment belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER filed_vat_credits_insert BEFORE INSERT ON credit_notes
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.issue_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This credit note belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_credits_update BEFORE UPDATE ON credit_notes
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.issue_date BETWEEN period_start AND period_end OR NEW.issue_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This credit note belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_credits_delete BEFORE DELETE ON credit_notes
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.issue_date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This credit note belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER filed_vat_expenses_insert BEFORE INSERT ON expenses
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This expense belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_expenses_update BEFORE UPDATE ON expenses
WHEN (OLD.date IS NOT NEW.date OR OLD.amount IS NOT NEW.amount OR OLD.vat_amount IS NOT NEW.vat_amount
  OR OLD.business_percent IS NOT NEW.business_percent OR OLD.vat_ec_acquisition IS NOT NEW.vat_ec_acquisition
  OR OLD.deleted_at IS NOT NEW.deleted_at)
 AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.date BETWEEN period_start AND period_end OR NEW.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This expense belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_expenses_delete BEFORE DELETE ON expenses
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This expense belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER filed_vat_vehicle_costs_insert BEFORE INSERT ON vehicle_costs
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This vehicle cost belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_vehicle_costs_update BEFORE UPDATE ON vehicle_costs
WHEN (OLD.date IS NOT NEW.date OR OLD.amount IS NOT NEW.amount OR OLD.vat_amount IS NOT NEW.vat_amount
  OR OLD.business_percent IS NOT NEW.business_percent OR OLD.vat_capital_asset IS NOT NEW.vat_capital_asset
  OR OLD.deleted_at IS NOT NEW.deleted_at)
 AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.date BETWEEN period_start AND period_end OR NEW.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This vehicle cost belongs to a filed VAT period; enter a VAT adjustment instead'); END;
CREATE TRIGGER filed_vat_vehicle_costs_delete BEFORE DELETE ON vehicle_costs
WHEN EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This vehicle cost belongs to a filed VAT period; enter a VAT adjustment instead'); END;

DROP TRIGGER financial_credits_insert;
DROP TRIGGER financial_credits_update;
DROP TRIGGER financial_invoices_update;

CREATE TRIGGER financial_invoices_update BEFORE UPDATE ON invoices
WHEN NEW.subtotal < 0 OR NEW.vat_amount < 0 OR NEW.total < 0 OR NEW.amount_paid < 0
  OR abs(NEW.total - NEW.subtotal - NEW.vat_amount) > 0.01
  OR date(NEW.issue_date) IS NULL OR date(NEW.due_date) IS NULL
  OR NEW.total + 0.005 < COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.id), 0)
  OR NEW.total + 0.005 < COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.id), 0)
BEGIN SELECT RAISE(ABORT, 'Invoice contains invalid financial values, dates, payments or credits'); END;

CREATE TRIGGER financial_credits_insert BEFORE INSERT ON credit_notes
WHEN NEW.amount <= 0 OR date(NEW.issue_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Credit must be positive and total credits cannot exceed the invoice total'); END;

CREATE TRIGGER financial_credits_update BEFORE UPDATE ON credit_notes
WHEN NEW.amount <= 0 OR date(NEW.issue_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id AND id <> OLD.id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Credit must be positive and total credits cannot exceed the invoice total'); END;

DROP TRIGGER filed_vat_invoices_update;
CREATE TRIGGER filed_vat_invoices_update BEFORE UPDATE ON invoices
WHEN (OLD.issue_date IS NOT NEW.issue_date OR OLD.subtotal IS NOT NEW.subtotal OR OLD.vat_amount IS NOT NEW.vat_amount
  OR OLD.total IS NOT NEW.total OR OLD.is_quote IS NOT NEW.is_quote OR OLD.deleted_at IS NOT NEW.deleted_at
  OR OLD.bad_debt_written_off IS NOT NEW.bad_debt_written_off OR OLD.vat_ec_supply IS NOT NEW.vat_ec_supply
  OR (OLD.status IN ('draft', 'cancelled')) IS NOT (NEW.status IN ('draft', 'cancelled')))
 AND ((OLD.is_quote = 0 AND (OLD.status NOT IN ('draft', 'cancelled') OR OLD.bad_debt_written_off = 1)
      AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.issue_date BETWEEN period_start AND period_end))
  OR (NEW.is_quote = 0 AND (NEW.status NOT IN ('draft', 'cancelled') OR NEW.bad_debt_written_off = 1)
      AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE NEW.issue_date BETWEEN period_start AND period_end)))
BEGIN SELECT RAISE(ABORT, 'This invoice belongs to a filed VAT period; enter a VAT adjustment instead'); END;

DROP TRIGGER filed_vat_expenses_update;
CREATE TRIGGER filed_vat_expenses_update BEFORE UPDATE ON expenses
WHEN (OLD.date IS NOT NEW.date OR OLD.amount IS NOT NEW.amount OR OLD.vat_amount IS NOT NEW.vat_amount
  OR OLD.business_percent IS NOT NEW.business_percent OR OLD.vat_ec_acquisition IS NOT NEW.vat_ec_acquisition
  OR OLD.vat_capital_asset IS NOT NEW.vat_capital_asset OR OLD.deleted_at IS NOT NEW.deleted_at)
 AND EXISTS (SELECT 1 FROM vat_return_snapshots WHERE OLD.date BETWEEN period_start AND period_end OR NEW.date BETWEEN period_start AND period_end)
BEGIN SELECT RAISE(ABORT, 'This expense belongs to a filed VAT period; enter a VAT adjustment instead'); END;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'Audit entries cannot be changed');
END;

CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log BEGIN
  SELECT RAISE(ABORT, 'Audit entries cannot be deleted');
END;

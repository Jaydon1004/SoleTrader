CREATE UNIQUE INDEX idx_bank_matched_payment_unique
ON bank_transactions(matched_payment_id)
WHERE matched_payment_id IS NOT NULL AND status = 'matched';

CREATE UNIQUE INDEX idx_bank_matched_expense_unique
ON bank_transactions(matched_expense_id)
WHERE matched_expense_id IS NOT NULL AND status = 'matched';

CREATE TRIGGER financial_invoices_insert BEFORE INSERT ON invoices
WHEN NEW.subtotal < 0 OR NEW.vat_amount < 0 OR NEW.total < 0 OR NEW.amount_paid < 0
  OR abs(NEW.total - NEW.subtotal - NEW.vat_amount) > 0.01
  OR date(NEW.issue_date) IS NULL OR date(NEW.due_date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Invoice contains invalid financial values or dates'); END;

CREATE TRIGGER financial_invoices_update BEFORE UPDATE ON invoices
WHEN NEW.subtotal < 0 OR NEW.vat_amount < 0 OR NEW.total < 0 OR NEW.amount_paid < 0
  OR abs(NEW.total - NEW.subtotal - NEW.vat_amount) > 0.01
  OR date(NEW.issue_date) IS NULL OR date(NEW.due_date) IS NULL
  OR NEW.total + 0.005 < COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.id), 0)
                        + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.id), 0)
BEGIN SELECT RAISE(ABORT, 'Invoice contains invalid financial values, dates, payments or credits'); END;

CREATE TRIGGER financial_expenses_insert BEFORE INSERT ON expenses
WHEN NEW.amount < 0 OR NEW.vat_amount < 0 OR NEW.vat_amount > NEW.amount
  OR NEW.business_percent < 0 OR NEW.business_percent > 100 OR date(NEW.date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Expense contains invalid financial values or date'); END;
CREATE TRIGGER financial_expenses_update BEFORE UPDATE ON expenses
WHEN NEW.amount < 0 OR NEW.vat_amount < 0 OR NEW.vat_amount > NEW.amount
  OR NEW.business_percent < 0 OR NEW.business_percent > 100 OR date(NEW.date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Expense contains invalid financial values or date'); END;

CREATE TRIGGER financial_vehicle_costs_insert BEFORE INSERT ON vehicle_costs
WHEN NEW.amount < 0 OR NEW.vat_amount < 0 OR NEW.vat_amount > NEW.amount
  OR NEW.business_percent < 0 OR NEW.business_percent > 100 OR date(NEW.date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Vehicle cost contains invalid financial values or date'); END;
CREATE TRIGGER financial_vehicle_costs_update BEFORE UPDATE ON vehicle_costs
WHEN NEW.amount < 0 OR NEW.vat_amount < 0 OR NEW.vat_amount > NEW.amount
  OR NEW.business_percent < 0 OR NEW.business_percent > 100 OR date(NEW.date) IS NULL
BEGIN SELECT RAISE(ABORT, 'Vehicle cost contains invalid financial values or date'); END;

CREATE TRIGGER financial_payments_insert BEFORE INSERT ON invoice_payments
WHEN NEW.amount <= 0 OR date(NEW.payment_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0)
     + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Payment must be positive and cannot exceed the invoice balance'); END;
CREATE TRIGGER financial_payments_update BEFORE UPDATE ON invoice_payments
WHEN NEW.amount <= 0 OR date(NEW.payment_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id AND id <> OLD.id), 0)
     + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Payment must be positive and cannot exceed the invoice balance'); END;

CREATE TRIGGER financial_payments_after_insert AFTER INSERT ON invoice_payments BEGIN
  UPDATE invoices SET amount_paid = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0),
    status = CASE WHEN total <= COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0)
                              + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0) + 0.005
                  THEN 'paid' ELSE 'partially_paid' END,
    updated_at = datetime('now') WHERE id = NEW.invoice_id;
END;
CREATE TRIGGER financial_payments_after_update AFTER UPDATE ON invoice_payments BEGIN
  UPDATE invoices SET amount_paid = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = OLD.invoice_id), 0), updated_at = datetime('now') WHERE id = OLD.invoice_id;
  UPDATE invoices SET amount_paid = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0),
    status = CASE WHEN total <= COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0)
                              + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0) + 0.005
                  THEN 'paid' ELSE 'partially_paid' END,
    updated_at = datetime('now') WHERE id = NEW.invoice_id;
END;
CREATE TRIGGER financial_payments_after_delete AFTER DELETE ON invoice_payments BEGIN
  UPDATE invoices SET amount_paid = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = OLD.invoice_id), 0),
    status = CASE WHEN total <= COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = OLD.invoice_id), 0) + 0.005
                  THEN 'paid' WHEN status = 'paid' THEN 'sent' ELSE status END,
    updated_at = datetime('now') WHERE id = OLD.invoice_id;
END;

CREATE TRIGGER financial_credits_insert BEFORE INSERT ON credit_notes
WHEN NEW.amount <= 0 OR date(NEW.issue_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0)
     + COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Credit must be positive and cannot exceed the invoice balance'); END;
CREATE TRIGGER financial_credits_update BEFORE UPDATE ON credit_notes
WHEN NEW.amount <= 0 OR date(NEW.issue_date) IS NULL
  OR NEW.amount + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id AND id <> OLD.id), 0)
     + COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0)
     > COALESCE((SELECT total FROM invoices WHERE id = NEW.invoice_id), 0) + 0.005
BEGIN SELECT RAISE(ABORT, 'Credit must be positive and cannot exceed the invoice balance'); END;

CREATE TRIGGER financial_credits_after_insert AFTER INSERT ON credit_notes BEGIN
  UPDATE invoices SET status = CASE WHEN total <= amount_paid + COALESCE((SELECT SUM(amount) FROM credit_notes WHERE invoice_id = NEW.invoice_id), 0) + 0.005 THEN 'paid' ELSE status END,
    updated_at = datetime('now') WHERE id = NEW.invoice_id;
END;

ALTER TABLE invoices ADD COLUMN pdf_path TEXT NOT NULL DEFAULT '';
ALTER TABLE invoices ADD COLUMN recurring_auto_create INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN bad_debt_written_off INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN bad_debt_expense_id INTEGER DEFAULT NULL REFERENCES expenses(id);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_tax_year ON invoices(tax_year);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice_id ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice_id ON credit_notes(invoice_id);

INSERT OR IGNORE INTO expense_categories (name, is_system, sort_order)
VALUES ('Bad Debts', 1, 17);

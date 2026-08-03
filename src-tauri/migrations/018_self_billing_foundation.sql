-- Additive foundation for customer-issued invoices and split cash/CIS settlements.
-- Existing invoices remain locally issued and existing payments remain entirely cash.

CREATE TABLE IF NOT EXISTS self_billing_agreements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    start_date TEXT NOT NULL,
    expiry_date TEXT NOT NULL,
    customer_vat_number TEXT NOT NULL DEFAULT '',
    document_id INTEGER DEFAULT NULL REFERENCES documents(id),
    notes TEXT NOT NULL DEFAULT '',
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (date(start_date) IS NOT NULL),
    CHECK (date(expiry_date) IS NOT NULL),
    CHECK (expiry_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_self_billing_agreements_client_dates
ON self_billing_agreements(client_id, start_date, expiry_date)
WHERE archived = 0;

ALTER TABLE invoices ADD COLUMN source_type TEXT NOT NULL DEFAULT 'issued'
    CHECK (source_type IN ('issued', 'self_billed'));
ALTER TABLE invoices ADD COLUMN external_reference TEXT DEFAULT NULL;
ALTER TABLE invoices ADD COLUMN source_document_id INTEGER DEFAULT NULL REFERENCES documents(id);
ALTER TABLE invoices ADD COLUMN self_billing_agreement_id INTEGER DEFAULT NULL REFERENCES self_billing_agreements(id);
ALTER TABLE invoices ADD COLUMN self_billing_checks_confirmed INTEGER NOT NULL DEFAULT 0
    CHECK (self_billing_checks_confirmed IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_self_billed_reference_unique
ON invoices(client_id, external_reference)
WHERE source_type = 'self_billed' AND deleted_at IS NULL;

ALTER TABLE invoice_payments ADD COLUMN cash_amount REAL DEFAULT NULL CHECK (cash_amount IS NULL OR cash_amount >= 0);
ALTER TABLE invoice_payments ADD COLUMN cis_deduction_amount REAL NOT NULL DEFAULT 0 CHECK (cis_deduction_amount >= 0);
ALTER TABLE invoice_payments ADD COLUMN cis_transaction_id INTEGER DEFAULT NULL REFERENCES cis_transactions(id);

UPDATE invoice_payments
SET cash_amount = amount
WHERE cash_amount IS NULL AND cis_deduction_amount = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_payments_cis_unique
ON invoice_payments(cis_transaction_id)
WHERE cis_transaction_id IS NOT NULL;

ALTER TABLE cis_transactions ADD COLUMN invoice_id INTEGER DEFAULT NULL REFERENCES invoices(id);
ALTER TABLE cis_transactions ADD COLUMN invoice_payment_id INTEGER DEFAULT NULL REFERENCES invoice_payments(id);
ALTER TABLE cis_transactions ADD COLUMN source_document_id INTEGER DEFAULT NULL REFERENCES documents(id);
ALTER TABLE cis_transactions ADD COLUMN bank_transaction_id INTEGER DEFAULT NULL REFERENCES bank_transactions(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cis_invoice_payment_unique
ON cis_transactions(invoice_payment_id)
WHERE invoice_payment_id IS NOT NULL AND deleted_at IS NULL;

CREATE TRIGGER self_billing_linked_cis_no_update BEFORE UPDATE ON cis_transactions
WHEN OLD.invoice_payment_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Settlement-linked CIS records must be corrected through the invoice payment'); END;

CREATE TRIGGER self_billing_linked_cis_no_delete BEFORE DELETE ON cis_transactions
WHEN OLD.invoice_payment_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'Settlement-linked CIS records must be corrected through the invoice payment'); END;

CREATE TRIGGER self_billing_evidence_no_archive BEFORE UPDATE OF deleted_at ON documents
WHEN NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL AND (
  EXISTS (SELECT 1 FROM invoices i WHERE i.source_document_id = OLD.id AND i.deleted_at IS NULL)
  OR EXISTS (SELECT 1 FROM self_billing_agreements a WHERE a.document_id = OLD.id AND a.archived = 0)
  OR EXISTS (SELECT 1 FROM cis_transactions ct WHERE ct.source_document_id = OLD.id AND ct.deleted_at IS NULL)
)
BEGIN SELECT RAISE(ABORT, 'Self-billing evidence cannot be archived while its record is active'); END;

CREATE TRIGGER self_billing_agreements_no_overlap_insert BEFORE INSERT ON self_billing_agreements
WHEN NEW.archived = 0 AND EXISTS (
  SELECT 1 FROM self_billing_agreements a
  WHERE a.client_id = NEW.client_id AND a.archived = 0
    AND NEW.start_date <= a.expiry_date AND NEW.expiry_date >= a.start_date
)
BEGIN SELECT RAISE(ABORT, 'Self-billing agreement dates overlap an active agreement'); END;

CREATE TRIGGER self_billing_agreements_no_overlap_update BEFORE UPDATE ON self_billing_agreements
WHEN NEW.archived = 0 AND EXISTS (
  SELECT 1 FROM self_billing_agreements a
  WHERE a.client_id = NEW.client_id AND a.archived = 0 AND a.id <> OLD.id
    AND NEW.start_date <= a.expiry_date AND NEW.expiry_date >= a.start_date
)
BEGIN SELECT RAISE(ABORT, 'Self-billing agreement dates overlap an active agreement'); END;

CREATE TRIGGER self_billing_invoices_insert BEFORE INSERT ON invoices
WHEN (NEW.source_type = 'self_billed' AND (
        NEW.is_quote <> 0 OR NEW.is_recurring <> 0 OR NEW.status = 'draft'
        OR NEW.external_reference IS NULL OR trim(NEW.external_reference) = ''
        OR NEW.source_document_id IS NULL
      ))
   OR (NEW.source_type = 'issued' AND NEW.external_reference IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Self-billed invoice identity or evidence is invalid'); END;

CREATE TRIGGER self_billing_invoices_update BEFORE UPDATE ON invoices
WHEN (NEW.source_type <> OLD.source_type)
   OR (NEW.source_type = 'self_billed' AND (
        NEW.is_quote <> 0 OR NEW.is_recurring <> 0 OR NEW.status = 'draft'
        OR NEW.external_reference IS NULL OR trim(NEW.external_reference) = ''
        OR NEW.source_document_id IS NULL
      ))
   OR (NEW.source_type = 'issued' AND NEW.external_reference IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'Self-billed invoice identity or evidence is invalid'); END;

CREATE TRIGGER self_billing_payments_insert BEFORE INSERT ON invoice_payments
WHEN (NEW.cash_amount IS NOT NULL AND abs(NEW.amount - NEW.cash_amount - NEW.cis_deduction_amount) > 0.01)
  OR (NEW.cis_deduction_amount = 0 AND NEW.cis_transaction_id IS NOT NULL)
  OR (NEW.cis_deduction_amount > 0 AND NEW.cis_transaction_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'Payment cash and CIS split does not equal the settled amount'); END;

CREATE TRIGGER self_billing_payments_default_cash AFTER INSERT ON invoice_payments
WHEN NEW.cash_amount IS NULL
BEGIN
  UPDATE invoice_payments SET cash_amount = NEW.amount WHERE id = NEW.id;
END;

CREATE TRIGGER self_billing_payments_update BEFORE UPDATE ON invoice_payments
WHEN NEW.cash_amount IS NULL
  OR abs(NEW.amount - NEW.cash_amount - NEW.cis_deduction_amount) > 0.01
  OR (NEW.cis_deduction_amount = 0 AND NEW.cis_transaction_id IS NOT NULL)
  OR (NEW.cis_deduction_amount > 0 AND NEW.cis_transaction_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'Payment cash and CIS split does not equal the settled amount'); END;

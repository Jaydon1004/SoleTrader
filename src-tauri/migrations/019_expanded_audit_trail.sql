CREATE TRIGGER audit_payments_insert AFTER INSERT ON invoice_payments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice_payment', NEW.id, 'create', json_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'payment_date', NEW.payment_date));
END;
CREATE TRIGGER audit_payments_update AFTER UPDATE ON invoice_payments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice_payment', NEW.id, 'update', json_object('before', json_object('amount', OLD.amount, 'payment_date', OLD.payment_date), 'after', json_object('amount', NEW.amount, 'payment_date', NEW.payment_date)));
END;
CREATE TRIGGER audit_payments_delete AFTER DELETE ON invoice_payments BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice_payment', OLD.id, 'delete', json_object('invoice_id', OLD.invoice_id, 'amount', OLD.amount));
END;

CREATE TRIGGER audit_credit_notes_insert AFTER INSERT ON credit_notes BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('credit_note', NEW.id, 'create', json_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'issue_date', NEW.issue_date));
END;
CREATE TRIGGER audit_credit_notes_update AFTER UPDATE ON credit_notes BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('credit_note', NEW.id, 'update', json_object('before', json_object('amount', OLD.amount, 'reason', OLD.reason), 'after', json_object('amount', NEW.amount, 'reason', NEW.reason)));
END;
CREATE TRIGGER audit_credit_notes_delete AFTER DELETE ON credit_notes BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('credit_note', OLD.id, 'delete', json_object('invoice_id', OLD.invoice_id, 'amount', OLD.amount));
END;

CREATE TRIGGER audit_profile_update AFTER UPDATE ON user_profile BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('profile', NEW.id, 'update', json_object('before', json_object('accounting_basis', OLD.accounting_basis, 'vat_status', OLD.vat_status, 'vat_scheme', OLD.vat_scheme), 'after', json_object('accounting_basis', NEW.accounting_basis, 'vat_status', NEW.vat_status, 'vat_scheme', NEW.vat_scheme)));
END;
CREATE TRIGGER audit_tax_year_update AFTER UPDATE ON tax_year_config BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('tax_year_config', NEW.id, 'update', json_object('tax_year', NEW.tax_year, 'before', json_object('personal_allowance', OLD.personal_allowance, 'vat_standard_rate_percent', OLD.vat_standard_rate_percent), 'after', json_object('personal_allowance', NEW.personal_allowance, 'vat_standard_rate_percent', NEW.vat_standard_rate_percent)));
END;
CREATE TRIGGER audit_vat_settings_update AFTER UPDATE ON vat_settings BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vat_settings', NEW.id, 'update', json_object('before', json_object('quarter_start_month', OLD.quarter_start_month, 'mtd_enabled', OLD.mtd_enabled), 'after', json_object('quarter_start_month', NEW.quarter_start_month, 'mtd_enabled', NEW.mtd_enabled)));
END;
CREATE TRIGGER audit_reconciliation_settings_update AFTER UPDATE ON bank_reconciliation_settings BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('bank_reconciliation_settings', NEW.id, 'update', json_object('before', json_object('days', OLD.match_tolerance_days, 'amount', OLD.amount_tolerance), 'after', json_object('days', NEW.match_tolerance_days, 'amount', NEW.amount_tolerance)));
END;

CREATE TRIGGER audit_tax_inputs_insert AFTER INSERT ON tax_calculator_inputs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('tax_calculator_input', 0, 'create', json_object('tax_year', NEW.tax_year));
END;
CREATE TRIGGER audit_tax_inputs_update AFTER UPDATE ON tax_calculator_inputs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('tax_calculator_input', 0, 'update', json_object('tax_year', NEW.tax_year));
END;
CREATE TRIGGER audit_tax_inputs_delete AFTER DELETE ON tax_calculator_inputs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('tax_calculator_input', 0, 'delete', json_object('tax_year', OLD.tax_year));
END;

CREATE TRIGGER audit_bank_import_batch AFTER INSERT ON bank_import_batches BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('bank_import', NEW.id, 'create', json_object('source_file', NEW.source_file, 'imported_rows', NEW.imported_rows, 'duplicate_rows', NEW.duplicate_rows, 'date_from', NEW.date_from, 'date_to', NEW.date_to));
END;

CREATE TRIGGER audit_self_billing_agreement_insert AFTER INSERT ON self_billing_agreements BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('self_billing_agreement', NEW.id, 'create', json_object('client_id', NEW.client_id, 'start_date', NEW.start_date, 'expiry_date', NEW.expiry_date));
END;
CREATE TRIGGER audit_self_billing_agreement_update AFTER UPDATE ON self_billing_agreements BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('self_billing_agreement', NEW.id, CASE WHEN OLD.archived = 0 AND NEW.archived = 1 THEN 'delete' ELSE 'update' END, json_object('before', json_object('start_date', OLD.start_date, 'expiry_date', OLD.expiry_date, 'archived', OLD.archived), 'after', json_object('start_date', NEW.start_date, 'expiry_date', NEW.expiry_date, 'archived', NEW.archived)));
END;

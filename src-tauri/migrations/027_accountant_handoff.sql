CREATE TABLE year_end_handoff_details (
  tax_year TEXT PRIMARY KEY REFERENCES tax_year_config(tax_year) ON DELETE CASCADE,
  stock_value REAL NOT NULL DEFAULT 0 CHECK (stock_value >= 0),
  cash_on_hand REAL NOT NULL DEFAULT 0 CHECK (cash_on_hand >= 0),
  loans_balance REAL NOT NULL DEFAULT 0 CHECK (loans_balance >= 0),
  hire_purchase_balance REAL NOT NULL DEFAULT 0 CHECK (hire_purchase_balance >= 0),
  capital_introduced REAL NOT NULL DEFAULT 0 CHECK (capital_introduced >= 0),
  drawings REAL NOT NULL DEFAULT 0 CHECK (drawings >= 0),
  private_use_notes TEXT NOT NULL DEFAULT '',
  home_office_notes TEXT NOT NULL DEFAULT '',
  other_year_end_notes TEXT NOT NULL DEFAULT '',
  employment_details TEXT NOT NULL DEFAULT '',
  pension_details TEXT NOT NULL DEFAULT '',
  interest_details TEXT NOT NULL DEFAULT '',
  dividend_details TEXT NOT NULL DEFAULT '',
  benefit_details TEXT NOT NULL DEFAULT '',
  student_loan_details TEXT NOT NULL DEFAULT '',
  payments_on_account_details TEXT NOT NULL DEFAULT '',
  questionnaire_complete INTEGER NOT NULL DEFAULT 0 CHECK (questionnaire_complete IN (0, 1)),
  personal_tax_complete INTEGER NOT NULL DEFAULT 0 CHECK (personal_tax_complete IN (0, 1)),
  approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0, 1)),
  approved_by TEXT NOT NULL DEFAULT '',
  approved_at TEXT,
  declaration TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE bank_year_end_confirmations (
  tax_year TEXT NOT NULL REFERENCES tax_year_config(tax_year) ON DELETE CASCADE,
  bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  statement_start TEXT NOT NULL DEFAULT '',
  statement_end TEXT NOT NULL DEFAULT '',
  closing_balance REAL NOT NULL DEFAULT 0,
  confirmed_complete INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_complete IN (0, 1)),
  notes TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tax_year, bank_account_id)
);

CREATE INDEX bank_year_end_confirmations_year_idx
  ON bank_year_end_confirmations(tax_year);

CREATE TRIGGER audit_year_end_handoff_insert AFTER INSERT ON year_end_handoff_details BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('year_end_handoff', 0, 'create', json_object(
    'tax_year', NEW.tax_year,
    'questionnaire_complete', NEW.questionnaire_complete,
    'personal_tax_complete', NEW.personal_tax_complete,
    'approved', NEW.approved,
    'approved_by', NEW.approved_by
  ));
END;

CREATE TRIGGER audit_year_end_handoff_update AFTER UPDATE ON year_end_handoff_details BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('year_end_handoff', 0, 'update', json_object(
    'tax_year', NEW.tax_year,
    'questionnaire_complete', NEW.questionnaire_complete,
    'personal_tax_complete', NEW.personal_tax_complete,
    'approved', NEW.approved,
    'approved_by', NEW.approved_by
  ));
END;

CREATE TRIGGER audit_bank_year_end_insert AFTER INSERT ON bank_year_end_confirmations BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('bank_year_end_confirmation', NEW.bank_account_id, 'create', json_object(
    'tax_year', NEW.tax_year,
    'statement_start', NEW.statement_start,
    'statement_end', NEW.statement_end,
    'closing_balance', NEW.closing_balance,
    'confirmed_complete', NEW.confirmed_complete
  ));
END;

CREATE TRIGGER audit_bank_year_end_update AFTER UPDATE ON bank_year_end_confirmations BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('bank_year_end_confirmation', NEW.bank_account_id, 'update', json_object(
    'tax_year', NEW.tax_year,
    'statement_start', NEW.statement_start,
    'statement_end', NEW.statement_end,
    'closing_balance', NEW.closing_balance,
    'confirmed_complete', NEW.confirmed_complete
  ));
END;
CREATE TABLE hmrc_filing_details (
  tax_year TEXT PRIMARY KEY REFERENCES tax_year_config(tax_year) ON DELETE CASCADE,
  business_started INTEGER NOT NULL DEFAULT 0 CHECK (business_started IN (0, 1)),
  start_date TEXT NOT NULL DEFAULT '',
  business_ceased INTEGER NOT NULL DEFAULT 0 CHECK (business_ceased IN (0, 1)),
  cessation_date TEXT NOT NULL DEFAULT '',
  business_details_changed INTEGER NOT NULL DEFAULT 0 CHECK (business_details_changed IN (0, 1)),
  multiple_businesses INTEGER NOT NULL DEFAULT 0 CHECK (multiple_businesses IN (0, 1)),
  special_arrangements INTEGER NOT NULL DEFAULT 0 CHECK (special_arrangements IN (0, 1)),
  provisional_figures INTEGER NOT NULL DEFAULT 0 CHECK (provisional_figures IN (0, 1)),
  goods_own_use REAL NOT NULL DEFAULT 0 CHECK (goods_own_use >= 0),
  other_business_income REAL NOT NULL DEFAULT 0 CHECK (other_business_income >= 0),
  non_taxable_business_income REAL NOT NULL DEFAULT 0 CHECK (non_taxable_business_income >= 0),
  disallowable_expenses REAL NOT NULL DEFAULT 0 CHECK (disallowable_expenses >= 0),
  basis_period_adjustment REAL NOT NULL DEFAULT 0,
  accounting_practice_adjustment REAL NOT NULL DEFAULT 0,
  averaging_adjustment REAL NOT NULL DEFAULT 0,
  transition_profit REAL NOT NULL DEFAULT 0 CHECK (transition_profit >= 0),
  transition_profit_loss_relief REAL NOT NULL DEFAULT 0 CHECK (transition_profit_loss_relief >= 0),
  loss_brought_forward REAL NOT NULL DEFAULT 0 CHECK (loss_brought_forward >= 0),
  current_loss_other_income REAL NOT NULL DEFAULT 0 CHECK (current_loss_other_income >= 0),
  current_loss_carry_back REAL NOT NULL DEFAULT 0 CHECK (current_loss_carry_back >= 0),
  loss_carry_forward REAL NOT NULL DEFAULT 0 CHECK (loss_carry_forward >= 0),
  other_tax_taken_off REAL NOT NULL DEFAULT 0 CHECK (other_tax_taken_off >= 0),
  class2_voluntary INTEGER NOT NULL DEFAULT 0 CHECK (class2_voluntary IN (0, 1)),
  class4_exempt INTEGER NOT NULL DEFAULT 0 CHECK (class4_exempt IN (0, 1)),
  other_information TEXT NOT NULL DEFAULT '',
  unsupported_circumstances_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (unsupported_circumstances_confirmed IN (0, 1)),
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER audit_hmrc_filing_details_insert AFTER INSERT ON hmrc_filing_details BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('hmrc_filing_details', 0, 'create', json_object(
    'tax_year', NEW.tax_year,
    'reviewed', NEW.reviewed,
    'provisional_figures', NEW.provisional_figures
  ));
END;

CREATE TRIGGER audit_hmrc_filing_details_update AFTER UPDATE ON hmrc_filing_details BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('hmrc_filing_details', 0, 'update', json_object(
    'tax_year', NEW.tax_year,
    'reviewed', NEW.reviewed,
    'provisional_figures', NEW.provisional_figures
  ));
END;
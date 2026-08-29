ALTER TABLE direct_income ADD COLUMN gross_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE direct_income ADD COLUMN cis_rate REAL NOT NULL DEFAULT 0 CHECK (cis_rate IN (0, 20, 30));
ALTER TABLE direct_income ADD COLUMN cis_deduction_amount REAL NOT NULL DEFAULT 0 CHECK (cis_deduction_amount >= 0);
ALTER TABLE direct_income ADD COLUMN cis_party_name TEXT NOT NULL DEFAULT '';
ALTER TABLE direct_income ADD COLUMN cis_party_utr TEXT NOT NULL DEFAULT '';
ALTER TABLE direct_income ADD COLUMN evidence_document_id INTEGER DEFAULT NULL REFERENCES documents(id);

UPDATE direct_income SET gross_amount = amount WHERE gross_amount = 0;

CREATE TRIGGER IF NOT EXISTS direct_income_cis_values
BEFORE INSERT ON direct_income
WHEN NEW.gross_amount <= 0 OR NEW.cis_deduction_amount < 0
  OR NEW.cis_deduction_amount > NEW.gross_amount
  OR abs(NEW.amount - NEW.gross_amount + NEW.cis_deduction_amount) > 0.01
  OR NEW.cis_rate NOT IN (0, 20, 30)
BEGIN SELECT RAISE(ABORT, 'Direct income CIS values do not reconcile'); END;

CREATE TRIGGER IF NOT EXISTS direct_income_cis_values_update
BEFORE UPDATE ON direct_income
WHEN NEW.gross_amount <= 0 OR NEW.cis_deduction_amount < 0
  OR NEW.cis_deduction_amount > NEW.gross_amount
  OR abs(NEW.amount - NEW.gross_amount + NEW.cis_deduction_amount) > 0.01
  OR NEW.cis_rate NOT IN (0, 20, 30)
BEGIN SELECT RAISE(ABORT, 'Direct income CIS values do not reconcile'); END;

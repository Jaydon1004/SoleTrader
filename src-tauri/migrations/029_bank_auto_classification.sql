ALTER TABLE bank_transactions
ADD COLUMN auto_classified INTEGER NOT NULL DEFAULT 0 CHECK (auto_classified IN (0, 1));
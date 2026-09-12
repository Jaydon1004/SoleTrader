ALTER TABLE expenses
ADD COLUMN paid_personally INTEGER NOT NULL DEFAULT 0
CHECK (paid_personally IN (0, 1));
ALTER TABLE bank_rules
ADD COLUMN account_use TEXT NOT NULL DEFAULT 'all'
CHECK (account_use IN ('all', 'business', 'mixed', 'personal'));
ALTER TABLE bank_accounts
ADD COLUMN account_use TEXT NOT NULL DEFAULT 'business'
CHECK (account_use IN ('business', 'mixed', 'personal'));

DROP INDEX IF EXISTS idx_bank_transactions_hash_unique;
CREATE UNIQUE INDEX idx_bank_transactions_account_hash_unique
ON bank_transactions(bank_account_id, hash) WHERE hash != '';
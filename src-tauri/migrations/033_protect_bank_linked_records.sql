CREATE TRIGGER protect_bank_linked_expense_delete
BEFORE UPDATE OF deleted_at ON expenses
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM bank_transactions
    WHERE matched_expense_id = OLD.id AND status = 'matched'
  )
BEGIN
  SELECT RAISE(ABORT, 'Unmatch the linked bank transaction before deleting this expense.');
END;

CREATE TRIGGER protect_bank_linked_income_delete
BEFORE UPDATE OF deleted_at ON direct_income
WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM bank_transactions
    WHERE matched_income_id = OLD.id AND status = 'matched'
  )
BEGIN
  SELECT RAISE(ABORT, 'Unmatch the linked bank transaction before deleting this income record.');
END;
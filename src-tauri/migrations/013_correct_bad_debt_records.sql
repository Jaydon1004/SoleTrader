UPDATE invoices
SET bad_debt_expense_id = NULL,
    updated_at = datetime('now')
WHERE bad_debt_written_off = 1
  AND EXISTS (
    SELECT 1 FROM user_profile WHERE id = 1 AND accounting_basis = 'cash'
  );

DELETE FROM expenses
WHERE is_bad_debt = 1
  AND EXISTS (
    SELECT 1 FROM user_profile WHERE id = 1 AND accounting_basis = 'cash'
  );

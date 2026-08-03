ALTER TABLE expenses ADD COLUMN recurring_auto_create INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier);
CREATE INDEX IF NOT EXISTS idx_expenses_recurring_next_date ON expenses(recurring_next_date);
CREATE INDEX IF NOT EXISTS idx_documents_linked_expense_id ON documents(linked_expense_id);

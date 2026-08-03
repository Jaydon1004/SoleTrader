ALTER TABLE documents ADD COLUMN document_date TEXT DEFAULT '';
ALTER TABLE documents ADD COLUMN ocr_status TEXT NOT NULL DEFAULT 'not_started' CHECK (ocr_status IN ('not_started', 'processing', 'review', 'complete', 'failed'));
ALTER TABLE documents ADD COLUMN ocr_supplier TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN ocr_date TEXT NOT NULL DEFAULT '';
ALTER TABLE documents ADD COLUMN ocr_total REAL NOT NULL DEFAULT 0 CHECK (ocr_total >= 0);
ALTER TABLE documents ADD COLUMN ocr_vat REAL NOT NULL DEFAULT 0 CHECK (ocr_vat >= 0);
ALTER TABLE documents ADD COLUMN ocr_category_id INTEGER DEFAULT NULL REFERENCES expense_categories(id);
ALTER TABLE documents ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

UPDATE documents
SET document_date = COALESCE(
      (SELECT date FROM expenses WHERE expenses.id = documents.linked_expense_id),
      created_at
    ),
    updated_at = created_at
WHERE document_date = '' OR updated_at = '';

CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_document_date ON documents(document_date);
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status ON documents(ocr_status);

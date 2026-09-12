ALTER TABLE hmrc_filing_details
ADD COLUMN opening_stock REAL NOT NULL DEFAULT 0 CHECK (opening_stock >= 0);
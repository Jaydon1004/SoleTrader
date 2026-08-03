CREATE TABLE vat_return_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    tax_year TEXT NOT NULL REFERENCES tax_year_config(tax_year),
    scheme TEXT NOT NULL,
    box1 REAL NOT NULL,
    box2 REAL NOT NULL,
    box3 REAL NOT NULL,
    box4 REAL NOT NULL,
    box5 REAL NOT NULL,
    box6 REAL NOT NULL,
    box7 REAL NOT NULL,
    box8 REAL NOT NULL,
    box9 REAL NOT NULL,
    filed_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(period_start, period_end)
);

CREATE TRIGGER vat_return_snapshots_no_update
BEFORE UPDATE ON vat_return_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Filed VAT return snapshots cannot be changed');
END;

CREATE TRIGGER vat_return_snapshots_no_delete
BEFORE DELETE ON vat_return_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Filed VAT return snapshots cannot be deleted');
END;

CREATE TRIGGER audit_vat_return_filed AFTER INSERT ON vat_return_snapshots BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes)
  VALUES('vat_return', NEW.id, 'create', json_object('period_start', NEW.period_start, 'period_end', NEW.period_end, 'box5', NEW.box5));
END;

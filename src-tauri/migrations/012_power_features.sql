CREATE INDEX IF NOT EXISTS idx_clients_search ON clients(name, company, email);
CREATE INDEX IF NOT EXISTS idx_invoices_search ON invoices(invoice_number, issue_date, status);
CREATE INDEX IF NOT EXISTS idx_invoices_deleted ON invoices(deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenses_search ON expenses(supplier, date, category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted ON expenses(deleted_at);
CREATE INDEX IF NOT EXISTS idx_documents_search ON documents(file_name, category, tax_year);
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at);
CREATE INDEX IF NOT EXISTS idx_mileage_deleted ON mileage_logs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_deleted ON vehicle_costs(deleted_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

CREATE TRIGGER IF NOT EXISTS audit_clients_insert AFTER INSERT ON clients BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('client', NEW.id, 'create', json_object('name', NEW.name, 'company', NEW.company));
END;
CREATE TRIGGER IF NOT EXISTS audit_clients_update AFTER UPDATE ON clients BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('client', NEW.id,
    CASE WHEN OLD.archived = 0 AND NEW.archived = 1 THEN 'delete' WHEN OLD.archived = 1 AND NEW.archived = 0 THEN 'restore' ELSE 'update' END,
    json_object('before', json_object('name', OLD.name, 'company', OLD.company, 'archived', OLD.archived), 'after', json_object('name', NEW.name, 'company', NEW.company, 'archived', NEW.archived)));
END;
CREATE TRIGGER IF NOT EXISTS audit_clients_delete AFTER DELETE ON clients BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('client', OLD.id, 'delete', json_object('name', OLD.name));
END;

CREATE TRIGGER IF NOT EXISTS audit_invoices_insert AFTER INSERT ON invoices BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice', NEW.id, 'create', json_object('number', NEW.invoice_number, 'total', NEW.total));
END;
CREATE TRIGGER IF NOT EXISTS audit_invoices_update AFTER UPDATE ON invoices BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('number', NEW.invoice_number, 'before', json_object('status', OLD.status, 'total', OLD.total), 'after', json_object('status', NEW.status, 'total', NEW.total)));
END;
CREATE TRIGGER IF NOT EXISTS audit_invoices_delete AFTER DELETE ON invoices BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('invoice', OLD.id, 'delete', json_object('number', OLD.invoice_number));
END;

CREATE TRIGGER IF NOT EXISTS audit_expenses_insert AFTER INSERT ON expenses BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('expense', NEW.id, 'create', json_object('description', NEW.description, 'amount', NEW.amount));
END;
CREATE TRIGGER IF NOT EXISTS audit_expenses_update AFTER UPDATE ON expenses BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('expense', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('description', NEW.description, 'before', json_object('amount', OLD.amount, 'category_id', OLD.category_id), 'after', json_object('amount', NEW.amount, 'category_id', NEW.category_id)));
END;
CREATE TRIGGER IF NOT EXISTS audit_expenses_delete AFTER DELETE ON expenses BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('expense', OLD.id, 'delete', json_object('description', OLD.description));
END;

CREATE TRIGGER IF NOT EXISTS audit_vehicles_insert AFTER INSERT ON vehicles BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle', NEW.id, 'create', json_object('name', NEW.name, 'registration', NEW.registration));
END;
CREATE TRIGGER IF NOT EXISTS audit_vehicles_update AFTER UPDATE ON vehicles BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle', NEW.id,
    CASE WHEN OLD.archived = 0 AND NEW.archived = 1 THEN 'delete' WHEN OLD.archived = 1 AND NEW.archived = 0 THEN 'restore' ELSE 'update' END,
    json_object('name', NEW.name, 'before', json_object('registration', OLD.registration, 'archived', OLD.archived), 'after', json_object('registration', NEW.registration, 'archived', NEW.archived)));
END;
CREATE TRIGGER IF NOT EXISTS audit_vehicles_delete AFTER DELETE ON vehicles BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle', OLD.id, 'delete', json_object('name', OLD.name));
END;

CREATE TRIGGER IF NOT EXISTS audit_mileage_insert AFTER INSERT ON mileage_logs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('mileage', NEW.id, 'create', json_object('date', NEW.date, 'purpose', NEW.purpose, 'miles', NEW.distance_miles));
END;
CREATE TRIGGER IF NOT EXISTS audit_mileage_update AFTER UPDATE ON mileage_logs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('mileage', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('purpose', NEW.purpose, 'before', OLD.distance_miles, 'after', NEW.distance_miles));
END;
CREATE TRIGGER IF NOT EXISTS audit_mileage_delete AFTER DELETE ON mileage_logs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('mileage', OLD.id, 'delete', json_object('purpose', OLD.purpose));
END;

CREATE TRIGGER IF NOT EXISTS audit_vehicle_costs_insert AFTER INSERT ON vehicle_costs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle_cost', NEW.id, 'create', json_object('description', NEW.description, 'amount', NEW.amount));
END;
CREATE TRIGGER IF NOT EXISTS audit_vehicle_costs_update AFTER UPDATE ON vehicle_costs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle_cost', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('description', NEW.description, 'before', OLD.amount, 'after', NEW.amount));
END;
CREATE TRIGGER IF NOT EXISTS audit_vehicle_costs_delete AFTER DELETE ON vehicle_costs BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('vehicle_cost', OLD.id, 'delete', json_object('description', OLD.description));
END;

CREATE TRIGGER IF NOT EXISTS audit_documents_insert AFTER INSERT ON documents BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('document', NEW.id, 'create', json_object('file_name', NEW.file_name, 'category', NEW.category));
END;
CREATE TRIGGER IF NOT EXISTS audit_documents_update AFTER UPDATE ON documents BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('document', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('file_name', NEW.file_name, 'before', OLD.category, 'after', NEW.category));
END;
CREATE TRIGGER IF NOT EXISTS audit_documents_delete AFTER DELETE ON documents BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('document', OLD.id, 'delete', json_object('file_name', OLD.file_name));
END;

CREATE TRIGGER IF NOT EXISTS audit_assets_insert AFTER INSERT ON capital_assets BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('capital_asset', NEW.id, 'create', json_object('name', NEW.name, 'price', NEW.purchase_price));
END;
CREATE TRIGGER IF NOT EXISTS audit_assets_update AFTER UPDATE ON capital_assets BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('capital_asset', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('name', NEW.name, 'before', OLD.purchase_price, 'after', NEW.purchase_price));
END;
CREATE TRIGGER IF NOT EXISTS audit_assets_delete AFTER DELETE ON capital_assets BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('capital_asset', OLD.id, 'delete', json_object('name', OLD.name));
END;

CREATE TRIGGER IF NOT EXISTS audit_cis_insert AFTER INSERT ON cis_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('cis', NEW.id, 'create', json_object('party', NEW.party_name, 'gross', NEW.gross_amount));
END;
CREATE TRIGGER IF NOT EXISTS audit_cis_update AFTER UPDATE ON cis_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('cis', NEW.id,
    CASE WHEN OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN 'delete' WHEN OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN 'restore' ELSE 'update' END,
    json_object('party', NEW.party_name, 'before', OLD.gross_amount, 'after', NEW.gross_amount));
END;
CREATE TRIGGER IF NOT EXISTS audit_cis_delete AFTER DELETE ON cis_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('cis', OLD.id, 'delete', json_object('party', OLD.party_name));
END;

CREATE TRIGGER IF NOT EXISTS audit_reminders_insert AFTER INSERT ON reminders BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('reminder', NEW.id, 'create', json_object('title', NEW.title, 'due_date', NEW.due_date));
END;
CREATE TRIGGER IF NOT EXISTS audit_reminders_update AFTER UPDATE ON reminders BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('reminder', NEW.id,
    CASE WHEN OLD.dismissed = 0 AND NEW.dismissed = 1 THEN 'delete' WHEN OLD.dismissed = 1 AND NEW.dismissed = 0 THEN 'restore' ELSE 'update' END,
    json_object('title', NEW.title, 'before', OLD.due_date, 'after', NEW.due_date));
END;
CREATE TRIGGER IF NOT EXISTS audit_reminders_delete AFTER DELETE ON reminders BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('reminder', OLD.id, 'delete', json_object('title', OLD.title));
END;

CREATE TRIGGER IF NOT EXISTS audit_bank_insert AFTER INSERT ON bank_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('bank_transaction', NEW.id, 'create', json_object('description', NEW.description, 'amount_in', NEW.amount_in, 'amount_out', NEW.amount_out));
END;
CREATE TRIGGER IF NOT EXISTS audit_bank_update AFTER UPDATE ON bank_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('bank_transaction', NEW.id, 'update', json_object('description', NEW.description, 'before', OLD.status, 'after', NEW.status));
END;
CREATE TRIGGER IF NOT EXISTS audit_bank_delete AFTER DELETE ON bank_transactions BEGIN
  INSERT INTO audit_log(entity_type, entity_id, action, changes) VALUES('bank_transaction', OLD.id, 'delete', json_object('description', OLD.description));
END;
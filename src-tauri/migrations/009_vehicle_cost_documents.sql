ALTER TABLE documents ADD COLUMN linked_vehicle_cost_id INTEGER DEFAULT NULL REFERENCES vehicle_costs(id);
CREATE INDEX IF NOT EXISTS idx_documents_linked_vehicle_cost_id ON documents(linked_vehicle_cost_id);

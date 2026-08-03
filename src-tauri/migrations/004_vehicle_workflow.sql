ALTER TABLE vehicle_costs ADD COLUMN business_percent REAL NOT NULL DEFAULT 100;
ALTER TABLE vehicle_costs ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_vehicle_costs_vehicle_id ON vehicle_costs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_tax_year ON vehicle_costs(tax_year);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_date ON vehicle_costs(date);
CREATE INDEX IF NOT EXISTS idx_mileage_logs_date ON mileage_logs(date);

CREATE TABLE IF NOT EXISTS reminder_dismissals (
    alert_id TEXT PRIMARY KEY,
    dismissed_until TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_deliveries (
    alert_id TEXT NOT NULL,
    delivered_on TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (alert_id, delivered_on)
);

CREATE INDEX IF NOT EXISTS idx_reminder_dismissals_until ON reminder_dismissals(dismissed_until);
CREATE INDEX IF NOT EXISTS idx_reminder_deliveries_date ON reminder_deliveries(delivered_on);
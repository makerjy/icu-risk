CREATE TABLE IF NOT EXISTS patient_alert_rules (
    patient_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    name TEXT NOT NULL,
    risk_threshold INTEGER NOT NULL,
    sustained_duration INTEGER NOT NULL,
    rate_of_change_threshold INTEGER NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (patient_id, rule_id)
);

CREATE TABLE IF NOT EXISTS favorites (
    patient_id TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_logs (
    id BIGSERIAL PRIMARY KEY,
    patient_id TEXT NOT NULL,
    bed_number TEXT,
    ward TEXT,
    rule_name TEXT,
    status TEXT,
    risk_at_trigger INTEGER,
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_by TEXT,
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_logs_patient ON alert_logs (patient_id);
CREATE INDEX IF NOT EXISTS idx_alert_logs_triggered_at ON alert_logs (triggered_at);

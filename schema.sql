-- Warranty Tracker schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- 'admin' | 'viewer'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  manufacturer TEXT NOT NULL,          -- 'dell' | 'hp' | 'other'
  model TEXT,
  serial_number TEXT NOT NULL,
  invoice_number TEXT,
  purchase_date TEXT,                  -- ISO date, from invoice or manufacturer lookup
  warranty_end_date TEXT,              -- ISO date, computed or from manufacturer lookup
  warranty_source TEXT,                -- 'manufacturer_api' | 'invoice_ocr' | 'manual' | 'csv_import'
  status TEXT NOT NULL DEFAULT 'pending', -- 'active' | 'expiring_soon' | 'expired' | 'unknown' | 'pending'
  invoice_image_url TEXT,
  raw_lookup_json TEXT,                -- last raw response from manufacturer API, for debugging/audit
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_devices_org ON devices(org_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_invoice ON devices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_devices_warranty_end ON devices(warranty_end_date);

CREATE TABLE IF NOT EXISTS notifications_log (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  device_id TEXT NOT NULL REFERENCES devices(id),
  channel TEXT NOT NULL,     -- 'email' | 'slack'
  sent_at TEXT NOT NULL DEFAULT (datetime('now')),
  days_before_expiry INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organizations(id),
  filename TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_success INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing' | 'done' | 'failed'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

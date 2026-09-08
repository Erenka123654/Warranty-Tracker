export interface Env {
  DB: D1Database;
  APP_NAME: string;
  JWT_SECRET: string;
  DELL_CLIENT_ID?: string;
  DELL_CLIENT_SECRET?: string;
  HP_CLIENT_ID?: string;
  HP_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
}

export type DeviceStatus = 'active' | 'expiring_soon' | 'expired' | 'unknown' | 'pending';

export interface Device {
  id: string;
  org_id: string;
  manufacturer: string;
  model: string | null;
  serial_number: string;
  invoice_number: string | null;
  purchase_date: string | null;
  warranty_end_date: string | null;
  warranty_source: string | null;
  status: DeviceStatus;
  invoice_image_url: string | null;
  raw_lookup_json: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyLookupResult {
  found: boolean;
  purchaseDate?: string | null;
  warrantyEndDate?: string | null;
  serviceLevel?: string | null;
  model?: string | null;
  raw?: unknown;
  error?: string;
}

export interface WarrantyConnector {
  manufacturer: string;
  lookup(serialNumber: string, env: Env): Promise<WarrantyLookupResult>;
}

import { Hono } from 'hono';
import { Env, Device } from '../types';
import { requireAuth } from './middleware';
import { newId } from '../utils/auth';
import { getConnector, computeStatus } from '../connectors';
import type { JwtPayload } from '../utils/auth';

const devices = new Hono<{ Bindings: Env }>();
devices.use('*', requireAuth);

function user(c: any): JwtPayload {
  return c.get('user');
}

// List all devices for the org, optionally filtered by status or expiring window.
devices.get('/', async (c) => {
  const org = user(c).org;
  const status = c.req.query('status');
  let query = 'SELECT * FROM devices WHERE org_id = ?';
  const binds: any[] = [org];
  if (status) { query += ' AND status = ?'; binds.push(status); }
  query += ' ORDER BY warranty_end_date ASC';
  const { results } = await c.env.DB.prepare(query).bind(...binds).all<Device>();
  return c.json({ devices: results });
});

// Query a single device by serial number or invoice number (as requested: lookup without
// needing to browse the full list).
devices.get('/lookup', async (c) => {
  const org = user(c).org;
  const serial = c.req.query('serial_number');
  const invoice = c.req.query('invoice_number');
  if (!serial && !invoice) return c.json({ error: 'Provide serial_number or invoice_number' }, 400);

  const query = serial
    ? 'SELECT * FROM devices WHERE org_id = ? AND serial_number = ?'
    : 'SELECT * FROM devices WHERE org_id = ? AND invoice_number = ?';
  const device = await c.env.DB.prepare(query).bind(org, serial ?? invoice).first<Device>();
  if (!device) return c.json({ error: 'No matching device found' }, 404);
  return c.json({ device });
});

// Add a device by serial number only -- the manufacturer connector does the rest
// (purchase date + warranty end date), so the user never types product details manually.
devices.post('/', async (c) => {
  const org = user(c).org;
  const body = await c.req.json<{ manufacturer: string; serial_number: string; invoice_number?: string }>();
  if (!body.manufacturer || !body.serial_number) {
    return c.json({ error: 'manufacturer and serial_number are required' }, 400);
  }

  const id = newId('dev');
  const connector = getConnector(body.manufacturer);
  let purchaseDate: string | null = null;
  let warrantyEndDate: string | null = null;
  let source = 'manual';
  let rawJson: string | null = null;

  if (connector) {
    const result = await connector.lookup(body.serial_number, c.env);
    if (result.found) {
      purchaseDate = result.purchaseDate ?? null;
      warrantyEndDate = result.warrantyEndDate ?? null;
      source = 'manufacturer_api';
      rawJson = JSON.stringify(result.raw ?? {});
    }
  }

  const status = computeStatus(warrantyEndDate);

  await c.env.DB.prepare(
    `INSERT INTO devices
      (id, org_id, manufacturer, serial_number, invoice_number, purchase_date, warranty_end_date, warranty_source, status, raw_lookup_json, last_checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    id, org, body.manufacturer.toLowerCase(), body.serial_number, body.invoice_number ?? null,
    purchaseDate, warrantyEndDate, source, status, rawJson
  ).run();

  const device = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first<Device>();
  return c.json({ device }, 201);
});

// Re-run the manufacturer lookup for an existing device (manual refresh).
devices.post('/:id/refresh', async (c) => {
  const org = user(c).org;
  const id = c.req.param('id');
  const device = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ? AND org_id = ?').bind(id, org).first<Device>();
  if (!device) return c.json({ error: 'Device not found' }, 404);

  const connector = getConnector(device.manufacturer);
  if (!connector) return c.json({ error: `No connector available for manufacturer '${device.manufacturer}'` }, 400);

  const result = await connector.lookup(device.serial_number, c.env);
  if (!result.found) return c.json({ error: result.error ?? 'Lookup failed' }, 502);

  const status = computeStatus(result.warrantyEndDate ?? null);
  await c.env.DB.prepare(
    `UPDATE devices SET purchase_date = ?, warranty_end_date = ?, status = ?, raw_lookup_json = ?, last_checked_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`
  ).bind(result.purchaseDate ?? null, result.warrantyEndDate ?? null, status, JSON.stringify(result.raw ?? {}), id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(id).first<Device>();
  return c.json({ device: updated });
});

devices.delete('/:id', async (c) => {
  const org = user(c).org;
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM devices WHERE id = ? AND org_id = ?').bind(id, org).run();
  return c.json({ ok: true });
});

export default devices;

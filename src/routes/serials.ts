import { Hono } from 'hono';
import { Env, DeviceStatus } from '../types';
import { requireAuth } from './middleware';
import { newId } from '../utils/auth';
import { getConnector, computeStatus } from '../connectors';
import type { JwtPayload } from '../utils/auth';

const serialsRoute = new Hono<{ Bindings: Env }>();
serialsRoute.use('*', requireAuth);

function user(c: any): JwtPayload {
  return c.get('user');
}

type SerialRequest = {
  manufacturer: string;
  serials: string[];
};

function cleanSerials(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(
    values
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
  )].slice(0, 100);
}

serialsRoute.post('/', async (c) => {
  const org = user(c).org;
  const body = await c.req.json<SerialRequest>();

  const manufacturer = String(body?.manufacturer ?? '').trim().toLowerCase();
  const serials = cleanSerials(body?.serials);

  if (!['dell', 'hp'].includes(manufacturer)) {
    return c.json({ error: 'manufacturer must be dell or hp' }, 400);
  }

  if (serials.length === 0) {
    return c.json({ error: 'At least one serial number is required' }, 400);
  }

  if (serials.length > 100) {
    return c.json({ error: 'Maximum 100 serial numbers per request' }, 400);
  }

  const connector = getConnector(manufacturer);
  const results: Array<{
    serial_number: string;
    ok: boolean;
    found: boolean;
    status?: DeviceStatus;
    warranty_end_date?: string | null;
    purchase_date?: string | null;
    model?: string | null;
    error?: string;
  }> = [];

  let success = 0;
  let failed = 0;

  for (const serial of serials) {
    try {
      let purchaseDate: string | null = null;
      let warrantyEndDate: string | null = null;
      let model: string | null = null;
      let source = 'serial_import';
      let rawJson: string | null = null;
      let lookupError: string | undefined;

      if (connector) {
        const lookup = await connector.lookup(serial, c.env);

        if (lookup.found) {
          purchaseDate = lookup.purchaseDate ?? null;
          warrantyEndDate = lookup.warrantyEndDate ?? null;
          model = lookup.model ?? null;
          source = 'manufacturer_api';
          rawJson = JSON.stringify(lookup.raw ?? {});
        } else {
          lookupError = lookup.error ?? 'Garanti bilgisi bulunamadı';
          source = 'manufacturer_api';
        }
      } else {
        lookupError = `No connector available for manufacturer '${manufacturer}'`;
      }

      const status = computeStatus(warrantyEndDate);
      const id = newId('dev');

      await c.env.DB.prepare(
        `INSERT INTO devices
          (id, org_id, manufacturer, model, serial_number, invoice_number,
           purchase_date, warranty_end_date, warranty_source, status,
           raw_lookup_json, last_checked_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(org_id, serial_number) DO UPDATE SET
           manufacturer = excluded.manufacturer,
           model = COALESCE(excluded.model, devices.model),
           purchase_date = COALESCE(excluded.purchase_date, devices.purchase_date),
           warranty_end_date = excluded.warranty_end_date,
           warranty_source = excluded.warranty_source,
           status = excluded.status,
           raw_lookup_json = excluded.raw_lookup_json,
           last_checked_at = datetime('now'),
           updated_at = datetime('now')`
      ).bind(
        id,
        org,
        manufacturer,
        model,
        serial,
        purchaseDate,
        warrantyEndDate,
        source,
        status,
        rawJson
      ).run();

      if (lookupError) {
        failed++;
        results.push({
          serial_number: serial,
          ok: false,
          found: false,
          status,
          warranty_end_date: warrantyEndDate,
          purchase_date: purchaseDate,
          model,
          error: lookupError
        });
      } else {
        success++;
        results.push({
          serial_number: serial,
          ok: true,
          found: true,
          status,
          warranty_end_date: warrantyEndDate,
          purchase_date: purchaseDate,
          model
        });
      }
    } catch (err: any) {
      failed++;
      results.push({
        serial_number: serial,
        ok: false,
        found: false,
        error: err?.message ?? String(err)
      });
    }
  }

  return c.json({
    manufacturer,
    total: serials.length,
    success,
    failed,
    results
  });
});

export default serialsRoute;

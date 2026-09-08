import { Hono } from 'hono';
import { Env, Device } from '../types';
import { requireAuth } from './middleware';
import { newId } from '../utils/auth';
import { parseCsv, normalizeImportRow } from '../utils/csv';
import { getConnector, computeStatus } from '../connectors';
import type { JwtPayload } from '../utils/auth';

const importRoute = new Hono<{ Bindings: Env }>();
importRoute.use('*', requireAuth);

function user(c: any): JwtPayload {
  return c.get('user');
}

// Accepts raw CSV text in the request body. Expected columns (flexible aliases, see csv.ts):
// manufacturer, serial_number, model (optional), invoice_number (optional), purchase_date (optional)
// For each row, if a connector exists for the manufacturer, it enriches with a live warranty lookup.
importRoute.post('/csv', async (c) => {
  const org = user(c).org;
  const csvText = await c.req.text();
  if (!csvText.trim()) return c.json({ error: 'Empty CSV body' }, 400);

  const rows = parseCsv(csvText).map(normalizeImportRow).filter(r => r.serial_number);
  const jobId = newId('imp');
  await c.env.DB.prepare(
    'INSERT INTO import_jobs (id, org_id, rows_total, status) VALUES (?, ?, ?, ?)'
  ).bind(jobId, org, rows.length, 'processing').run();

  let success = 0;
  let failed = 0;
  const errors: { serial_number: string; error: string }[] = [];

  for (const row of rows) {
    try {
      const connector = getConnector(row.manufacturer);
      let purchaseDate: string | null = row.purchase_date || null;
      let warrantyEndDate: string | null = null;
      let source = 'csv_import';

      if (connector) {
        const result = await connector.lookup(row.serial_number, c.env);
        if (result.found) {
          purchaseDate = result.purchaseDate ?? purchaseDate;
          warrantyEndDate = result.warrantyEndDate ?? null;
          source = 'manufacturer_api';
        }
      }

      const status = computeStatus(warrantyEndDate);
      const id = newId('dev');
      await c.env.DB.prepare(
        `INSERT INTO devices (id, org_id, manufacturer, model, serial_number, invoice_number, purchase_date, warranty_end_date, warranty_source, status, last_checked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(org_id, serial_number) DO UPDATE SET
           purchase_date=excluded.purchase_date, warranty_end_date=excluded.warranty_end_date,
           status=excluded.status, warranty_source=excluded.warranty_source, updated_at=datetime('now')`
      ).bind(
        id, org, row.manufacturer, row.model || null, row.serial_number, row.invoice_number || null,
        purchaseDate, warrantyEndDate, source, status
      ).run();
      success++;
    } catch (err: any) {
      failed++;
      errors.push({ serial_number: row.serial_number, error: err?.message ?? String(err) });
    }
  }

  await c.env.DB.prepare(
    'UPDATE import_jobs SET rows_success = ?, rows_failed = ?, status = ? WHERE id = ?'
  ).bind(success, failed, 'done', jobId).run();

  return c.json({ jobId, total: rows.length, success, failed, errors });
});

export default importRoute;

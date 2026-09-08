import { Hono } from 'hono';
import { Env } from '../types';
import { requireAuth } from './middleware';
import type { JwtPayload } from '../utils/auth';

const dashboard = new Hono<{ Bindings: Env }>();
dashboard.use('*', requireAuth);

function user(c: any): JwtPayload {
  return c.get('user');
}

dashboard.get('/summary', async (c) => {
  const org = user(c).org;

  const counts = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM devices WHERE org_id = ? GROUP BY status`
  ).bind(org).all<{ status: string; count: number }>();

  const expiringSoon = await c.env.DB.prepare(
    `SELECT id, manufacturer, model, serial_number, warranty_end_date
     FROM devices WHERE org_id = ? AND status = 'expiring_soon'
     ORDER BY warranty_end_date ASC LIMIT 20`
  ).bind(org).all();

  const byManufacturer = await c.env.DB.prepare(
    `SELECT manufacturer, COUNT(*) as count FROM devices WHERE org_id = ? GROUP BY manufacturer`
  ).bind(org).all();

  return c.json({
    statusCounts: counts.results,
    byManufacturer: byManufacturer.results,
    expiringSoon: expiringSoon.results,
  });
});

export default dashboard;

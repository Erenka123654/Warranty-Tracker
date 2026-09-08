import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, Device } from './types';
import authRoutes from './routes/auth';
import deviceRoutes from './routes/devices';
import importRoutes from './routes/import';
import serialsRoutes from './routes/serials';
import dashboardRoutes from './routes/dashboard';
import { computeStatus } from './connectors';
import { sendEmailNotification, sendSlackNotification } from './utils/notify';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.get('/', (c) => c.json({ ok: true, name: c.env.APP_NAME }));

app.route('/api/auth', authRoutes);
app.route('/api/devices', deviceRoutes);
app.route('/api/import', importRoutes);
app.route('/api/import/serials', serialsRoutes);
app.route('/api/dashboard', dashboardRoutes);

export default {
  fetch: app.fetch,

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyCheck(env));
  },
};

async function runDailyCheck(env: Env) {
  const { results } = await env.DB.prepare(
    `SELECT * FROM devices WHERE warranty_end_date IS NOT NULL`
  ).all<Device>();

  for (const device of results ?? []) {
    const newStatus = computeStatus(device.warranty_end_date);

    if (newStatus !== device.status) {
      await env.DB.prepare(
        'UPDATE devices SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(newStatus, device.id).run();
    }

    if (newStatus === 'expiring_soon' && device.warranty_end_date) {
      const daysLeft = Math.ceil(
        (new Date(device.warranty_end_date).getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
      );

      const alreadyNotified = await env.DB.prepare(
        `SELECT id FROM notifications_log WHERE device_id = ? AND days_before_expiry = ?`
      ).bind(device.id, 30).first();

      if (!alreadyNotified && daysLeft <= 30) {
        const { results: admins } = await env.DB.prepare(
          `SELECT email FROM users WHERE org_id = ? AND role = 'admin'`
        ).bind(device.org_id).all<{ email: string }>();

        for (const admin of admins ?? []) {
          await sendEmailNotification(env, admin.email, device, daysLeft);
        }

        await sendSlackNotification(env, device, daysLeft);

        await env.DB.prepare(
          `INSERT INTO notifications_log
            (id, org_id, device_id, channel, days_before_expiry)
           VALUES (?, ?, ?, ?, ?)`
        ).bind(
          `ntf_${crypto.randomUUID().replace(/-/g, '')}`,
          device.org_id,
          device.id,
          'email',
          30
        ).run();
      }
    }
  }
}

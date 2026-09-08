import { Hono } from 'hono';
import { Env } from '../types';
import { hashPassword, verifyPassword, signJwt, newId } from '../utils/auth';

const auth = new Hono<{ Bindings: Env }>();

// Register a new organization + its first admin user.
auth.post('/register', async (c) => {
  const body = await c.req.json<{ orgName: string; email: string; password: string }>();
  if (!body.orgName || !body.email || !body.password) {
    return c.json({ error: 'orgName, email and password are required' }, 400);
  }
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first();
  if (existing) return c.json({ error: 'Email already registered' }, 409);

  const orgId = newId('org');
  const userId = newId('usr');
  const passwordHash = await hashPassword(body.password);

  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').bind(orgId, body.orgName),
    c.env.DB.prepare('INSERT INTO users (id, org_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
      .bind(userId, orgId, body.email, passwordHash, 'admin'),
  ]);

  const token = await signJwt(
    { sub: userId, org: orgId, role: 'admin', exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    c.env.JWT_SECRET
  );
  return c.json({ token, orgId, userId });
});

auth.post('/login', async (c) => {
  const body = await c.req.json<{ email: string; password: string }>();
  const user = await c.env.DB.prepare(
    'SELECT id, org_id, password_hash, role FROM users WHERE email = ?'
  ).bind(body.email).first<{ id: string; org_id: string; password_hash: string; role: string }>();

  if (!user || !(await verifyPassword(body.password, user.password_hash))) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const token = await signJwt(
    { sub: user.id, org: user.org_id, role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 },
    c.env.JWT_SECRET
  );
  return c.json({ token });
});

export default auth;

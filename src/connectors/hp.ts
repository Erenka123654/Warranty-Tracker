import { Env, WarrantyConnector, WarrantyLookupResult } from '../types';

// HP Warranty API (developers.hp.com). Requires enrollment approved by an HP Account
// Manager before HP_CLIENT_ID / HP_CLIENT_SECRET can be issued -- see README for the
// enrollment steps. Endpoint paths below follow HP's published Warranty API shape;
// confirm exact paths/version in your approved HP developer workspace, as HP sometimes
// changes them between the "Warranty API" and "Proactive Insights" product lines.

const TOKEN_URL = 'https://api.hp.com/oauth/v1/token';
const WARRANTY_URL = 'https://api.hp.com/warranty-api/v1/warranty-status';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.token;
  }
  if (!env.HP_CLIENT_ID || !env.HP_CLIENT_SECRET) {
    throw new Error('HP credentials not configured (HP_CLIENT_ID / HP_CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.HP_CLIENT_ID,
    client_secret: env.HP_CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`HP token request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<{ access_token: string; expires_in: number }>();
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

export const hpConnector: WarrantyConnector = {
  manufacturer: 'hp',
  async lookup(serialNumber: string, env: Env): Promise<WarrantyLookupResult> {
    try {
      const token = await getAccessToken(env);
      const res = await fetch(`${WARRANTY_URL}?serialNumber=${encodeURIComponent(serialNumber)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        return { found: false, error: `HP API error ${res.status}: ${await res.text()}` };
      }
      const data = await res.json<any>();
      if (!data || !data.warrantyEndDate) {
        return { found: false, error: 'No warranty data returned for this serial number' };
      }
      return {
        found: true,
        purchaseDate: data.purchaseDate ?? undefined,
        warrantyEndDate: data.warrantyEndDate,
        serviceLevel: data.serviceLevel ?? data.offerDescription,
        raw: data,
      };
    } catch (err: any) {
      return { found: false, error: err?.message ?? String(err) };
    }
  },
};

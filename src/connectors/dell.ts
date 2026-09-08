import { Env, WarrantyConnector, WarrantyLookupResult } from '../types';

// Dell TechDirect Warranty API.
// Requires DELL_CLIENT_ID / DELL_CLIENT_SECRET (apply at https://techdirect.dell.com -> Services > APIs).
// Docs summary: OAuth2 client-credentials grant against apigtwb2c.us.dell.com/auth/oauth/v2/token,
// then GET apigtwb2c.us.dell.com/PROD/sbil/eapi/v5/asset-entitlements?servicetags=<TAG>

const TOKEN_URL = 'https://apigtwb2c.us.dell.com/auth/oauth/v2/token';
const ENTITLEMENTS_URL = 'https://apigtwb2c.us.dell.com/PROD/sbil/eapi/v5/asset-entitlements';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.token;
  }
  if (!env.DELL_CLIENT_ID || !env.DELL_CLIENT_SECRET) {
    throw new Error('Dell credentials not configured (DELL_CLIENT_ID / DELL_CLIENT_SECRET)');
  }
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.DELL_CLIENT_ID,
    client_secret: env.DELL_CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Dell token request failed: ${res.status} ${await res.text()}`);
  }
  const json = await res.json<{ access_token: string; expires_in: number }>();
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return cachedToken.token;
}

export const dellConnector: WarrantyConnector = {
  manufacturer: 'dell',
  async lookup(serialNumber: string, env: Env): Promise<WarrantyLookupResult> {
    try {
      const token = await getAccessToken(env);
      const url = `${ENTITLEMENTS_URL}?servicetags=${encodeURIComponent(serialNumber)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        return { found: false, error: `Dell API error ${res.status}: ${await res.text()}` };
      }
      const data = await res.json<any[]>();
      const asset = Array.isArray(data) ? data[0] : null;
      if (!asset || !asset.entitlements || asset.entitlements.length === 0) {
        return { found: false, error: 'No entitlements found for this service tag' };
      }
      // Dell returns one entry per entitlement/service line; take the one with the latest end date.
      const latest = asset.entitlements.reduce((a: any, b: any) =>
        new Date(a.endDate) > new Date(b.endDate) ? a : b
      );
      return {
        found: true,
        purchaseDate: asset.shipDate ?? undefined,
        warrantyEndDate: latest.endDate,
        serviceLevel: latest.serviceLevelDescription ?? latest.serviceLevelCode,
        raw: asset,
      };
    } catch (err: any) {
      return { found: false, error: err?.message ?? String(err) };
    }
  },
};

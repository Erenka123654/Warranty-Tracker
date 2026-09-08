import { dellConnector } from './dell';
import { hpConnector } from './hp';
import { WarrantyConnector, DeviceStatus } from '../types';

// Registry of manufacturer connectors. Add new brands here (e.g. Lenovo, Cesa, Proset)
// once you have a real API or scraping worker for them.
export const connectors: Record<string, WarrantyConnector> = {
  dell: dellConnector,
  hp: hpConnector,
};

export function getConnector(manufacturer: string): WarrantyConnector | null {
  return connectors[manufacturer.toLowerCase()] ?? null;
}

export function computeStatus(warrantyEndDate: string | null): DeviceStatus {
  if (!warrantyEndDate) return 'unknown';
  const end = new Date(warrantyEndDate).getTime();
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  if (end < now) return 'expired';
  if (end - now <= THIRTY_DAYS) return 'expiring_soon';
  return 'active';
}

import { Env, Device } from '../types';

export async function sendEmailNotification(env: Env, toEmail: string, device: Device, daysLeft: number) {
  if (!env.RESEND_API_KEY) return; // not configured, skip silently
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Warranty Tracker <alerts@yourdomain.com>',
      to: toEmail,
      subject: `Warranty expiring in ${daysLeft} days: ${device.manufacturer.toUpperCase()} ${device.model ?? ''} (${device.serial_number})`,
      text: `Device ${device.serial_number} (${device.manufacturer}) warranty ends on ${device.warranty_end_date}. Consider renewing or replacing it.`,
    }),
  });
}

export async function sendSlackNotification(env: Env, device: Device, daysLeft: number) {
  if (!env.SLACK_WEBHOOK_URL) return; // not configured, skip silently
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `:warning: Warranty expiring in *${daysLeft} days*: *${device.manufacturer.toUpperCase()} ${device.model ?? ''}* (S/N: ${device.serial_number}) — ends ${device.warranty_end_date}`,
    }),
  });
}

// Test scheduler only: the database queue is durable, this computer must stay awake.
import { setTimeout as pause } from 'node:timers/promises';
const base = process.env.REMOTE_APP_URL;
const secret = process.env.CRON_SECRET;
if (!base || new URL(base).protocol !== 'https:' || !secret)
  throw new Error('Set REMOTE_APP_URL and CRON_SECRET locally');
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
const minutes = Number(process.env.REMOTE_WORKER_MINUTES ?? 120);
if (!Number.isFinite(minutes) || minutes < 1 || minutes > 360)
  throw new Error('REMOTE_WORKER_MINUTES must be between 1 and 360');
const deadline = Date.now() + minutes * 60000;
console.log('Remote test scheduler started. Keep this computer awake. No credentials are logged.');
while (!stopping && Date.now() < deadline) {
  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/api/jobs/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(65000),
      redirect: 'error',
    });
    if (!response.ok) console.error(`Remote worker returned HTTP ${response.status}`);
  } catch {
    console.error('Remote worker request failed; durable jobs remain in the database.');
  }
  if (!stopping) await pause(15000);
}

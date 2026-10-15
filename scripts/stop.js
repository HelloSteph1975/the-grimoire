// Asks the running server to back up and shut down. Always exits 0.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 4209;

const validPort = v => {
  const s = String(v).trim();
  const n = /^\d+$/.test(s) ? Number(s) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
};

export function resolvePort(root, env = process.env) {
  if (env.GRIMOIRE_PORT) {
    const p = validPort(env.GRIMOIRE_PORT);
    if (p === null) throw new Error(`GRIMOIRE_PORT must be a whole number from 1 to 65535 (got "${env.GRIMOIRE_PORT}").`);
    return p;
  }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    if (cfg.port != null && validPort(cfg.port) !== null) return validPort(cfg.port);
  } catch { /* no config: use the default */ }
  return DEFAULT_PORT;
}

async function isUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Returns 'stopped', 'not-running' or 'still-running'.
export async function stopServer(port, timeoutMs = 60000, { settleMs = 1000 } = {}) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs) });
    return res.ok ? 'stopped' : 'still-running';
  } catch (err) {
    // Refused outright: nothing was listening.
    if (err?.cause?.code === 'ECONNREFUSED') return 'not-running';
    // Otherwise the server may have closed the socket as it shut down. Check once.
    await new Promise(r => setTimeout(r, settleMs));
    return (await isUp(port)) ? 'still-running' : 'stopped';
  }
}

const same = (a, b) => {
  try { return fs.realpathSync(a) === fs.realpathSync(b); } catch { return false; }
};

if (process.argv[1] && same(process.argv[1], fileURLToPath(import.meta.url))) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let port;
  try { port = resolvePort(root); } catch (err) {
    console.error(err.message);
    process.exit(0);
  }
  const result = await stopServer(port);
  console.log({ stopped: 'Stopped.', 'not-running': 'The Grimoire was not running.', 'still-running': 'The Grimoire did not stop. Try again in a minute.' }[result]);
  process.exit(0);
}

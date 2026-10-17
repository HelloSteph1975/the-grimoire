import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const PORT = 4213;
const TEST_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'client', 'dist-test');
const BASE_CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'base-content');
// The full starter content the app ships with, for screenshots that show real entries.
export const REAL_CONTENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'server', 'content');
export const BASE = `http://127.0.0.1:${PORT}`;

// Keep the folder name short: long Windows paths can break SQLite.
export function freshDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gr-e2e-'));
}

export function removeDataDir(dir) {
  if (path.basename(dir).startsWith('gr-e2e-') && path.dirname(path.resolve(dir)) === path.resolve(os.tmpdir())) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

async function healthy() {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

export async function startServer(dataDir, { content = BASE_CONTENT } = {}) {
  if (await healthy()) throw new Error(`Something is already running on ${PORT}. Stop it first.`);
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, GRIMOIRE_DATA_DIR: dataDir, GRIMOIRE_PORT: String(PORT), GRIMOIRE_CLIENT_DIST: TEST_DIST, GRIMOIRE_CONTENT_DIR: content }, stdio: 'inherit',
  });
  for (let i = 0; i < 80; i++) {
    if (await healthy()) return proc;
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('The test server did not start.');
}

export async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  const exited = new Promise(r => proc.once('exit', r));
  try { await fetch(`${BASE}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(10000) }); } catch {}
  await Promise.race([exited, new Promise(r => setTimeout(r, 10000))]);
  if (proc.exitCode === null) proc.kill();
}

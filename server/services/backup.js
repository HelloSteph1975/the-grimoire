import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../http.js';
import { migrations } from '../db/migrations.js';
import { DB_FILE } from '../db/connection.js';
import { sendToRecycleBin } from '../lib/recycle.js';
import { newEpoch } from './epoch.js';

const pad = n => String(n).padStart(2, '0');
const stampOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const dirOf = dataDir => path.join(dataDir, 'backups');
const NAME = /^(grimoire|pre-restore|pre-empty|pre-migrate)-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;
const sqlQuote = s => `'${s.replace(/'/g, "''")}'`;

export function backupNow(db, dataDir, { kind = 'grimoire', now = new Date() } = {}) {
  const dir = dirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${kind}-${stampOf(now)}`;
  let name = `${base}.db`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}.db`;
  const file = path.join(dir, name);
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    db.exec(`VACUUM INTO ${sqlQuote(tmp)}`);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.utimesSync(file, now, now);
  return { name, file };
}

export function listBackups(dataDir) {
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => NAME.test(n)).map(name => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, modified: st.mtime.toISOString() };
  }).sort((a, b) => b.modified.localeCompare(a.modified) || b.name.localeCompare(a.name));
}

export function rotateBackups(dataDir, { keep = 30, discard = f => sendToRecycleBin(f, { dataDir }) } = {}) {
  const extra = listBackups(dataDir).slice(keep);
  for (const b of extra) discard(path.join(dirOf(dataDir), b.name));
  return extra.map(b => b.name);
}

// After a safety backup: a rotation problem is logged, never allowed to fail the operation.
export function rotateQuietly(dataDir, discard) {
  try {
    rotateBackups(dataDir, { discard });
  } catch (err) {
    console.error('Could not rotate old backups:', err);
  }
}

export function ensureTodayBackup(db, dataDir, now = new Date()) {
  const today = `grimoire-${stampOf(now).slice(0, 10)}-`;
  if (listBackups(dataDir).some(b => b.name.startsWith(today))) return false;
  backupNow(db, dataDir, { now });
  return true;
}

function checkBackupFile(file) {
  let probe;
  try {
    probe = new DatabaseSync(file, { readOnly: true });
    if (probe.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') return 'damaged';
    const v = probe.prepare('PRAGMA user_version').get().user_version;
    if (v > migrations.length) return 'newer';
    const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings','traditions')").all();
    return v >= 2 && tables.length === 2 ? 'ok' : 'foreign';
  } catch {
    return 'damaged';
  } finally {
    try { probe?.close(); } catch {}
  }
}

// The risky file steps, swappable in tests.
export const defaultFsOps = {
  rename: (from, to) => fs.renameSync(from, to),
  rm: file => fs.rmSync(file, { force: true }),
  exists: file => fs.existsSync(file),
  copy: (from, to) => fs.copyFileSync(from, to),
};

const quietly = fn => { try { fn(); } catch {} };
const removeSidecars = (live, fsOps) => { for (const ext of ['-wal', '-shm']) quietly(() => fsOps.rm(live + ext)); };

const FAILED = 'Restore failed; your data was put back from the safety copy.';
const IN_USE = 'Restore stopped: a database file is in use by another program. Nothing was changed.';

export function restoreBackup(ctx, name, { fsOps = defaultFsOps, discard } = {}) {
  if (!NAME.test(String(name))) throw new HttpError(400, 'That is not a Grimoire backup.', undefined, { code: 'not_backup' });
  const dataDir = ctx.config.dataDir;
  const src = path.join(dirOf(dataDir), name);
  if (!fs.existsSync(src)) throw new HttpError(404, 'Backup not found.', undefined, { code: 'backup_missing' });
  const live = path.join(dataDir, DB_FILE);
  const tmp = `${live}.restore-tmp`;
  fs.copyFileSync(src, tmp);
  const verdict = checkBackupFile(tmp);
  if (verdict !== 'ok') {
    fs.rmSync(tmp, { force: true });
    const why = {
      damaged: 'That backup file is damaged, so nothing was changed.',
      newer: 'That backup was made by a newer version of The Grimoire. Update the app first; nothing was changed.',
      foreign: "That file isn't a Grimoire backup, so nothing was changed.",
    }[verdict];
    throw new HttpError(400, why, undefined, { code: `backup_${verdict}` });
  }
  let safety;
  try {
    safety = backupNow(ctx.db, dataDir, { kind: 'pre-restore' });
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  const stuck = () => new HttpError(500, `Restore failed and the database could not be reopened. Restart The Grimoire; your safety copy is ${safety.name} in the backups folder.`, undefined, { code: 'restore_failed', vars: { name: safety.name } });
  const reopen = () => { try { ctx.reopen(); } catch { throw stuck(); } };
  const putBack = () => {
    try {
      fsOps.copy(safety.file, live);
      removeSidecars(live, fsOps);
      ctx.reopen();
    } catch {
      throw stuck();
    }
  };

  ctx.db.close();
  // Closing our only connection removes the log, so a log still there belongs to another
  // program. Check before deleting anything: removing its log would lose its writes.
  if (fsOps.exists(`${live}-wal`)) {
    quietly(() => fsOps.rm(tmp));
    reopen();
    throw new HttpError(500, IN_USE, undefined, { code: 'in_use' });
  }
  quietly(() => fsOps.rm(`${live}-shm`));
  try {
    fsOps.rename(tmp, live);
  } catch {
    quietly(() => fsOps.rm(tmp));
    // A failed rename leaves the live file as it was; only a missing file needs the safety copy.
    if (fsOps.exists(live)) {
      reopen();
      throw new HttpError(500, 'Restore failed; nothing was changed.', undefined, { code: 'restore_failed' });
    }
    putBack();
    throw new HttpError(500, FAILED, undefined, { code: 'restore_failed' });
  }
  try {
    ctx.reopen();
  } catch {
    putBack();
    throw new HttpError(500, FAILED, undefined, { code: 'restore_failed' });
  }
  // Ids and versions just rolled back, so pages loaded before now must reload before saving.
  ctx.epoch = newEpoch(dataDir);
  rotateQuietly(dataDir, discard);
  return { restored: name, safetyCopy: safety.name };
}

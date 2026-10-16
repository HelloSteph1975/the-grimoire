import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate, migrations } from './migrations.js';
import { backupNow } from '../services/backup.js';

export const DB_FILE = 'grimoire.db';

export function ensureDataDirs(dataDir) {
  for (const d of [dataDir, path.join(dataDir, 'backups'), path.join(dataDir, 'locales')]) fs.mkdirSync(d, { recursive: true });
}

// An existing database that is about to be upgraded is copied first, to
// backups/pre-migrate-<date>.db. If the copy fails, the upgrade does not run.
function copyBeforeUpgrade(db, dataDir) {
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version <= 0 || version >= migrations.length) return;
  try {
    backupNow(db, dataDir, { kind: 'pre-migrate' });
  } catch (err) {
    throw new Error(`Could not copy the database before upgrading it, so the upgrade was stopped and nothing was changed. ${err.message}`, { cause: err });
  }
}

export function openDb(dataDir, file = DB_FILE) {
  ensureDataDirs(dataDir);
  const full = path.join(dataDir, file);
  const existed = fs.existsSync(full);
  const db = new DatabaseSync(full);
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    if (existed) copyBeforeUpgrade(db, dataDir);
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

// Runs fn inside one write transaction. Nested calls join the outer one.
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

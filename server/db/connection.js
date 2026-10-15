import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.js';

export const DB_FILE = 'grimoire.db';

export function ensureDataDirs(dataDir) {
  for (const d of [dataDir, path.join(dataDir, 'backups'), path.join(dataDir, 'locales')]) fs.mkdirSync(d, { recursive: true });
}

export function openDb(dataDir, file = DB_FILE) {
  ensureDataDirs(dataDir);
  const db = new DatabaseSync(path.join(dataDir, file));
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
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

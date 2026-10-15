import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../server/db/connection.js';
import { migrations } from '../../server/db/migrations.js';

describe('database', () => {
  it('migrates a fresh folder to the latest version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(['settings', 'traditions', 'starter_removed']));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('refuses a database from a newer app and leaves it alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    raw.exec(`PRAGMA user_version = ${migrations.length + 5}`);
    raw.close();
    expect(() => openDb(dir)).toThrow(/newer version/);
    const again = new DatabaseSync(path.join(dir, 'grimoire.db'));
    expect(again.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length + 5);
    again.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

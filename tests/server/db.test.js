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
    expect(migrations.length).toBe(3);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(['settings', 'traditions', 'starter_removed', 'categories', 'correspondences', 'correspondence_traditions', 'correspondence_links']));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('migrates a version 2 database to 3 and keeps its data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    raw.exec(migrations[0]);
    raw.exec(migrations[1]);
    raw.exec('PRAGMA user_version = 2');
    raw.prepare("INSERT INTO traditions (name, description, starter_key, is_starter) VALUES ('Wiccan', 'Mine', 'tradition.wiccan', 1)").run();
    raw.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'book-folk')").run();
    raw.close();
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(3);
    expect(db.prepare('SELECT name, description, version, content_version FROM traditions').all())
      .toEqual([{ name: 'Wiccan', description: 'Mine', version: 1, content_version: 1 }]);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'theme'").get().value).toBe('book-folk');
    expect(db.prepare('SELECT count(*) n FROM categories').get().n).toBe(0);
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

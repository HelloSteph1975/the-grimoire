import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../server/db/connection.js';
import { migrations } from '../../server/db/migrations.js';
import { listBackups } from '../../server/services/backup.js';

describe('database', () => {
  it('migrates a fresh folder to the latest version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(['settings', 'traditions', 'starter_removed', 'categories', 'correspondences', 'correspondence_traditions', 'correspondence_links', 'spell_kinds', 'spells', 'spell_traditions', 'spell_ingredients', 'spell_steps', 'spell_timing', 'spell_feasts', 'own_dates', 'own_date_traditions', 'rituals', 'ritual_traditions', 'ritual_supplies', 'ritual_followups', 'journal_kinds', 'journal_entries', 'journal_entry_tags', 'journal_cards']));
    expect(migrations.length).toBe(7);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('migrates a version 2 database to the latest and keeps its data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    raw.exec(migrations[0]);
    raw.exec(migrations[1]);
    raw.exec('PRAGMA user_version = 2');
    raw.prepare("INSERT INTO traditions (name, description, starter_key, is_starter) VALUES ('Wiccan', 'Mine', 'tradition.wiccan', 1)").run();
    raw.prepare("INSERT INTO settings (key, value) VALUES ('theme', 'book-folk')").run();
    raw.close();
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    expect(db.prepare('SELECT name, description, version, content_version FROM traditions').all())
      .toEqual([{ name: 'Wiccan', description: 'Mine', version: 1, content_version: 1 }]);
    expect(db.prepare("SELECT value FROM settings WHERE key = 'theme'").get().value).toBe('book-folk');
    expect(db.prepare('SELECT count(*) n FROM categories').get().n).toBe(0);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('migrates a version 4 database: show_on_calendar defaults to 1 on existing rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    for (let i = 0; i < 4; i++) raw.exec(migrations[i]);
    raw.exec('PRAGMA user_version = 4');
    raw.exec("INSERT INTO categories (name) VALUES ('Herbs')");
    raw.exec("INSERT INTO correspondences (category_id, name) VALUES (1, 'Rosemary')");
    raw.close();
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    expect(db.prepare('SELECT name, show_on_calendar FROM correspondences').all()).toEqual([{ name: 'Rosemary', show_on_calendar: 1 }]);
    expect(db.prepare('SELECT count(*) n FROM own_dates').get().n).toBe(0);
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('migrates a version 5 database to 6: rituals start empty and spells keep their data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    for (let i = 0; i < 5; i++) raw.exec(migrations[i]);
    raw.exec('PRAGMA user_version = 5');
    raw.exec("INSERT INTO spells (title) VALUES ('Calm')");
    raw.close();
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    expect(db.prepare('SELECT title FROM spells').all()).toEqual([{ title: 'Calm' }]);
    for (const table of ['rituals', 'ritual_traditions', 'ritual_supplies', 'ritual_followups']) {
      expect(db.prepare(`SELECT count(*) n FROM ${table}`).get().n).toBe(0);
    }
    db.prepare("INSERT INTO rituals (title, date) VALUES ('R', '2026-10-31')").run();
    expect(db.prepare('SELECT status, version FROM rituals').get()).toEqual({ status: 'planned', version: 1 });
    expect(() => db.prepare("UPDATE rituals SET status = 'maybe'").run()).toThrow();
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('migrates a version 6 database to 7: journal tables start empty and rituals keep their data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    for (let i = 0; i < 6; i++) raw.exec(migrations[i]);
    raw.exec('PRAGMA user_version = 6');
    raw.exec("INSERT INTO rituals (title, date) VALUES ('R', '2026-10-31')");
    raw.close();
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(7);
    expect(db.prepare('SELECT title FROM rituals').all()).toEqual([{ title: 'R' }]);
    for (const table of ['journal_kinds', 'journal_entries', 'journal_entry_tags', 'journal_cards']) {
      expect(db.prepare(`SELECT count(*) n FROM ${table}`).get().n).toBe(0);
    }
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

describe('copy before a database upgrade', () => {
  let dir;
  afterEach(() => { vi.useRealTimers(); if (dir) fs.rmSync(dir, { recursive: true, force: true }); dir = null; });
  // A Stage 1 (version 2) database with one tradition in it.
  function version2() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    raw.exec(migrations[0]);
    raw.exec(migrations[1]);
    raw.exec('PRAGMA user_version = 2');
    raw.prepare("INSERT INTO traditions (name) VALUES ('Mine')").run();
    raw.close();
  }
  const preMigrate = () => fs.readdirSync(path.join(dir, 'backups')).filter(n => n.startsWith('pre-migrate-'));
  const versionOf = file => {
    const db = new DatabaseSync(file, { readOnly: true });
    try { return db.prepare('PRAGMA user_version').get().user_version; } finally { db.close(); }
  };

  it('copies a version 2 database once, before it upgrades it', () => {
    version2();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 8, 5));
    openDb(dir).close();
    expect(preMigrate()).toEqual(['pre-migrate-2026-10-15-0805.db']);
    const copy = path.join(dir, 'backups', 'pre-migrate-2026-10-15-0805.db');
    expect(versionOf(copy)).toBe(2);
    const old = new DatabaseSync(copy, { readOnly: true });
    expect(old.prepare('SELECT name FROM traditions').all()).toEqual([{ name: 'Mine' }]);
    old.close();
    openDb(dir).close();
    expect(preMigrate()).toHaveLength(1);
    expect(listBackups(dir).map(b => b.name)).toContain('pre-migrate-2026-10-15-0805.db');
  });
  it('makes no copy of a fresh or an up-to-date database', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    openDb(dir).close();
    openDb(dir).close();
    expect(preMigrate()).toEqual([]);
  });
  it('makes no copy of an existing empty file', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    fs.writeFileSync(path.join(dir, 'grimoire.db'), '');
    openDb(dir).close();
    expect(preMigrate()).toEqual([]);
  });
  it('stops the upgrade and leaves the database alone when the copy cannot be written', () => {
    version2();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 8, 5));
    // A folder where the copy's temporary file must go makes the copy fail.
    fs.mkdirSync(path.join(dir, 'backups', 'pre-migrate-2026-10-15-0805.db.tmp'), { recursive: true });
    expect(() => openDb(dir)).toThrow(/Could not copy the database before upgrading it.*nothing was changed/s);
    expect(versionOf(path.join(dir, 'grimoire.db'))).toBe(2);
    expect(preMigrate().filter(n => n.endsWith('.db'))).toEqual([]);
  });
});

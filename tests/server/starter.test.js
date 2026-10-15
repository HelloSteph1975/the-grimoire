import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db/connection.js';
import { seedStarter } from '../../server/services/starter.js';
import { repos } from '../../server/db/repos.js';

let dir, db;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-seed-')); db = openDb(dir); });
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('seedStarter', () => {
  it('adds the starter traditions once', () => {
    expect(seedStarter(db)).toBe(3);
    expect(seedStarter(db)).toBe(0);
    expect(repos(db).traditions.list()).toHaveLength(3);
  });
  it('never overwrites an edited starter entry', () => {
    seedStarter(db);
    const w = repos(db).traditions.list().find(r => r.starter_key === 'tradition.wiccan');
    repos(db).traditions.update(w.id, { description: 'Mine', is_starter: 0 }, w.version);
    seedStarter(db);
    expect(repos(db).traditions.get(w.id).description).toBe('Mine');
  });
  it('does not bring back a starter entry that is in the Trash', () => {
    seedStarter(db);
    const w = repos(db).traditions.list().find(r => r.starter_key === 'tradition.wiccan');
    repos(db).traditions.remove(w.id);
    expect(seedStarter(db)).toBe(0);
    expect(repos(db).traditions.list()).toHaveLength(2);
  });
  it('does not bring back a starter entry deleted forever', () => {
    seedStarter(db);
    db.prepare("INSERT INTO starter_removed (starter_key) VALUES ('tradition.wiccan')").run();
    db.prepare("DELETE FROM traditions WHERE starter_key = 'tradition.wiccan'").run();
    expect(seedStarter(db)).toBe(0);
  });
});

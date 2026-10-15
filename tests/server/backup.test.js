import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeTestContext } from './helpers.js';
import { backupNow, listBackups, rotateBackups, ensureTodayBackup, restoreBackup } from '../../server/services/backup.js';
import { repos } from '../../server/db/repos.js';
import { migrations } from '../../server/db/migrations.js';

let t;
afterEach(() => t?.cleanup());

describe('backups', () => {
  it('writes grimoire-YYYY-MM-DD-HHMM.db and lists it', () => {
    t = makeTestContext();
    const { name } = backupNow(t.ctx.db, t.dataDir, { now: new Date(2026, 9, 14, 21, 5) });
    expect(name).toBe('grimoire-2026-10-14-2105.db');
    expect(listBackups(t.dataDir).map(b => b.name)).toEqual([name]);
  });
  it('never overwrites a backup made in the same minute', () => {
    t = makeTestContext();
    const now = new Date(2026, 9, 14, 21, 5);
    const a = backupNow(t.ctx.db, t.dataDir, { now });
    const b = backupNow(t.ctx.db, t.dataDir, { now });
    expect(b.name).toBe('grimoire-2026-10-14-2105-2.db');
    expect(fs.existsSync(a.file)).toBe(true);
  });
  it('works when the data folder path has an apostrophe and spaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grim o'neil "));
    t = makeTestContext({ dataDir: dir });
    const { file } = backupNow(t.ctx.db, dir);
    expect(fs.statSync(file).size).toBeGreaterThan(0);
  });
  it('keeps the newest 30 and discards the rest through the Recycle Bin hook', () => {
    t = makeTestContext();
    for (let i = 0; i < 33; i++) backupNow(t.ctx.db, t.dataDir, { now: new Date(2026, 0, 1 + i, 9, 0) });
    const discarded = [];
    const removed = rotateBackups(t.dataDir, { discard: f => { discarded.push(path.basename(f)); fs.rmSync(f); } });
    expect(removed).toHaveLength(3);
    expect(discarded).toEqual(['grimoire-2026-01-03-0900.db', 'grimoire-2026-01-02-0900.db', 'grimoire-2026-01-01-0900.db']);
    expect(listBackups(t.dataDir)).toHaveLength(30);
  });
  it('makes a start-of-day backup only once per day', () => {
    t = makeTestContext();
    const now = new Date(2026, 9, 14, 6, 0);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, now)).toBe(true);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, new Date(2026, 9, 14, 20, 0))).toBe(false);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, new Date(2026, 9, 15, 6, 0))).toBe(true);
  });
  it('restores a backup and keeps a safety copy of the data it replaced', () => {
    t = makeTestContext();
    const { name } = backupNow(t.ctx.db, t.dataDir);
    repos(t.ctx.db).traditions.create({ name: 'Added after backup' });
    const out = restoreBackup(t.ctx, name);
    expect(out.safetyCopy).toMatch(/^pre-restore-/);
    expect(repos(t.ctx.db).traditions.list().map(r => r.name)).not.toContain('Added after backup');
    const safety = new DatabaseSync(path.join(t.dataDir, 'backups', out.safetyCopy), { readOnly: true });
    expect(safety.prepare("SELECT count(*) AS n FROM traditions WHERE name = 'Added after backup'").get().n).toBe(1);
    safety.close();
  });
  it('refuses names that are not backups', () => {
    t = makeTestContext();
    expect(() => restoreBackup(t.ctx, '../grimoire.db')).toThrow(/not a Grimoire backup/);
  });
  it('refuses a backup from a newer app and changes nothing', () => {
    t = makeTestContext();
    const { name, file } = backupNow(t.ctx.db, t.dataDir);
    const raw = new DatabaseSync(file);
    raw.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    raw.close();
    repos(t.ctx.db).traditions.create({ name: 'Still here' });
    expect(() => restoreBackup(t.ctx, name)).toThrow(/newer version/);
    expect(repos(t.ctx.db).traditions.list().map(r => r.name)).toContain('Still here');
  });
  it('refuses a damaged file', () => {
    t = makeTestContext();
    fs.writeFileSync(path.join(t.dataDir, 'backups', 'grimoire-2026-01-01-0900.db'), 'not a database');
    expect(() => restoreBackup(t.ctx, 'grimoire-2026-01-01-0900.db')).toThrow(/damaged/);
  });
});

describe('restore when something goes wrong', () => {
  const realFs = {
    rename: (a, b) => fs.renameSync(a, b),
    rm: p => fs.rmSync(p, { force: true }),
    exists: p => fs.existsSync(p),
    copy: (a, b) => fs.copyFileSync(a, b),
  };
  const setUp = () => {
    t = makeTestContext();
    const { name } = backupNow(t.ctx.db, t.dataDir);
    repos(t.ctx.db).traditions.create({ name: 'Added after backup' });
    const live = path.join(t.dataDir, 'grimoire.db');
    return { name, live, tmp: `${live}.restore-tmp` };
  };
  const names = () => repos(t.ctx.db).traditions.list().map(r => r.name);
  const errorOf = fn => { try { fn(); } catch (e) { return e; } throw new Error('expected an error'); };

  it('leaves the original data alone when the swap fails', () => {
    const { name, tmp } = setUp();
    const before = names();
    const copies = [];
    const fsOps = { ...realFs, rename: () => { throw new Error('EPERM'); }, copy: (a, b) => { copies.push(b); realFs.copy(a, b); } };
    const err = errorOf(() => restoreBackup(t.ctx, name, { fsOps }));
    expect(err.status).toBe(500);
    expect(names()).toEqual(before);
    expect(names()).toContain('Added after backup');
    expect(fs.existsSync(tmp)).toBe(false);
    expect(copies.filter(f => f.endsWith('grimoire.db'))).toEqual([]);
  });
  it('puts the safety copy back when the restored file will not open', () => {
    const { name } = setUp();
    const before = names();
    const reopen = t.ctx.reopen;
    let calls = 0;
    t.ctx.reopen = () => { if (++calls === 1) throw new Error('cannot open'); return reopen(); };
    const err = errorOf(() => restoreBackup(t.ctx, name));
    expect(err.status).toBe(500);
    expect(err.message).toBe('Restore failed; your data was put back from the safety copy.');
    expect(names()).toEqual(before);
  });
  it('stops before swapping when a database file is still in use', () => {
    const { name, live, tmp } = setUp();
    const renames = [];
    const fsOps = {
      ...realFs,
      exists: p => (p === `${live}-wal` ? true : realFs.exists(p)),
      rename: (a, b) => { renames.push([a, b]); realFs.rename(a, b); },
    };
    const err = errorOf(() => restoreBackup(t.ctx, name, { fsOps }));
    expect(err.status).toBe(500);
    expect(err.message).toBe('Restore stopped: a database file is in use by another program. Nothing was changed.');
    expect(renames).toEqual([]);
    expect(fs.existsSync(tmp)).toBe(false);
    expect(names()).toContain('Added after backup');
  });
});

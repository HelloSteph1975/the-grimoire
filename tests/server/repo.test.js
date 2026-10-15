import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db/connection.js';
import { createRepo, VersionConflict } from '../../server/db/repo.js';

let dir, db, repo;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-repo-'));
  db = openDb(dir);
  repo = createRepo(db, 'traditions', ['name', 'description', 'color', 'sort_order', 'starter_key', 'is_starter'], { orderBy: 'sort_order, id' });
});
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('versioned repo', () => {
  it('creates rows at version 1', () => {
    expect(repo.create({ name: 'Eclectic' })).toMatchObject({ name: 'Eclectic', version: 1, deleted_at: null });
  });
  it('updates with the right version and bumps it', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.update(a.id, { name: 'B' }, 1)).toMatchObject({ name: 'B', version: 2 });
  });
  it('refuses a stale version and hands back the current row', () => {
    const a = repo.create({ name: 'A' });
    repo.update(a.id, { name: 'B' }, 1);
    let err;
    try { repo.update(a.id, { name: 'C' }, 1); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(VersionConflict);
    expect(err.current).toMatchObject({ name: 'B', version: 2 });
    expect(repo.get(a.id).name).toBe('B');
  });
  it('requires a version on update', () => {
    const a = repo.create({ name: 'A' });
    expect(() => repo.update(a.id, { name: 'B' })).toThrow(TypeError);
  });
  it('returns null when updating a missing or deleted row', () => {
    const a = repo.create({ name: 'A' });
    repo.remove(a.id);
    expect(repo.update(a.id, { name: 'B' }, 2)).toBeNull();
    expect(repo.update(999, { name: 'B' }, 1)).toBeNull();
  });
  it('soft-deletes, lists the Trash, and restores', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.remove(a.id)).toBe(true);
    expect(repo.list()).toEqual([]);
    expect(repo.listDeleted().map(r => r.id)).toEqual([a.id]);
    expect(repo.restore(a.id)).toBe(true);
    expect(repo.get(a.id)).toMatchObject({ deleted_at: null, version: 3 });
  });
  it('purges only rows already in the Trash', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.purge(a.id)).toBe(false);
    repo.remove(a.id);
    expect(repo.purge(a.id)).toBe(true);
    expect(repo.get(a.id, { includeDeleted: true })).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, BASE_CONTENT } from './helpers.js';
import { seedStarter } from '../../server/services/starter.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

const db = () => t.ctx.db;
const kinds = async () => (await t.http().get('/api/journal-kinds')).body;
const addEntry = (kindId, title = 'E') => Number(db().prepare("INSERT INTO journal_entries (date, title, kind_id) VALUES ('2026-10-01', ?, ?)").run(title, kindId).lastInsertRowid);
const versionOf = id => db().prepare('SELECT version FROM journal_entries WHERE id = ?').get(id).version;

describe('/api/journal-kinds', () => {
  it('lists the four starter kinds in order', async () => {
    const list = await kinds();
    expect(list.map(k => k.name)).toEqual(['Dream', 'Tarot', 'Sign', 'Other']);
    expect(list.map(k => k.starter_key)).toEqual(['journal-kind.dream', 'journal-kind.tarot', 'journal-kind.sign', 'journal-kind.other']);
    expect(list.every(k => k.is_starter === 1)).toBe(true);
  });
  it('adds, renames (dropping Starter) and conflicts on a stale rename', async () => {
    const added = await t.http().post('/api/journal-kinds').send({ name: 'Vision' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: 'Vision', is_starter: 0, version: 1 });
    const [first] = await kinds();
    const renamed = await t.http().patch(`/api/journal-kinds/${first.id}`).send({ version: first.version, name: 'Night' });
    expect(renamed.body).toMatchObject({ name: 'Night', is_starter: 0, version: 2 });
    const stale = await t.http().patch(`/api/journal-kinds/${first.id}`).send({ version: 1, name: 'Again' });
    expect(stale.status).toBe(409);
    expect(stale.body.current.name).toBe('Night');
  });
  it('checks the name and sort order', async () => {
    const res = await t.http().post('/api/journal-kinds').send({ name: ' ', sort_order: 10001 });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes.name.code).toBe('required');
    expect(res.body.detailCodes.sort_order.code).toBe('too_big');
    expect((await t.http().post('/api/journal-kinds').send({ name: 'x'.repeat(61) })).body.detailCodes.name.code).toBe('too_long');
  });
  it('reorders, and a stale reorder gets reorder_conflict', async () => {
    const items = (await kinds()).map(k => ({ id: k.id, version: k.version }));
    const ok = await t.http().post('/api/journal-kinds/reorder').send({ items: [...items].reverse() });
    expect(ok.status).toBe(200);
    expect(ok.body.map(k => k.name)).toEqual(['Other', 'Sign', 'Tarot', 'Dream']);
    const stale = await t.http().post('/api/journal-kinds/reorder').send({ items });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('reorder_conflict');
  });
  it('counts only live entries in usage, and 404s for a missing kind', async () => {
    const [first] = await kinds();
    expect((await t.http().get(`/api/journal-kinds/${first.id}/usage`)).body).toEqual({ entries: 0 });
    addEntry(first.id);
    const gone = addEntry(first.id, 'Gone');
    db().prepare("UPDATE journal_entries SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(gone);
    expect((await t.http().get(`/api/journal-kinds/${first.id}/usage`)).body).toEqual({ entries: 1 });
    expect((await t.http().get('/api/journal-kinds/99999/usage')).status).toBe(404);
  });
  it('deletes to the Trash and restores, raising the version of live entries that use it', async () => {
    const [first, second] = await kinds();
    const e = addEntry(first.id);
    const other = addEntry(second.id);
    const trashedEntry = addEntry(first.id, 'T');
    db().prepare("UPDATE journal_entries SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(trashedEntry);
    expect((await t.http().delete(`/api/journal-kinds/${first.id}`)).status).toBe(200);
    expect(versionOf(e)).toBe(2);
    expect(versionOf(other)).toBe(1);
    expect(versionOf(trashedEntry)).toBe(1);
    const trash = (await t.http().get('/api/trash')).body;
    expect(trash).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'journalKind', id: first.id, title: 'Dream' })]));
    expect((await t.http().post(`/api/trash/journalKind/${first.id}/restore`)).status).toBe(200);
    expect(versionOf(e)).toBe(3);
    expect((await kinds()).map(k => k.name)).toContain('Dream');
    expect((await t.http().delete('/api/journal-kinds/99999')).status).toBe(404);
  });
  it('deleting forever raises entry versions, clears kind_id and is never seeded again', async () => {
    const [first] = await kinds();
    const e = addEntry(first.id);
    await t.http().delete(`/api/journal-kinds/${first.id}`);
    expect((await t.http().delete(`/api/trash/journalKind/${first.id}`)).status).toBe(200);
    expect(db().prepare('SELECT kind_id FROM journal_entries WHERE id = ?').get(e).kind_id).toBeNull();
    expect(versionOf(e)).toBe(3);
    expect(seedStarter(db(), { content: BASE_CONTENT })).toBe(0);
    expect((await kinds()).map(k => k.name)).toEqual(['Tarot', 'Sign', 'Other']);
  });
  it('seeds the four kinds once', () => {
    expect(seedStarter(db(), { content: BASE_CONTENT })).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM journal_kinds').get().n).toBe(4);
  });
  it('Empty Trash purges kinds', async () => {
    const [first] = await kinds();
    await t.http().delete(`/api/journal-kinds/${first.id}`);
    expect((await t.http().post('/api/trash/empty').send({})).status).toBe(200);
    expect(db().prepare('SELECT count(*) AS n FROM journal_kinds').get().n).toBe(3);
  });
});

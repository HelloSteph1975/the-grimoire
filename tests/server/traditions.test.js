import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

describe('/api/traditions', () => {
  it('lists the three starter traditions', async () => {
    const res = await t.http().get('/api/traditions');
    expect(res.body.map(r => r.name)).toEqual(['Eclectic', 'Wiccan', 'Mexican folk']);
    expect(res.body.every(r => r.is_starter === 1)).toBe(true);
  });
  it('creates, reads, updates and deletes', async () => {
    const created = await t.http().post('/api/traditions').send({ name: 'Kitchen witchery', color: '#5b4430' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Kitchen witchery', version: 1, is_starter: 0 });
    const id = created.body.id;
    const upd = await t.http().patch(`/api/traditions/${id}`).send({ version: 1, description: 'Hearth and home' });
    expect(upd.body).toMatchObject({ description: 'Hearth and home', version: 2 });
    expect((await t.http().get(`/api/traditions/${id}`)).body.version).toBe(2);
    expect((await t.http().delete(`/api/traditions/${id}`)).body).toEqual({ ok: true });
    expect((await t.http().get(`/api/traditions/${id}`)).status).toBe(404);
    const back = await t.http().post(`/api/traditions/${id}/restore`);
    expect(back.body).toMatchObject({ id, deleted_at: null });
  });
  it('answers 409 with the current row for a stale version', async () => {
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'B' });
    const stale = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'C' });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ name: 'B', version: 2 });
  });
  it('needs a version to update', async () => {
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    const res = await t.http().patch(`/api/traditions/${a.id}`).send({ name: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.details.version).toMatch(/version/i);
  });
  it('rejects bad input with per-field messages and writes nothing', async () => {
    const res = await t.http().post('/api/traditions').send({ name: '', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.details).toMatchObject({ name: 'Required', color: expect.any(String) });
    expect((await t.http().get('/api/traditions')).body).toHaveLength(3);
  });
  it('drops the Starter tag when a starter tradition is edited', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const w = list.find(r => r.name === 'Wiccan');
    const res = await t.http().patch(`/api/traditions/${w.id}`).send({ version: w.version, description: 'Mine now' });
    expect(res.body).toMatchObject({ is_starter: 0, starter_key: 'tradition.wiccan' });
  });
  it('keeps the Starter tag when a save changes nothing', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const w = list.find(r => r.name === 'Wiccan');
    const res = await t.http().patch(`/api/traditions/${w.id}`).send({ version: w.version, name: w.name, description: w.description, color: w.color });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ is_starter: 1, starter_key: 'tradition.wiccan' });
  });
  it('never reuses the id of a record deleted forever', async () => {
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'First' });
    await t.http().delete(`/api/traditions/${a.id}`);
    expect((await t.http().delete(`/api/trash/tradition/${a.id}`)).status).toBe(200);
    const { body: b } = await t.http().post('/api/traditions').send({ name: 'Second' });
    expect(b.id).toBeGreaterThan(a.id);
    const stale = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'Overwrite' });
    expect(stale.status).toBe(404);
    expect((await t.http().get(`/api/traditions/${b.id}`)).body.name).toBe('Second');
  });
  it('stamps times as ISO-8601 UTC with Z', async () => {
    const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'Stamped' });
    expect(a.created_at).toMatch(ISO);
    expect(a.updated_at).toMatch(ISO);
    const { body: b } = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'Restamped' });
    expect(b.updated_at).toMatch(ISO);
    await t.http().delete(`/api/traditions/${a.id}`);
    const { body: c } = await t.http().post(`/api/traditions/${a.id}/restore`);
    expect(c.updated_at).toMatch(ISO);
  });
  it('ignores fields that are not in the schema', async () => {
    const res = await t.http().post('/api/traditions').send({ name: 'X', is_starter: 1, starter_key: 'hack', version: 9 });
    expect(res.body).toMatchObject({ is_starter: 0, starter_key: null, version: 1 });
  });
});

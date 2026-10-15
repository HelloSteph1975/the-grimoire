import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('error codes', () => {
  it('sends field codes with a 400', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').send({ name: '', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(res.body.detailCodes).toEqual({ name: { code: 'required' }, color: { code: 'bad_format', hint: 'color' } });
    expect(res.body.details.name).toBe('Required');
  });
  it('sends too_long with its limit', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').send({ name: 'x'.repeat(61) });
    expect(res.body.detailCodes.name).toEqual({ code: 'too_long', max: 60 });
  });
  it('sends not_found, missing_version and conflict', async () => {
    t = makeTestContext();
    expect((await t.http().get('/api/traditions/999')).body.code).toBe('not_found');
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    expect((await t.http().patch(`/api/traditions/${a.id}`).send({ name: 'B' })).body.code).toBe('missing_version');
    await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'B' });
    const stale = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'C' });
    expect(stale.body).toMatchObject({ code: 'conflict', current: { name: 'B' } });
  });
  it('sends unknown_kind and not_in_trash', async () => {
    t = makeTestContext();
    expect((await t.http().post('/api/trash/nope/1/restore')).body.code).toBe('unknown_kind');
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'Alive' });
    expect((await t.http().delete(`/api/trash/tradition/${a.id}`)).body.code).toBe('not_in_trash');
  });
  it('sends restored for a write from before a restore', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').set('X-Grimoire-Epoch', 'old').send({ name: 'X' });
    expect(res.body).toMatchObject({ code: 'restored', restored: true });
  });
  it('sends bad_id for a bad id', async () => {
    t = makeTestContext();
    expect((await t.http().get('/api/traditions/abc')).body.code).toBe('bad_id');
  });
});

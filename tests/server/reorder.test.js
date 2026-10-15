import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());
const items = list => list.map(r => ({ id: r.id, version: r.version }));

describe('POST /api/traditions/reorder', () => {
  it('saves a new order and keeps Starter tags', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const res = await t.http().post('/api/traditions/reorder').send({ items: items([list[2], list[0], list[1]]) });
    expect(res.body.map(r => r.name)).toEqual(['Mexican folk', 'Eclectic', 'Wiccan']);
    expect(res.body.every(r => r.is_starter === 1)).toBe(true);
  });
  it('refuses a stale version', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    await t.http().patch(`/api/traditions/${list[0].id}`).send({ version: list[0].version, description: 'x' });
    const res = await t.http().post('/api/traditions/reorder').send({ items: items(list).reverse() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('reorder_conflict');
    expect((await t.http().get('/api/traditions')).body.map(r => r.name)).toEqual(['Eclectic', 'Wiccan', 'Mexican folk']);
  });
  it('refuses a list that is missing a row or has an extra one', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    expect((await t.http().post('/api/traditions/reorder').send({ items: items(list.slice(1)) })).body.code).toBe('reorder_conflict');
    await t.http().post('/api/traditions').send({ name: 'New' });
    expect((await t.http().post('/api/traditions/reorder').send({ items: items(list) })).body.code).toBe('reorder_conflict');
  });
  it('rejects bad input', async () => {
    expect((await t.http().post('/api/traditions/reorder').send({ items: 'x' })).status).toBe(400);
  });
});

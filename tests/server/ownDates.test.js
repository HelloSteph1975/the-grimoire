import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t, trads;
beforeEach(async () => {
  t = makeTestContext();
  trads = (await t.http().get('/api/traditions')).body;
});
afterEach(() => t.cleanup());

const post = body => t.http().post('/api/own-dates').send(body);
const patch = (id, body) => t.http().patch(`/api/own-dates/${id}`).send(body);
const get = async id => (await t.http().get(`/api/own-dates/${id}`)).body;
const codes = async body => {
  const res = await post({ title: 'x', date: '2026-05-01', ...body });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('invalid');
  return res.body.detailCodes;
};

describe('/api/own-dates', () => {
  it('creates, reads and lists in date order', async () => {
    const res = await post({ title: ' Grandma ', date: '2026-09-01', yearly: true, notes: 'Light a candle', traditions: [trads[1].id, trads[0].id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: 'Grandma', date: '2026-09-01', yearly: 1, notes: 'Light a candle', version: 1, traditions: [trads[0].id, trads[1].id] });
    expect(await get(res.body.id)).toEqual(res.body);
    const earlier = (await post({ title: 'Earlier', date: '2026-01-01' })).body;
    expect(earlier).toMatchObject({ yearly: 0, notes: null, traditions: [] });
    const list = (await t.http().get('/api/own-dates')).body;
    expect(list.map(d => d.title)).toEqual(['Earlier', 'Grandma']);
    expect(list[1].traditions).toEqual([trads[0].id, trads[1].id]);
  });

  it('updates with a version, and a stale PATCH gets 409 with the current date', async () => {
    const d = (await post({ title: 'A', date: '2026-05-01', traditions: [trads[0].id] })).body;
    const ok = await patch(d.id, { title: 'B', yearly: true, traditions: [], version: d.version });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ title: 'B', yearly: 1, version: 2, traditions: [] });
    const stale = await patch(d.id, { title: 'C', version: d.version });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ title: 'B', version: 2, traditions: [] });
    expect((await patch(d.id, { title: 'x' })).body.code).toBe('missing_version');
    expect((await patch(9999, { title: 'x', version: 1 })).status).toBe(404);
  });

  it('checks the version before the references', async () => {
    const d = (await post({ title: 'A', date: '2026-05-01' })).body;
    await patch(d.id, { title: 'B', version: 1 });
    expect((await patch(d.id, { traditions: [9999], version: 1 })).status).toBe(409);
  });

  it('goes to the Trash, restores and deletes forever', async () => {
    const d = (await post({ title: 'Gone soon', date: '2026-05-01', traditions: [trads[0].id] })).body;
    expect((await t.http().delete(`/api/own-dates/${d.id}`)).status).toBe(200);
    expect((await t.http().get(`/api/own-dates/${d.id}`)).status).toBe(404);
    expect((await t.http().get('/api/own-dates')).body).toEqual([]);
    const trash = (await t.http().get('/api/trash')).body;
    expect(trash).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'date', id: d.id, title: 'Gone soon' })]));
    const back = await t.http().post(`/api/own-dates/${d.id}/restore`);
    expect(back.status).toBe(200);
    expect(back.body.traditions).toEqual([trads[0].id]);
    await t.http().delete(`/api/own-dates/${d.id}`);
    expect((await t.http().delete(`/api/trash/date/${d.id}`)).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_dates').get().n).toBe(0);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_date_traditions').get().n).toBe(0);
  });

  it('restores from the Trash route and empties the Trash', async () => {
    const d = (await post({ title: 'T', date: '2026-05-01' })).body;
    await t.http().delete(`/api/own-dates/${d.id}`);
    expect((await t.http().post(`/api/trash/date/${d.id}/restore`)).status).toBe(200);
    await t.http().delete(`/api/own-dates/${d.id}`);
    expect((await t.http().post('/api/trash/empty').send({})).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_dates').get().n).toBe(0);
  });

  it('reports field codes', async () => {
    expect((await post({ date: '2026-05-01' })).body.detailCodes.title).toEqual({ code: 'required' });
    expect((await codes({ title: 'x'.repeat(121) })).title).toEqual({ code: 'too_long', max: 120 });
    expect((await post({ title: 'x' })).body.detailCodes.date).toEqual({ code: 'required' });
    expect((await codes({ date: '2024-02-30' })).date).toEqual({ code: 'bad_format', hint: 'date' });
    expect((await codes({ date: '1899-12-31' })).date).toEqual({ code: 'bad_format', hint: 'date' });
    expect((await codes({ date: '2101-01-01' })).date).toEqual({ code: 'bad_format', hint: 'date' });
    expect((await post({ title: 'ok', date: '1900-01-01' })).status).toBe(201);
    expect((await post({ title: 'ok', date: '2100-12-31' })).status).toBe(201);
    expect((await codes({ notes: 'n'.repeat(2001) })).notes).toEqual({ code: 'too_long', max: 2000 });
    expect((await codes({ traditions: [9999] })).traditions).toEqual({ code: 'not_found' });
  });

  it('rejects a null or blank yearly and writes nothing', async () => {
    const before = () => t.ctx.db.prepare('SELECT count(*) n FROM own_dates').get().n;
    for (const bad of [null, '']) {
      const res = await post({ title: 'x', date: '2026-05-01', yearly: bad });
      expect(res.status).toBe(400);
      expect(res.body.detailCodes.yearly).toEqual({ code: 'required' });
    }
    expect(before()).toBe(0);
    const d = (await post({ title: 'x', date: '2026-05-01', yearly: true })).body;
    for (const bad of ['', null]) {
      const res = await patch(d.id, { yearly: bad, version: d.version });
      expect(res.status).toBe(400);
      expect(res.body.detailCodes.yearly).toEqual({ code: 'required' });
    }
    expect(await get(d.id)).toEqual(d);
  });

  it('rejects a tradition in the Trash for a new join', async () => {
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    expect((await codes({ traditions: [trads[0].id] })).traditions).toEqual({ code: 'not_found' });
  });
});

describe('own dates and traditions in the Trash', () => {
  it('raises the version, hides the tradition, keeps the join on a PATCH with the GET values, and shows it on restore', async () => {
    const d = (await post({ title: 'A', date: '2026-05-01', traditions: [trads[0].id, trads[1].id] })).body;
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    const seen = await get(d.id);
    expect(seen.version).toBe(d.version + 1);
    expect(seen.traditions).toEqual([trads[1].id]);
    expect((await patch(d.id, { title: 'Z', version: d.version })).status).toBe(409);
    const ok = await patch(d.id, { traditions: seen.traditions, version: seen.version });
    expect(ok.status).toBe(200);
    expect(ok.body.traditions).toEqual([trads[1].id]);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_date_traditions WHERE own_date_id = ?').get(d.id).n).toBe(2);
    await t.http().post(`/api/traditions/${trads[0].id}/restore`);
    const back = await get(d.id);
    expect(back.version).toBe(ok.body.version + 1);
    expect(back.traditions).toEqual([trads[0].id, trads[1].id]);
  });

  it('accepts a PATCH that sends a trashed tradition it already holds, keeps the join and shows it on restore', async () => {
    const d = (await post({ title: 'A', date: '2026-05-01', traditions: [trads[0].id] })).body;
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    const cur = await get(d.id);
    const ok = await patch(d.id, { title: 'B', traditions: [trads[0].id], version: cur.version });
    expect(ok.status).toBe(200);
    expect(ok.body.traditions).toEqual([]);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_date_traditions WHERE own_date_id = ?').get(d.id).n).toBe(1);
    await t.http().post(`/api/traditions/${trads[0].id}/restore`);
    expect((await get(d.id)).traditions).toEqual([trads[0].id]);
  });

  it('does not bump a date in the Trash', async () => {
    const d = (await post({ title: 'A', date: '2026-05-01', traditions: [trads[0].id] })).body;
    await t.http().delete(`/api/own-dates/${d.id}`);
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    expect(t.ctx.db.prepare('SELECT version FROM own_dates WHERE id = ?').get(d.id).version).toBe(2);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t, r;
beforeEach(async () => {
  t = makeTestContext({ now: () => new Date('2026-10-17T03:00:00Z') });
  r = (await t.http().post('/api/rituals').send({ title: 'Full moon', date: '2026-10-01', status: 'done' })).body;
});
afterEach(() => t.cleanup());

const post = body => t.http().post('/api/followups').send(body);
const patch = (id, body) => t.http().patch(`/api/followups/${id}`).send(body);
const del = path => t.http().delete(path);
const list = async (ritualId = r.id) => (await t.http().get(`/api/followups?ritual=${ritualId}`)).body;
const add = async (body = {}) => {
  const res = await post({ ritual_id: r.id, date: '2026-10-08', text: 'Felt lighter', ...body });
  if (res.status !== 201) throw new Error(`add failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const ritualVersion = async () => (await t.http().get(`/api/rituals/${r.id}`)).body.version;

describe('/api/followups', () => {
  it('creates, lists by date then id, edits, deletes and restores', async () => {
    const res = await post({ ritual_id: r.id, date: '2026-10-08', text: '  Felt lighter  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ritual_id: r.id, date: '2026-10-08', text: 'Felt lighter', version: 1 });
    expect(Object.keys(res.body).sort()).toEqual(['created_at', 'date', 'id', 'ritual_id', 'text', 'updated_at', 'version']);
    const later = await add({ date: '2026-10-15', text: 'Still calm' });
    const sameDay = await add({ date: '2026-10-08', text: 'Second note' });
    expect((await list()).map(f => f.text)).toEqual(['Felt lighter', 'Second note', 'Still calm']);

    const edited = await patch(later.id, { version: 1, text: 'Calm, two weeks on', ritual_id: 9999 });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id: later.id, ritual_id: r.id, date: '2026-10-15', text: 'Calm, two weeks on', version: 2 });

    expect((await del(`/api/followups/${sameDay.id}`)).status).toBe(200);
    expect((await list()).map(f => f.id)).toEqual([res.body.id, later.id]);
    expect((await patch(sameDay.id, { version: 2, text: 'x' })).status).toBe(404);
    expect((await del(`/api/followups/${sameDay.id}`)).status).toBe(404);
    const back = await t.http().post(`/api/followups/${sameDay.id}/restore`);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ id: sameDay.id, text: 'Second note' });
    expect((await t.http().post(`/api/followups/${sameDay.id}/restore`)).status).toBe(404);
  });

  it('names every bad field with a code', async () => {
    const res = await post({ date: '2026-02-30', text: '' });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes).toEqual({
      ritual_id: { code: 'required' }, date: { code: 'bad_format', hint: 'date' }, text: { code: 'required' },
    });
    expect((await post({ ritual_id: r.id, date: '2026-10-08', text: 'x'.repeat(2001) })).body.detailCodes.text).toMatchObject({ code: 'too_long', max: 2000 });
    expect((await post({ ritual_id: 9999, date: '2026-10-08', text: 'x' })).body.detailCodes.ritual_id).toMatchObject({ code: 'not_found' });
    const f = await add();
    expect((await patch(f.id, { version: 1, date: '1899-01-01', text: ' ' })).body.detailCodes).toEqual({
      date: { code: 'bad_format', hint: 'date' }, text: { code: 'required' },
    });
    expect((await patch(f.id, { text: 'x' })).body.code).toBe('missing_version');
    expect((await t.http().get('/api/followups')).status).toBe(400);
  });

  it('a stale PATCH gets 409 with the current follow-up', async () => {
    const f = await add();
    await patch(f.id, { version: 1, text: 'B' });
    const stale = await patch(f.id, { version: 1, text: 'C' });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ id: f.id, text: 'B', version: 2 });
  });

  it('adding and editing a follow-up leaves the ritual version alone, so an open ritual form still saves', async () => {
    const open = await ritualVersion();
    const f = await add();
    await patch(f.id, { version: 1, text: 'Edited' });
    await del(`/api/followups/${f.id}`);
    await t.http().post(`/api/followups/${f.id}/restore`);
    expect(await ritualVersion()).toBe(open);
    const saved = await t.http().patch(`/api/rituals/${r.id}`).send({ version: open, outcome: 'It went well' });
    expect(saved.status).toBe(200);
    expect((await list()).map(x => x.text)).toEqual(['Edited']);
  });

  it('is hidden while its ritual is in the Trash and comes back with it', async () => {
    const f = await add();
    const gone = await add({ text: 'Deleted on its own' });
    await del(`/api/followups/${gone.id}`);
    await del(`/api/rituals/${r.id}`);
    expect((await t.http().get(`/api/followups?ritual=${r.id}`)).status).toBe(404);
    expect((await patch(f.id, { version: 1, text: 'x' })).status).toBe(404);
    expect((await del(`/api/followups/${f.id}`)).status).toBe(404);
    expect((await post({ ritual_id: r.id, date: '2026-10-08', text: 'x' })).body.detailCodes.ritual_id).toMatchObject({ code: 'not_found' });

    const restore = await t.http().post(`/api/followups/${gone.id}/restore`);
    expect(restore.status).toBe(409);
    expect(restore.body.code).toBe('ritual_in_trash');
    expect((await t.http().post(`/api/trash/followup/${gone.id}/restore`)).body.code).toBe('ritual_in_trash');

    await t.http().post(`/api/rituals/${r.id}/restore`);
    expect((await list()).map(x => x.id)).toEqual([f.id]);
    expect((await t.http().post(`/api/followups/${gone.id}/restore`)).status).toBe(200);
    expect((await list()).map(x => x.id)).toEqual([f.id, gone.id]);
  });

  it('shows in the Trash by the start of its text, and Empty Trash removes it', async () => {
    const long = 'A'.repeat(50) + ' and then some more words';
    const f = await add({ text: long });
    await del(`/api/followups/${f.id}`);
    const item = (await t.http().get('/api/trash')).body.find(x => x.type === 'followup');
    expect(item).toMatchObject({ type: 'followup', id: f.id, title: long.slice(0, 60) });
    expect((await del(`/api/trash/followup/${f.id}`)).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM ritual_followups').get().n).toBe(0);
    const g = await add();
    await del(`/api/followups/${g.id}`);
    expect((await t.http().post('/api/trash/empty').send({})).body.removed).toBe(1);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM ritual_followups').get().n).toBe(0);
  });

  it('deleting the ritual forever takes its follow-ups with it', async () => {
    await add();
    await del(`/api/rituals/${r.id}`);
    await del(`/api/trash/ritual/${r.id}`);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM ritual_followups').get().n).toBe(0);
  });
});

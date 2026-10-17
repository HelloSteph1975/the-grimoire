import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';
import { journalOnDay, matchJournal, listJournal } from '../../server/services/journal.js';

const NOW = new Date('2026-10-17T03:00:00Z');

let t;
beforeEach(async () => {
  t = makeTestContext({ now: () => NOW });
  await t.http().put('/api/settings').send({ time_zone: 'America/Chicago' });
});
afterEach(() => t.cleanup());

const db = () => t.ctx.db;
const post = body => t.http().post('/api/journal').send(body);
const patch = (id, body) => t.http().patch(`/api/journal/${id}`).send(body);
const get = async id => (await t.http().get(`/api/journal/${id}`)).body;
const list = async (query = '') => (await t.http().get(`/api/journal${query}`)).body;
const entry = async (body = {}) => {
  const res = await post({ date: '2026-10-20', title: 'Entry', ...body });
  if (res.status !== 201) throw new Error(`entry failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const codes = async (body, expectStatus = 400) => {
  const res = await post({ date: '2026-10-20', title: 'x', ...body });
  expect(res.status).toBe(expectStatus);
  return res.body.detailCodes;
};
const storedSky = id => db().prepare('SELECT sky FROM journal_entries WHERE id = ?').get(id).sky;
const kindId = async name => (await t.http().get('/api/journal-kinds')).body.find(k => k.name === name).id;

describe('/api/journal', () => {
  it('creates with every field and reads the same back', async () => {
    const dream = await kindId('Dream');
    const res = await post({
      date: '2026-10-25', time: '21:30', kind_id: dream, title: ' A river ', text: ' I walked along it. ',
      tags: ['water', 'night'], cards: [{ name: 'The Star', position: 'Past', reversed: true }, { name: ' ', position: '' }, { name: 'Ace of Cups' }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      date: '2026-10-25', time: '21:30', kind_id: dream, kind: { id: dream }, title: 'A river', text: 'I walked along it.', version: 1,
      tags: ['water', 'night'],
      cards: [{ name: 'The Star', position: 'Past', reversed: true }, { name: 'Ace of Cups', position: null, reversed: false }],
    });
    expect(res.body.sky).toMatchObject({ moon: 'full', weekday: 'sun', planet: 'sun' });
    expect(await get(res.body.id)).toEqual(res.body);
  });

  it('saves with only one card, or only text (Review Focus 1), and refuses an empty one', async () => {
    expect((await post({ date: '2026-10-20', cards: [{ name: 'The Moon' }] })).status).toBe(201);
    expect((await post({ date: '2026-10-20', text: 'Just words' })).status).toBe(201);
    const none = await post({ date: '2026-10-20' });
    expect(none.status).toBe(400);
    expect(none.body.detailCodes.title.code).toBe('empty');
    expect((await post({ date: '2026-10-20', title: '  ', text: '', cards: [{ name: '' }], tags: ['x'] })).body.detailCodes.title.code).toBe('empty');
  });

  it('checks each field limit', async () => {
    expect((await codes({ date: undefined })).date.code).toBe('required');
    expect((await codes({ date: '1899-12-31' })).date.code).toBe('bad_format');
    expect((await codes({ date: '2101-01-01' })).date.code).toBe('bad_format');
    expect((await codes({ time: '24:00' })).time.code).toBe('bad_format');
    expect((await codes({ title: 'x'.repeat(201) })).title.code).toBe('too_long');
    expect((await codes({ text: 'x'.repeat(20001) })).text.code).toBe('too_long');
    expect((await codes({ tags: Array.from({ length: 21 }, (_, i) => `t${i}`) })).tags.code).toBe('too_many');
    expect((await codes({ tags: ['ok', 'x'.repeat(51)] }))['tags.1'].code).toBe('too_long');
    expect((await codes({ cards: Array.from({ length: 21 }, (_, i) => ({ name: `c${i}` })) })).cards.code).toBe('too_many');
    expect((await codes({ cards: [{ position: 'Past' }] }))['cards.0.name'].code).toBe('required');
    expect((await codes({ cards: [{ name: 'x'.repeat(101) }] }))['cards.0.name'].code).toBe('too_long');
    expect((await codes({ cards: [{ name: 'a', position: 'x'.repeat(101) }] }))['cards.0.position'].code).toBe('too_long');
    expect((await post({ date: '2026-10-20', title: 'x', time: '23:59', tags: Array.from({ length: 20 }, (_, i) => `t${i}`) })).status).toBe(201);
  });

  it('keeps one tag for Luna, luna and Lúna (Review Focus 2)', async () => {
    const e = await entry({ tags: ['Luna', 'luna ', 'Lúna', ''] });
    expect(e.tags).toEqual(['Luna']);
    expect((await list('?tag=luna')).map(x => x.id)).toEqual([e.id]);
    expect((await list('?tag=L%C3%9ANA')).map(x => x.id)).toEqual([e.id]);
    expect((await t.http().get('/api/journal/tags')).body).toEqual(['Luna']);
  });

  it('lists tags in use on live entries: most used spelling, sorted', async () => {
    await entry({ tags: ['Water', 'zeta'] });
    await entry({ tags: ['water', 'alpha'] });
    await entry({ tags: ['WATER'] });
    const gone = await entry({ tags: ['hidden'] });
    await t.http().delete(`/api/journal/${gone.id}`);
    await entry({ tags: ['Water'] });
    expect((await t.http().get('/api/journal/tags')).body).toEqual(['alpha', 'Water', 'zeta']);
  });

  it('replaces tags and cards on PATCH, leaves them when not sent, and saves nothing on a bad card line', async () => {
    const e = await entry({ tags: ['a', 'b'], cards: [{ name: 'One' }, { name: 'Two' }] });
    const kept = await patch(e.id, { version: 1, title: 'New' });
    expect(kept.body).toMatchObject({ title: 'New', tags: ['a', 'b'], version: 2 });
    expect(kept.body.cards.map(c => c.name)).toEqual(['One', 'Two']);
    const bad = await patch(e.id, { version: 2, tags: ['z'], cards: [{ name: 'Fine' }, { position: 'no name' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.detailCodes['cards.1.name'].code).toBe('required');
    expect(await get(e.id)).toMatchObject({ version: 2, tags: ['a', 'b'] });
    const ok = await patch(e.id, { version: 2, tags: [], cards: [{ name: 'Only', reversed: true }] });
    expect(ok.body).toMatchObject({ tags: [], cards: [{ name: 'Only', position: null, reversed: true }], version: 3 });
  });

  it('checks the empty rule against stored values on PATCH', async () => {
    const e = await entry({ title: null, text: 'Only text' });
    const res = await patch(e.id, { version: 1, text: '' });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes.title.code).toBe('empty');
    const withTitle = await entry({ title: 'T', text: 'x' });
    expect((await patch(withTitle.id, { version: 1, text: '' })).status).toBe(200);
    const cardOnly = await entry({ title: null, cards: [{ name: 'C' }] });
    expect((await patch(cardOnly.id, { version: 1, date: '2026-10-21' })).status).toBe(200);
    expect((await patch(cardOnly.id, { version: 2, cards: [] })).body.detailCodes.title.code).toBe('empty');
  });

  it('conflicts on a stale save and returns the current entry', async () => {
    const e = await entry();
    await patch(e.id, { version: 1, title: 'Second' });
    const stale = await patch(e.id, { version: 1, title: 'Third' });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ title: 'Second', version: 2, tags: [] });
    expect((await t.http().patch('/api/journal/99999').send({ version: 1, title: 'x' })).status).toBe(404);
    expect((await t.http().patch(`/api/journal/${e.id}`).send({ title: 'x' })).status).toBe(400);
  });

  it('deletes to the Trash and restores', async () => {
    const e = await entry({ tags: ['a'], cards: [{ name: 'C' }] });
    expect((await t.http().delete(`/api/journal/${e.id}`)).status).toBe(200);
    expect((await t.http().get(`/api/journal/${e.id}`)).status).toBe(404);
    expect(await list()).toEqual([]);
    expect((await t.http().delete(`/api/journal/${e.id}`)).status).toBe(404);
    const back = await t.http().post(`/api/journal/${e.id}/restore`);
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ id: e.id, tags: ['a'], version: 3 });
    expect(back.body.cards).toHaveLength(1);
    expect((await t.http().post(`/api/journal/${e.id}/restore`)).status).toBe(404);
  });

  it('sets the sky on create and recomputes it only when the date or time changes (Review Focus 3)', async () => {
    const e = await entry({ date: '2026-10-25', time: '21:00' });
    expect(e.sky.moon).toBe('full');
    db().prepare(`UPDATE journal_entries SET sky = '{"moon":"marker","lit":0.5}' WHERE id = ?`).run(e.id);
    const before = storedSky(e.id);
    await patch(e.id, { version: 1, title: 'Only the title' });
    expect(storedSky(e.id)).toBe(before);
    const dated = await patch(e.id, { version: 2, date: '2026-10-18' });
    expect(dated.body.sky.moon).not.toBe('marker');
    expect(dated.body.sky.weekday).toBe('sun');
    const afterDate = dated.body.sky;
    const timed = await patch(e.id, { version: 3, time: '03:00' });
    expect(timed.body.sky.lit).not.toBe(afterDate.lit);
    const same = storedSky(e.id);
    await patch(e.id, { version: 4, time: '03:00', date: '2026-10-18' });
    expect(storedSky(e.id)).toBe(same);
  });

  it('lists newest first with the untimed entry before timed ones of the same day', async () => {
    const a = await entry({ date: '2026-10-20', time: '08:00', title: 'A' });
    const b = await entry({ date: '2026-10-20', title: 'B', text: 'x'.repeat(100) });
    const c = await entry({ date: '2026-10-21', time: '07:00', title: 'C' });
    const d = await entry({ date: '2026-10-20', time: '19:00', title: 'D' });
    const rows = await list();
    expect(rows.map(r => r.title)).toEqual(['C', 'B', 'D', 'A']);
    expect(rows[1]).toEqual({ id: b.id, date: '2026-10-20', time: null, kind_id: null, title: 'B', excerpt: 'x'.repeat(80), moon: b.sky.moon, version: 1 });
    expect(rows[0].excerpt).toBeNull();
    expect([a.id, c.id, d.id]).toHaveLength(3);
  });

  it('filters by kind, tag, dates and q, alone and together', async () => {
    const dream = await kindId('Dream');
    const tarot = await kindId('Tarot');
    const e1 = await entry({ date: '2026-10-10', title: 'Raven dream', kind_id: dream, tags: ['birds'] });
    const e2 = await entry({ date: '2026-10-12', title: 'Spread', kind_id: tarot, tags: ['Birds', 'cards'], cards: [{ name: 'The Tower', position: 'Crossing' }] });
    const e3 = await entry({ date: '2026-10-14', title: 'Plain', text: 'Café by the sea', tags: ['sea'] });
    const ids = async q => (await list(q)).map(r => r.id).sort();
    expect(await ids(`?kind=${dream}`)).toEqual([e1.id]);
    expect(await ids('?tag=BIRDS')).toEqual([e1.id, e2.id].sort());
    expect(await ids('?from=2026-10-12')).toEqual([e2.id, e3.id].sort());
    expect(await ids('?to=2026-10-12')).toEqual([e1.id, e2.id].sort());
    expect(await ids('?from=2026-10-11&to=2026-10-13')).toEqual([e2.id]);
    expect(await ids('?q=RAVEN')).toEqual([e1.id]);
    expect(await ids('?q=cafe')).toEqual([e3.id]);
    expect(await ids('?q=tower')).toEqual([e2.id]);
    expect(await ids('?q=crossing')).toEqual([e2.id]);
    expect(await ids('?q=cards')).toEqual([e2.id]);
    expect(await ids('?q=%20%20sea%20')).toEqual([e3.id]);
    expect(await ids(`?tag=birds&kind=${tarot}&q=tower&from=2026-10-01&to=2026-10-31`)).toEqual([e2.id]);
    expect(await ids(`?tag=birds&kind=${dream}&q=tower`)).toEqual([]);
    expect((await t.http().get('/api/journal?from=nope')).status).toBe(400);
  });

  it('keeps the kind hidden while it is in the Trash and raises the version (Review Focus 4)', async () => {
    const dream = await kindId('Dream');
    const e = await entry({ kind_id: dream });
    await t.http().delete(`/api/journal-kinds/${dream}`);
    const shown = await get(e.id);
    expect(shown).toMatchObject({ kind_id: dream, kind: null, version: 2 });
    expect((await list())[0].kind_id).toBeNull();
    expect((await list(`?kind=${dream}`))).toEqual([]);
    const saved = await patch(e.id, { version: 2, kind_id: shown.kind_id, kind: shown.kind, title: 'Renamed' });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ kind_id: dream, kind: null });
    const nulled = await patch(e.id, { version: 3, kind_id: null });
    expect(nulled.body.kind_id).toBe(dream);
    expect((await patch(e.id, { version: 4, kind_id: await kindId('Sign') })).status).toBe(200);
  });

  it('shows the kind again on restore, and drops it to null when deleted forever', async () => {
    const dream = await kindId('Dream');
    const e = await entry({ kind_id: dream });
    await t.http().delete(`/api/journal-kinds/${dream}`);
    await t.http().post(`/api/trash/journalKind/${dream}/restore`);
    expect(await get(e.id)).toMatchObject({ kind_id: dream, kind: { id: dream }, version: 3 });
    await t.http().delete(`/api/journal-kinds/${dream}`);
    await t.http().delete(`/api/trash/journalKind/${dream}`);
    expect(await get(e.id)).toMatchObject({ kind_id: null, kind: null });
    const stale = await patch(e.id, { version: 5, kind_id: dream });
    expect(stale.status).toBe(200);
    expect(stale.body.kind_id).toBeNull();
    const bad = await post({ date: '2026-10-20', title: 'x', kind_id: 999999 });
    expect(bad.status).toBe(400);
    expect(bad.body.detailCodes.kind_id.code).toBe('not_found');
  });

  it('lists journal and journalKind rows in the Trash with their titles, and Empty Trash purges them', async () => {
    const a = await entry({ title: 'Titled', tags: ['a'], cards: [{ name: 'C' }] });
    const b = await entry({ title: null, text: 'y'.repeat(100) });
    const c = await entry({ title: null, cards: [{ name: 'Card' }] });
    for (const x of [a, b, c]) await t.http().delete(`/api/journal/${x.id}`);
    const dream = await kindId('Dream');
    await t.http().delete(`/api/journal-kinds/${dream}`);
    const trash = (await t.http().get('/api/trash')).body;
    const titleOf = (type, id) => trash.find(r => r.type === type && r.id === id)?.title;
    expect(titleOf('journal', a.id)).toBe('Titled');
    expect(titleOf('journal', b.id)).toBe('y'.repeat(60));
    expect(titleOf('journal', c.id)).toBe('2026-10-20');
    expect(titleOf('journalKind', dream)).toBe('Dream');
    expect((await t.http().delete(`/api/trash/journal/${a.id}`)).status).toBe(200);
    expect((await t.http().post('/api/trash/empty').send({})).status).toBe(200);
    expect(db().prepare('SELECT count(*) AS n FROM journal_entries').get().n).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM journal_entry_tags').get().n).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM journal_cards').get().n).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM journal_kinds').get().n).toBe(3);
  });

  it('exports journalOnDay, matchJournal and listJournal for later tasks', async () => {
    const dream = await kindId('Dream');
    const timed = await entry({ date: '2026-10-22', time: '09:00', title: 'Timed', kind_id: dream, text: 'Ünder the oak' });
    const untimed = await entry({ date: '2026-10-22', title: 'Untimed' });
    await entry({ date: '2026-10-23', title: 'Other day' });
    expect(journalOnDay(db(), '2026-10-22')).toEqual([
      { id: untimed.id, time: null, title: 'Untimed', excerpt: null, kind_id: null },
      { id: timed.id, time: '09:00', title: 'Timed', excerpt: 'Ünder the oak', kind_id: dream },
    ]);
    expect(matchJournal(db(), 'under').map(r => r.id)).toEqual([timed.id]);
    expect(listJournal(db(), { q: ' UNDER ' }).map(r => r.id)).toEqual([timed.id]);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

// Friday 2026-10-16 at 22:00 in Chicago, though already Saturday in UTC.
const NOW = new Date('2026-10-17T03:00:00Z');

let t, trads;
beforeEach(async () => {
  t = makeTestContext({ now: () => NOW });
  await t.http().put('/api/settings').send({ time_zone: 'America/Chicago' });
  trads = (await t.http().get('/api/traditions')).body;
});
afterEach(() => t.cleanup());

const db = () => t.ctx.db;
const post = body => t.http().post('/api/rituals').send(body);
const patch = (id, body) => t.http().patch(`/api/rituals/${id}`).send(body);
const del = path => t.http().delete(path);
const get = async id => (await t.http().get(`/api/rituals/${id}`)).body;
const list = async (query = '') => (await t.http().get(`/api/rituals${query}`)).body;
const spell = async (title = 'Clear the house', extra = {}) => (await t.http().post('/api/spells').send({ title, ...extra })).body;
const ritual = async (body = {}) => {
  const res = await post({ title: 'Ritual', date: '2026-10-31', ...body });
  if (res.status !== 201) throw new Error(`ritual failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const codes = async body => {
  const res = await post({ title: 'x', date: '2026-10-31', ...body });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('invalid');
  return res.body.detailCodes;
};
const supplyCount = id => db().prepare('SELECT count(*) AS n FROM ritual_supplies WHERE ritual_id = ?').get(id).n;
const storedSky = id => db().prepare('SELECT sky FROM rituals WHERE id = ?').get(id).sky;
const markSky = id => db().prepare(`UPDATE rituals SET sky = '{"moon":"marker"}' WHERE id = ?`).run(id);

describe('/api/rituals', () => {
  it('creates with every field and reads the same back', async () => {
    const s = await spell();
    const res = await post({
      title: ' Full moon cleansing ', spell_id: s.id, date: '2024-06-21', time: '21:30', reminder_days: 3,
      plan_notes: 'Open the windows.', status: 'planned', changes: null, outcome: '', rating: null,
      traditions: [trads[1].id, trads[0].id],
      supplies: [{ name: 'White candle', amount: '1', checked: true }, { name: '  ', amount: '' }, { name: 'Salt', amount: '', checked: false }],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Full moon cleansing', spell_id: s.id, spell: { id: s.id, title: 'Clear the house' }, date: '2024-06-21', time: '21:30',
      reminder_days: 3, plan_notes: 'Open the windows.', status: 'planned', changes: null, outcome: null, rating: null, version: 1,
      traditions: [trads[0].id, trads[1].id],
      supplies: [{ name: 'White candle', amount: '1', checked: true }, { name: 'Salt', amount: null, checked: false }],
      sky: { moon: 'full', weekday: 'fri', planet: 'venus' },
    });
    expect(res.body.sky.lit).toBeGreaterThan(0.98);
    expect(Object.keys(res.body).sort()).toEqual(['changes', 'created_at', 'date', 'id', 'outcome', 'plan_notes', 'rating', 'reminder_days',
      'sky', 'spell', 'spell_id', 'status', 'supplies', 'time', 'title', 'traditions', 'updated_at', 'version']);
    expect(await get(res.body.id)).toEqual(res.body);
  });

  it('creates with only a title and a date', async () => {
    const res = await post({ title: 'Small', date: '2026-10-31', time: '' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ spell_id: null, spell: null, time: null, reminder_days: null, status: 'planned', rating: null, traditions: [], supplies: [] });
    expect(res.body.sky).toMatchObject({ weekday: 'sat', planet: 'saturn' });
  });

  it('names every bad field with a code', async () => {
    expect(await codes({ title: '', date: '' })).toMatchObject({ title: { code: 'required' }, date: { code: 'required' } });
    expect((await codes({ title: 'x'.repeat(201) })).title).toMatchObject({ code: 'too_long', max: 200 });
    for (const date of ['2026-02-30', '1899-12-31', '2101-01-01', 'tomorrow']) {
      expect((await codes({ date })).date).toMatchObject({ code: 'bad_format', hint: 'date' });
    }
    expect(await codes({ title: '', date: '1899-12-31' })).toEqual({ title: { code: 'required' }, date: { code: 'bad_format', hint: 'date' } });
    for (const time of ['24:00', '9:00', '12:60', 'noon']) expect((await codes({ time })).time).toMatchObject({ code: 'bad_format', hint: 'time' });
    expect((await codes({ reminder_days: 31 })).reminder_days).toMatchObject({ code: 'too_big', max: 30 });
    expect((await codes({ reminder_days: -1 })).reminder_days).toMatchObject({ code: 'too_small', min: 0 });
    expect((await codes({ reminder_days: 1.5 })).reminder_days).toMatchObject({ code: 'not_whole' });
    expect(await codes({ plan_notes: 'x'.repeat(4001), changes: 'x'.repeat(4001), outcome: 'x'.repeat(4001) })).toMatchObject({
      plan_notes: { code: 'too_long', max: 4000 }, changes: { code: 'too_long', max: 4000 }, outcome: { code: 'too_long', max: 4000 },
    });
    expect((await codes({ rating: 6 })).rating).toMatchObject({ code: 'too_big', max: 5 });
    expect((await codes({ rating: 0 })).rating).toMatchObject({ code: 'too_small', min: 1 });
    expect((await codes({ status: 'maybe' })).status).toMatchObject({ code: 'not_one_of' });
    expect((await codes({ status: null })).status).toMatchObject({ code: 'required' });
    expect((await codes({ traditions: Array.from({ length: 21 }, (_, i) => i + 1) })).traditions).toMatchObject({ code: 'too_many', max: 20 });
    expect((await codes({ traditions: ['a'] })).traditions).toMatchObject({ code: 'bad_id' });
    expect((await codes({ traditions: [9999] })).traditions).toMatchObject({ code: 'not_found' });
    expect((await codes({ spell_id: 9999 })).spell_id).toMatchObject({ code: 'not_found' });
    expect((await codes({ spell_id: 'abc' })).spell_id).toMatchObject({ code: 'not_number' });
    expect((await codes({ supplies: 'candle' })).supplies).toMatchObject({ code: 'bad_format' });
    expect((await codes({ supplies: Array.from({ length: 51 }, () => ({ name: 'x' })) })).supplies).toMatchObject({ code: 'too_many', max: 50 });
    expect(await codes({
      title: '',
      supplies: [{ name: 'x'.repeat(201) }, { name: '', amount: '2' }, { name: 'ok', amount: 'x'.repeat(51) }, { name: 'ok', checked: 'yes' }, 'candle'],
    })).toEqual({
      title: { code: 'required' },
      'supplies.0.name': { code: 'too_long', max: 200 },
      'supplies.1.name': { code: 'required' },
      'supplies.2.amount': { code: 'too_long', max: 50 },
      'supplies.3.checked': { code: 'bad_format' },
      'supplies.4.name': { code: 'required' },
    });
    expect(db().prepare('SELECT count(*) AS n FROM rituals').get().n).toBe(0);
  });

  it('PATCH replaces the supplies in order and leaves fields it does not send alone', async () => {
    const r = await ritual({ plan_notes: 'Keep me', supplies: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }] });
    const res = await patch(r.id, { version: 1, supplies: [{ name: 'Three', amount: '3', checked: true }, { name: 'One' }] });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.supplies).toEqual([{ name: 'Three', amount: '3', checked: true }, { name: 'One', amount: null, checked: false }]);
    expect(res.body.plan_notes).toBe('Keep me');
    expect(supplyCount(r.id)).toBe(2);
    expect(await get(r.id)).toEqual(res.body);
    const cleared = await patch(r.id, { version: 2, supplies: null });
    expect(cleared.body.supplies).toEqual([]);
  });

  it('a PATCH with one bad supply line saves nothing', async () => {
    const r = await ritual({ title: 'Before', supplies: [{ name: 'One' }] });
    const res = await patch(r.id, { version: 1, title: 'After', supplies: [{ name: 'Two' }, { name: '', amount: 'a pinch' }] });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes).toEqual({ 'supplies.1.name': { code: 'required' } });
    expect(await get(r.id)).toEqual(r);
  });

  it('a stale PATCH gets 409 with the current ritual and changes nothing', async () => {
    const r = await ritual({ supplies: [{ name: 'One' }] });
    await patch(r.id, { version: 1, title: 'B' });
    const stale = await patch(r.id, { version: 1, title: 'C', supplies: [], spell_id: 9999 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('conflict');
    expect(stale.body.current).toEqual(await get(r.id));
    expect(stale.body.current).toMatchObject({ title: 'B', version: 2, supplies: [{ name: 'One' }] });
  });

  it('PATCH needs a version and a live ritual', async () => {
    const r = await ritual();
    expect((await patch(r.id, { title: 'x' })).body.code).toBe('missing_version');
    expect((await patch(9999, { version: 1, title: 'x' })).status).toBe(404);
    await del(`/api/rituals/${r.id}`);
    expect((await patch(r.id, { version: 2, title: 'x' })).status).toBe(404);
  });

  it('logs a ritual and lets the status go back to planned', async () => {
    const r = await ritual();
    const done = await patch(r.id, { version: 1, status: 'done', changes: 'Used a blue candle', outcome: 'Calm all week', rating: 4 });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'done', changes: 'Used a blue candle', outcome: 'Calm all week', rating: 4 });
    const back = await patch(r.id, { version: 2, status: 'planned', rating: null });
    expect(back.body).toMatchObject({ status: 'planned', rating: null, outcome: 'Calm all week' });
    expect((await patch(r.id, { version: 3, status: 'skipped' })).body.status).toBe('skipped');
  });

  describe('the sky snapshot', () => {
    it('is set on create for the day in her zone', async () => {
      const r = await ritual({ date: '2024-06-21' });
      expect(r.sky).toMatchObject({ moon: 'full', weekday: 'fri', planet: 'venus' });
      expect(JSON.parse(storedSky(r.id))).toEqual(r.sky);
    });

    it('changes when the date changes', async () => {
      const r = await ritual({ date: '2024-06-21' });
      const res = await patch(r.id, { version: 1, date: '2024-06-23' });
      expect(res.body.sky).toMatchObject({ moon: 'waning-gibbous', weekday: 'sun', planet: 'sun' });
    });

    it('changes when the time changes', async () => {
      const r = await ritual({ date: '2026-10-18', time: '00:30' });
      markSky(r.id);
      const res = await patch(r.id, { version: 1, time: '23:30' });
      expect(res.body.sky.moon).toBe('first-quarter');
      expect(res.body.sky.lit).toBeGreaterThan(r.sky.lit);
    });

    it('is left alone by a save that keeps the date and time', async () => {
      const r = await ritual({ date: '2024-06-21', time: '21:00' });
      markSky(r.id);
      const title = await patch(r.id, { version: 1, title: 'Renamed' });
      expect(title.body.sky).toEqual({ moon: 'marker' });
      const same = await patch(r.id, { version: 2, date: '2024-06-21', time: '21:00', status: 'done' });
      expect(same.body.sky).toEqual({ moon: 'marker' });
    });
  });

  describe('tabs', () => {
    async function seed() {
      const out = {};
      out.yesterday = await ritual({ title: 'Yesterday', date: '2026-10-15' });
      out.lastWeek = await ritual({ title: 'Last week', date: '2026-10-09', time: '08:00' });
      out.todayLate = await ritual({ title: 'Today late', date: '2026-10-16', time: '23:30' });
      out.todayEarly = await ritual({ title: 'Today early', date: '2026-10-16', time: '06:00' });
      out.tomorrow = await ritual({ title: 'Tomorrow', date: '2026-10-17' });
      out.doneOld = await ritual({ title: 'Done old', date: '2026-09-01', status: 'done', rating: 2 });
      out.skipped = await ritual({ title: 'Skipped', date: '2026-10-10', status: 'skipped' });
      out.doneFuture = await ritual({ title: 'Done ahead', date: '2026-11-01', status: 'done', rating: 5 });
      return out;
    }
    const titles = rows => rows.map(r => r.title);

    it('sorts by status and today in her zone, with today in Planned all day', async () => {
      await seed();
      expect(titles(await list('?tab=planned'))).toEqual(['Today early', 'Today late', 'Tomorrow']);
      expect(titles(await list('?tab=tolog'))).toEqual(['Last week', 'Yesterday']);
      expect(titles(await list('?tab=log'))).toEqual(['Done ahead', 'Skipped', 'Done old']);
      expect(titles(await list())).toEqual(['Done old', 'Last week', 'Skipped', 'Yesterday', 'Today early', 'Today late', 'Tomorrow', 'Done ahead']);
    });

    it('lists the short shape', async () => {
      const { tomorrow } = await seed();
      const row = (await list('?tab=planned')).find(r => r.id === tomorrow.id);
      expect(row).toEqual({ id: tomorrow.id, title: 'Tomorrow', spell_id: null, date: '2026-10-17', time: null, status: 'planned', rating: null, version: 1 });
    });

    it('leaves out rituals in the Trash', async () => {
      const { tomorrow } = await seed();
      await del(`/api/rituals/${tomorrow.id}`);
      expect(titles(await list('?tab=planned'))).toEqual(['Today early', 'Today late']);
    });

    it('filters by spell, tradition, rating at least, and dates', async () => {
      const s = await spell();
      await seed();
      await ritual({ title: 'With spell', date: '2026-10-01', status: 'done', spell_id: s.id, rating: 3, traditions: [trads[0].id] });
      expect(titles(await list(`?tab=log&spell=${s.id}`))).toEqual(['With spell']);
      expect(titles(await list(`?tab=log&tradition=${trads[0].id}`))).toEqual(['With spell']);
      expect(titles(await list('?tab=log&rating=3'))).toEqual(['Done ahead', 'With spell']);
      expect(titles(await list('?tab=log&from=2026-10-01&to=2026-10-10'))).toEqual(['Skipped', 'With spell']);
      expect(titles(await list('?tab=log&from=2026-10-02'))).toEqual(['Done ahead', 'Skipped']);
      expect(titles(await list('?tab=log&rating='))).toHaveLength(4);
    });

    it('turns down a bad tab or filter', async () => {
      for (const q of ['?tab=soon', '?rating=6', '?rating=x', '?from=2026-13-01', '?to=soon', '?spell=x']) {
        const res = await t.http().get(`/api/rituals${q}`);
        expect(res.status, q).toBe(400);
      }
    });
  });

  describe('a spell in the Trash', () => {
    it('raises the ritual version, hides the spell and keeps the link', async () => {
      const s = await spell();
      const r = await ritual({ spell_id: s.id });
      expect((await del(`/api/spells/${s.id}`)).status).toBe(200);
      const hidden = await get(r.id);
      expect(hidden.version).toBe(2);
      expect(hidden).toMatchObject({ spell_id: s.id, spell: null });
      // An open form with the old version conflicts instead of dropping the link.
      expect((await patch(r.id, { version: 1, title: 'Stale' })).status).toBe(409);
      // A PATCH with the GET's values keeps it; so does sending no spell.
      const kept = await patch(r.id, { ...hidden, title: 'Changed' });
      expect(kept.status).toBe(200);
      expect(kept.body).toMatchObject({ title: 'Changed', spell_id: s.id, spell: null });
      const none = await patch(r.id, { version: kept.body.version, spell_id: null });
      expect(none.body.spell_id).toBe(s.id);
      await t.http().post(`/api/spells/${s.id}/restore`);
      const back = await get(r.id);
      expect(back.version).toBe(none.body.version + 1);
      expect(back.spell).toEqual({ id: s.id, title: 'Clear the house' });
    });

    it('cannot be newly linked', async () => {
      const s = await spell();
      await del(`/api/spells/${s.id}`);
      expect((await codes({ spell_id: s.id })).spell_id).toMatchObject({ code: 'not_found' });
      const r = await ritual();
      expect((await patch(r.id, { version: 1, spell_id: s.id })).body.detailCodes.spell_id).toMatchObject({ code: 'not_found' });
    });

    it('restoring through the Trash raises the version too', async () => {
      const s = await spell();
      const r = await ritual({ spell_id: s.id });
      await del(`/api/spells/${s.id}`);
      await t.http().post(`/api/trash/spell/${s.id}/restore`);
      expect((await get(r.id)).version).toBe(3);
      expect((await t.http().post(`/api/trash/spell/${s.id}/restore`)).body.code).toBe('not_in_trash');
    });

    it('deleted forever leaves the ritual with no spell, and a form still holding it saves', async () => {
      const s = await spell();
      const r = await ritual({ spell_id: s.id });
      await del(`/api/spells/${s.id}`);
      const open = await get(r.id);
      expect((await del(`/api/trash/spell/${s.id}`)).status).toBe(200);
      const now = await get(r.id);
      expect(now.version).toBe(open.version + 1);
      expect(now).toMatchObject({ spell_id: null, spell: null });
      const res = await patch(r.id, { ...now, spell_id: s.id, title: 'Changed' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'Changed', spell_id: null });
      const fresh = await ritual({ spell_id: s.id });
      expect(fresh.spell_id).toBe(null);
    });

    it('a ritual in the Trash is not bumped', async () => {
      const s = await spell();
      const r = await ritual({ spell_id: s.id });
      await del(`/api/rituals/${r.id}`);
      const before = db().prepare('SELECT version FROM rituals WHERE id = ?').get(r.id).version;
      await del(`/api/spells/${s.id}`);
      expect(db().prepare('SELECT version FROM rituals WHERE id = ?').get(r.id).version).toBe(before);
    });
  });

  describe('a tradition in the Trash', () => {
    it('raises the version, is hidden, kept on save and shown again on restore', async () => {
      const r = await ritual({ traditions: [trads[0].id, trads[1].id] });
      await del(`/api/traditions/${trads[0].id}`);
      const hidden = await get(r.id);
      expect(hidden.version).toBe(2);
      expect(hidden.traditions).toEqual([trads[1].id]);
      const saved = await patch(r.id, { ...hidden, title: 'Changed' });
      expect(saved.status).toBe(200);
      await t.http().post(`/api/traditions/${trads[0].id}/restore`);
      const back = await get(r.id);
      expect(back.version).toBe(saved.body.version + 1);
      expect(back.traditions).toEqual([trads[0].id, trads[1].id]);
    });

    it('a tradition deleted forever is dropped from a save', async () => {
      const tr = (await t.http().post('/api/traditions').send({ name: 'Short lived' })).body;
      const r = await ritual({ traditions: [tr.id, trads[0].id] });
      await del(`/api/traditions/${tr.id}`);
      await del(`/api/trash/tradition/${tr.id}`);
      const now = await get(r.id);
      const res = await patch(r.id, { title: 'Changed', traditions: [tr.id, trads[0].id], version: now.version });
      expect(res.status).toBe(200);
      expect(res.body.traditions).toEqual([trads[0].id]);
    });
  });

  describe('Trash', () => {
    it('deletes to the Trash with its supplies, restores, and deleting forever removes them', async () => {
      const r = await ritual({ title: 'Gone soon', supplies: [{ name: 'One' }, { name: 'Two' }], traditions: [trads[0].id] });
      expect((await del(`/api/rituals/${r.id}`)).status).toBe(200);
      expect((await t.http().get(`/api/rituals/${r.id}`)).status).toBe(404);
      expect((await del(`/api/rituals/${r.id}`)).status).toBe(404);
      expect((await t.http().get('/api/trash')).body).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'ritual', id: r.id, title: 'Gone soon' })]));
      const back = await t.http().post(`/api/rituals/${r.id}/restore`);
      expect(back.status).toBe(200);
      expect(back.body).toMatchObject({ id: r.id, supplies: [{ name: 'One' }, { name: 'Two' }], traditions: [trads[0].id] });
      expect((await t.http().post(`/api/rituals/${r.id}/restore`)).body.code).toBe('not_in_trash');
      expect((await t.http().post(`/api/trash/ritual/${r.id}/restore`)).body.code).toBe('not_in_trash');
      await del(`/api/rituals/${r.id}`);
      expect((await t.http().post(`/api/trash/ritual/${r.id}/restore`)).body).toMatchObject({ id: r.id, title: 'Gone soon' });
      await del(`/api/rituals/${r.id}`);
      expect((await del(`/api/trash/ritual/${r.id}`)).status).toBe(200);
      expect(supplyCount(r.id)).toBe(0);
      expect(db().prepare('SELECT count(*) AS n FROM ritual_traditions WHERE ritual_id = ?').get(r.id).n).toBe(0);
    });

    it('empties the Trash with a ritual, its spell and a follow-up in it', async () => {
      const s = await spell();
      const r = await ritual({ spell_id: s.id, supplies: [{ name: 'One' }] });
      const f = (await t.http().post('/api/followups').send({ ritual_id: r.id, date: '2026-11-01', text: 'Still calm' })).body;
      await del(`/api/followups/${f.id}`);
      await del(`/api/rituals/${r.id}`);
      await del(`/api/spells/${s.id}`);
      const res = await t.http().post('/api/trash/empty').send({});
      expect(res.status).toBe(200);
      expect(res.body.removed).toBe(3);
      for (const table of ['rituals', 'ritual_supplies', 'ritual_followups', 'spells']) {
        expect(db().prepare(`SELECT count(*) AS n FROM ${table}`).get().n, table).toBe(0);
      }
    });
  });
});

describe('/api/spells/:id/rituals and usage', () => {
  it('lists the spell\'s live rituals, planned soonest first and past newest first', async () => {
    const s = await spell();
    const other = await spell('Other');
    await ritual({ title: 'Next month', spell_id: s.id, date: '2026-11-20' });
    await ritual({ title: 'Today', spell_id: s.id, date: '2026-10-16' });
    await ritual({ title: 'Unlogged', spell_id: s.id, date: '2026-10-01' });
    await ritual({ title: 'Done', spell_id: s.id, date: '2026-10-10', status: 'done' });
    await ritual({ title: 'Not this spell', spell_id: other.id });
    const gone = await ritual({ title: 'In the Trash', spell_id: s.id });
    await del(`/api/rituals/${gone.id}`);
    const res = await t.http().get(`/api/spells/${s.id}/rituals`);
    expect(res.status).toBe(200);
    expect(res.body.planned.map(r => r.title)).toEqual(['Today', 'Next month']);
    expect(res.body.past.map(r => r.title)).toEqual(['Done', 'Unlogged']);
    expect(res.body.planned[0]).toEqual(expect.objectContaining({ spell_id: s.id, status: 'planned', version: 1 }));
    expect((await t.http().get(`/api/spells/${s.id}/usage`)).body).toEqual({ rituals: 4 });
    expect((await t.http().get(`/api/spells/${other.id}/usage`)).body).toEqual({ rituals: 1 });
    expect((await t.http().get('/api/spells/9999/usage')).status).toBe(404);
    expect((await t.http().get('/api/spells/9999/rituals')).status).toBe(404);
  });
});

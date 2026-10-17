import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, makeEntry } from './helpers.js';
import { calendarItems } from '../../server/services/calendar.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

const NORTH = { time_zone: 'UTC', hemisphere: 'north' };
const SOUTH = { time_zone: 'UTC', hemisphere: 'south' };
const cat = key => t.ctx.db.prepare('SELECT id FROM categories WHERE starter_key = ?').get(key).id;
// The fixture content has no sabbats, so they go in by SQL with their starter keys.
const sabbat = (key, feastDay = null) => Number(t.ctx.db.prepare(`INSERT INTO correspondences
  (category_id, name, feast_day, starter_key, is_starter) VALUES (?, ?, ?, ?, 1)`)
  .run(cat('category.sabbats-feasts'), key[0].toUpperCase() + key.slice(1), feastDay, `corr.sabbats-feasts.${key}`).lastInsertRowid);
const items = (from, to, settings = NORTH) => calendarItems(t.ctx.db, { from, to }, settings);
const notMoon = list => list.filter(i => i.kind !== 'moon');
const onDay = (list, day) => list.filter(i => i.day === day && i.kind !== 'moon');

describe('calendarItems', () => {
  it('places a feast, a saint and leaves out a hidden feast', async () => {
    const feast = await makeEntry(t, cat('category.sabbats-feasts'), 'Harvest supper', { feast_day: '10-28' });
    const saint = await makeEntry(t, cat('category.saints'), 'San Judas', { feast_day: '10-28' });
    const deity = await makeEntry(t, cat('category.deities'), 'Hecate', { feast_day: '10-28' });
    await makeEntry(t, cat('category.colors'), 'Hidden', { feast_day: '10-28', show_on_calendar: false });
    await makeEntry(t, cat('category.colors'), 'No day');
    const day = onDay(items('2026-10-01', '2026-10-31'), '2026-10-28');
    expect(day).toEqual([
      { day: '2026-10-28', kind: 'feast', entry: { id: feast.id, name: 'Harvest supper', starter_key: null, is_starter: 0, category_id: feast.category_id } },
      { day: '2026-10-28', kind: 'saint', entry: expect.objectContaining({ id: saint.id }) },
      { day: '2026-10-28', kind: 'saint', entry: expect.objectContaining({ id: deity.id }) },
    ]);
  });

  it('leaves out an entry in the Trash and repeats a feast in each year', async () => {
    const gone = await makeEntry(t, cat('category.colors'), 'Gone', { feast_day: '01-01' });
    await t.http().delete(`/api/correspondences/${gone.id}`);
    const leap = await makeEntry(t, cat('category.colors'), 'Leap', { feast_day: '02-29' });
    const list = notMoon(items('2026-12-01', '2027-01-31'));
    expect(list).toEqual([]);
    expect(notMoon(items('2027-02-01', '2027-03-01'))).toEqual([expect.objectContaining({ day: '2027-02-28', entry: expect.objectContaining({ id: leap.id }) })]);
    expect(notMoon(items('2028-02-01', '2028-03-01')).map(i => i.day)).toEqual(['2028-02-29']);
  });

  it('puts Yule on the December solstice day in the zone and fixed sabbats on their feast day', () => {
    const yule = sabbat('yule', '12-25');
    const samhain = sabbat('samhain', '10-31');
    sabbat('beltane', '05-01');
    expect(onDay(items('2027-12-01', '2027-12-31', { time_zone: 'America/Chicago', hemisphere: 'north' }), '2027-12-21'))
      .toEqual([{ day: '2027-12-21', kind: 'sabbat', entry: expect.objectContaining({ id: yule }) }]);
    expect(notMoon(items('2027-12-01', '2027-12-31')).map(i => i.day)).toEqual(['2027-12-22']);
    expect(notMoon(items('2026-10-01', '2026-10-31')).map(i => [i.day, i.kind, i.entry.id])).toEqual([['2026-10-31', 'sabbat', samhain]]);
  });

  it('moves the sabbats to the opposite point of the wheel in the south', () => {
    const yule = sabbat('yule');
    const samhain = sabbat('samhain', '10-31');
    const beltane = sabbat('beltane', '05-02');
    const south = items('2024-04-25', '2024-06-25', { time_zone: 'Pacific/Auckland', hemisphere: 'south' });
    expect(notMoon(south).map(i => [i.day, i.entry.id])).toEqual([['2024-05-02', samhain], ['2024-06-21', yule]]);
    expect(notMoon(items('2026-10-01', '2026-10-31', SOUTH)).map(i => [i.day, i.entry.id])).toEqual([['2026-10-31', beltane]]);
  });

  it('uses the default day when the opposite sabbat is gone or has none', () => {
    const samhain = sabbat('samhain', '10-31');
    const imbolc = sabbat('imbolc', '02-01');
    sabbat('lughnasadh');
    t.ctx.db.prepare("UPDATE correspondences SET deleted_at = '2026-01-01' WHERE starter_key = 'corr.sabbats-feasts.lughnasadh'").run();
    // Samhain in the south takes Beltane's day; with no Beltane, May 1. Imbolc takes Lughnasadh's, Aug 1.
    expect(notMoon(items('2026-04-01', '2026-08-31', SOUTH)).map(i => [i.day, i.entry.id])).toEqual([['2026-05-01', samhain], ['2026-08-01', imbolc]]);
  });

  it('leaves out a hidden or trashed sabbat', () => {
    sabbat('yule');
    sabbat('samhain', '10-31');
    t.ctx.db.prepare("UPDATE correspondences SET show_on_calendar = 0 WHERE starter_key = 'corr.sabbats-feasts.yule'").run();
    t.ctx.db.prepare("UPDATE correspondences SET deleted_at = '2026-01-01' WHERE starter_key = 'corr.sabbats-feasts.samhain'").run();
    expect(notMoon(items('2026-10-01', '2026-12-31'))).toEqual([]);
  });

  it('ignores a feast day on a moving sabbat, and a self-made Samhain does not move', async () => {
    const ostara = sabbat('ostara', '03-01');
    const mine = await makeEntry(t, cat('category.sabbats-feasts'), 'Samhain', { feast_day: '10-31' });
    expect(notMoon(items('2026-03-01', '2026-03-31')).map(i => [i.day, i.entry.id])).toEqual([['2026-03-20', ostara]]);
    expect(notMoon(items('2026-04-01', '2026-11-30', SOUTH)).map(i => [i.day, i.kind, i.entry.id])).toEqual([['2026-09-23', 'sabbat', ostara], ['2026-10-31', 'feast', mine.id]]);
  });

  it('includes the moon quarters on the day in the zone', () => {
    const moon = items('2024-06-01', '2024-06-30', { time_zone: 'America/Chicago', hemisphere: 'north' }).filter(i => i.kind === 'moon');
    expect(moon).toContainEqual({ day: '2024-06-21', kind: 'moon', quarter: 'full', at: expect.stringMatching(/^2024-06-22T01:/) });
    expect(moon.map(i => i.quarter)).toEqual(['new', 'first-quarter', 'full', 'last-quarter']);
  });

  it('puts a yearly February 29 on February 28 in other years, and a one-time date only in its year', async () => {
    const leap = (await t.http().post('/api/own-dates').send({ title: 'Leap day', date: '2024-02-29', yearly: true })).body;
    const once = (await t.http().post('/api/own-dates').send({ title: 'Once', date: '2025-02-10' })).body;
    const gone = (await t.http().post('/api/own-dates').send({ title: 'Gone', date: '2025-02-11' })).body;
    await t.http().delete(`/api/own-dates/${gone.id}`);
    expect(notMoon(items('2025-02-01', '2025-03-01'))).toEqual([
      { day: '2025-02-10', kind: 'own', date: { id: once.id, title: 'Once', yearly: 0 } },
      { day: '2025-02-28', kind: 'own', date: { id: leap.id, title: 'Leap day', yearly: 1 } },
    ]);
    expect(notMoon(items('2028-02-01', '2028-03-01'))).toEqual([{ day: '2028-02-29', kind: 'own', date: { id: leap.id, title: 'Leap day', yearly: 1 } }]);
    expect(notMoon(items('2026-02-01', '2026-03-01')).map(i => i.date.title)).toEqual(['Leap day']);
  });

  it('starts a yearly date in its own year', async () => {
    await t.http().post('/api/own-dates').send({ title: 'Started', date: '2025-03-10', yearly: true });
    expect(notMoon(items('2024-03-01', '2024-03-31'))).toEqual([]);
    expect(notMoon(items('2025-03-01', '2025-03-31')).map(i => i.day)).toEqual(['2025-03-10']);
    expect(notMoon(items('2026-03-01', '2026-03-31')).map(i => i.day)).toEqual(['2026-03-10']);
  });

  it('leaves out the moon when asked', () => {
    const list = calendarItems(t.ctx.db, { from: '2024-06-01', to: '2024-06-30' }, NORTH, { moon: false });
    expect(list.filter(i => i.kind === 'moon')).toEqual([]);
  });

  it('sorts by day, then kind, then id', async () => {
    const own = (await t.http().post('/api/own-dates').send({ title: 'Mine', date: '2026-11-02' })).body;
    const saint = await makeEntry(t, cat('category.saints'), 'A saint', { feast_day: '11-02' });
    const b = await makeEntry(t, cat('category.colors'), 'B feast', { feast_day: '11-02' });
    const a = await makeEntry(t, cat('category.colors'), 'A feast', { feast_day: '11-02' });
    const first = await makeEntry(t, cat('category.colors'), 'First', { feast_day: '11-01' });
    expect(notMoon(items('2026-11-01', '2026-11-02')).map(i => [i.day, i.kind, i.entry?.id ?? i.date.id]))
      .toEqual([['2026-11-01', 'feast', first.id], ['2026-11-02', 'feast', b.id], ['2026-11-02', 'feast', a.id], ['2026-11-02', 'saint', saint.id], ['2026-11-02', 'own', own.id]]);
  });

  it('shows live rituals of every status on their day, after saints and before own dates', async () => {
    const ritual = async body => (await t.http().post('/api/rituals').send({ title: 'Ritual', date: '2026-11-02', ...body })).body;
    const own = (await t.http().post('/api/own-dates').send({ title: 'Mine', date: '2026-11-02' })).body;
    const saint = await makeEntry(t, cat('category.saints'), 'A saint', { feast_day: '11-02' });
    const evening = await ritual({ title: 'Evening', time: '20:00' });
    const morning = await ritual({ title: 'Morning', time: '07:30' });
    const done = await ritual({ title: 'Done', date: '2026-11-01' });
    expect((await t.http().patch(`/api/rituals/${done.id}`).send({ status: 'done', version: done.version })).status).toBe(200);
    const gone = await ritual({ title: 'Gone' });
    await t.http().delete(`/api/rituals/${gone.id}`);
    await ritual({ title: 'Outside', date: '2026-11-03' });
    expect(notMoon(items('2026-11-01', '2026-11-02'))).toEqual([
      { day: '2026-11-01', kind: 'ritual', ritual: { id: done.id, title: 'Done', status: 'done', time: null } },
      { day: '2026-11-02', kind: 'saint', entry: expect.objectContaining({ id: saint.id }) },
      { day: '2026-11-02', kind: 'ritual', ritual: { id: morning.id, title: 'Morning', status: 'planned', time: '07:30' } },
      { day: '2026-11-02', kind: 'ritual', ritual: { id: evening.id, title: 'Evening', status: 'planned', time: '20:00' } },
      { day: '2026-11-02', kind: 'own', date: expect.objectContaining({ id: own.id }) },
    ]);
  });
});

describe('GET /api/calendar', () => {
  const get = q => t.http().get(`/api/calendar${q}`);

  it('returns the items in the Settings zone', async () => {
    await t.http().put('/api/settings').send({ time_zone: 'America/Chicago' });
    const res = await get('?from=2024-06-01&to=2024-06-30');
    expect(res.status).toBe(200);
    expect(res.body.items).toContainEqual(expect.objectContaining({ day: '2024-06-21', kind: 'moon', quarter: 'full' }));
    expect((await get('?from=2024-01-01&to=2024-03-03')).status).toBe(200);
  });

  it('reports bad ranges with codes', async () => {
    const codes = async q => {
      const res = await get(q);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid');
      return res.body.detailCodes;
    };
    expect(await codes('?from=2024-13-01&to=2024-12-31')).toEqual({ from: { code: 'bad_format' } });
    expect(await codes('?from=2024-02-30&to=1899-12-31')).toEqual({ from: { code: 'bad_format' }, to: { code: 'bad_format' } });
    expect(await codes('?from=2024-01-01')).toEqual({ to: { code: 'bad_format' } });
    expect(await codes('?from=2024-01-01&to=2101-01-01')).toEqual({ to: { code: 'bad_format' } });
    expect(await codes('?from=2024-03-02&to=2024-03-01')).toEqual({ range: { code: 'reversed' } });
    expect(await codes('?from=2024-01-01&to=2024-03-04')).toEqual({ range: { code: 'too_long', max: 62 } });
  });
});

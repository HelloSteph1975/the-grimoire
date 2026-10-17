import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, makeEntry } from './helpers.js';
import { suggestDays } from '../../server/services/suggestions.js';
import { moonPhaseOnDay, weekdayOf } from '../../server/services/sky.js';
import { addDays } from '../../server/services/calendar.js';

// Friday 2026-10-16 at 22:00 in Chicago, though already Saturday in UTC.
const NOW = new Date('2026-10-17T03:00:00Z');
const CHICAGO = { time_zone: 'America/Chicago', hemisphere: 'north' };
const FROM = '2026-10-17';

let t;
beforeEach(async () => {
  t = makeTestContext({ now: () => NOW });
  await t.http().put('/api/settings').send({ time_zone: 'America/Chicago' });
});
afterEach(() => t.cleanup());

const cat = key => t.ctx.db.prepare('SELECT id FROM categories WHERE starter_key = ?').get(key).id;
const spell = async (extra = {}) => {
  const res = await t.http().post('/api/spells').send({ title: 'Spell', ...extra });
  if (res.status !== 201) throw new Error(`spell failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const suggest = (s, from = FROM) => suggestDays(t.ctx.db, s.id, from, CHICAGO);
const score = s => Object.values(s.met).filter(list => list.length).length;
const EMPTY = { moon: [], days: [], planets: [], feasts: [] };

describe('suggestDays', () => {
  it('puts the full-moon day first for a spell that wants a full moon', async () => {
    const s = await spell({ timing: { moon: ['full'] } });
    const list = suggest(s);
    expect(list[0]).toEqual({ day: '2026-10-25', met: { ...EMPTY, moon: ['full'] } });
    expect(list.map(x => x.day)).toEqual(['2026-10-25', '2026-11-24', '2026-12-23']);
  });

  it('ranks a day meeting two groups above days meeting one, then by date', async () => {
    const s = await spell({ timing: { moon: ['full'], day: ['fri'] } });
    // 2027-01-22 is a full moon on a Friday in Chicago.
    const list = suggest(s, '2026-12-01');
    expect(list[0]).toEqual({ day: '2027-01-22', met: { ...EMPTY, moon: ['full'], days: ['fri'] } });
    expect(list.slice(1).every(x => score(x) === 1)).toBe(true);
    const rest = list.slice(1).map(x => x.day);
    expect(rest).toEqual([...rest].sort());
    expect(rest[0]).toBe('2026-12-04');
  });

  it('returns only Fridays for a spell ruled by Venus', async () => {
    const s = await spell({ timing: { planet: ['venus'] } });
    const list = suggest(s);
    expect(list).toHaveLength(10);
    expect(list.every(x => weekdayOf(x.day) === 'fri')).toBe(true);
    expect(list[0]).toEqual({ day: '2026-10-23', met: { ...EMPTY, planets: ['venus'] } });
  });

  it('finds a feast entry on its day', async () => {
    const feast = await makeEntry(t, cat('category.colors'), 'Hallows', { feast_day: '10-31' });
    const s = await spell({ feasts: [feast.id] });
    expect(suggest(s)).toEqual([{ day: '2026-10-31', met: { ...EMPTY, feasts: [feast.id] } }]);
  });

  it('counts a feast hidden from the calendar, and a sabbat on its computed day', async () => {
    const hidden = await makeEntry(t, cat('category.colors'), 'Hidden', { feast_day: '11-02', show_on_calendar: false });
    const yule = Number(t.ctx.db.prepare(`INSERT INTO correspondences (category_id, name, starter_key, is_starter)
      VALUES (?, 'Yule', 'corr.sabbats-feasts.yule', 1)`).run(cat('category.sabbats-feasts')).lastInsertRowid);
    const s = await spell({ feasts: [hidden.id, yule] });
    expect(suggest(s).map(x => [x.day, x.met.feasts])).toEqual([['2026-11-02', [hidden.id]], ['2026-12-21', [yule]]]);
  });

  it('gives nothing for a spell with no timing', async () => {
    const s = await spell();
    expect(suggest(s)).toEqual([]);
  });

  it('returns at most 10 days, all within 90 days of the start', async () => {
    const s = await spell({ timing: { moon: ['waxing-crescent', 'waning-gibbous'], day: ['mon', 'sat'] } });
    const list = suggest(s);
    expect(list).toHaveLength(10);
    expect(list.every(x => x.day >= FROM && x.day <= addDays(FROM, 89))).toBe(true);
    const scores = list.map(score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('only looks 90 days ahead', async () => {
    const feast = await makeEntry(t, cat('category.colors'), 'Late', { feast_day: '01-15' });
    const s = await spell({ feasts: [feast.id] });
    // 2026-10-17 + 89 is 2027-01-14; 2026-10-18 + 89 is 2027-01-15.
    expect(suggest(s)).toEqual([]);
    expect(suggest(s, '2026-10-18')).toEqual([{ day: '2027-01-15', met: { ...EMPTY, feasts: [feast.id] } }]);
  });

  it('reads the moon phase the same way as the calendar day by day', async () => {
    const s = await spell({ timing: { moon: ['waxing-gibbous'] } });
    for (const x of suggest(s)) expect(moonPhaseOnDay(x.day, 'America/Chicago')).toBe('waxing-gibbous');
  });
});

describe('GET /api/spells/:id/suggestions', () => {
  const get = (id, q = '') => t.http().get(`/api/spells/${id}/suggestions${q}`);

  it('starts tomorrow in the Settings zone by default', async () => {
    const s = await spell({ timing: { day: ['sat'] } });
    const res = await get(s.id);
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].day).toBe('2026-10-17');
    expect((await get(s.id, '?from=2026-10-18')).body.suggestions[0].day).toBe('2026-10-24');
  });

  it('gives 404 for a spell in the Trash or one that does not exist', async () => {
    const s = await spell({ timing: { day: ['sat'] } });
    await t.http().delete(`/api/spells/${s.id}`);
    expect((await get(s.id)).status).toBe(404);
    expect((await get(9999)).status).toBe(404);
  });

  it('gives 400 bad_format for a bad from', async () => {
    const s = await spell({ timing: { day: ['sat'] } });
    for (const q of ['?from=2026-02-30', '?from=tomorrow', '?from=1899-12-31']) {
      const res = await get(s.id, q);
      expect(res.status).toBe(400);
      expect(res.body.detailCodes).toEqual({ from: { code: 'bad_format' } });
    }
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext, makeEntry } from './helpers.js';
import { todayPage } from '../../server/services/today.js';

let t;
afterEach(() => t?.cleanup());

const CHICAGO = { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone: 'America/Chicago' };
const cat = key => t.ctx.db.prepare('SELECT id FROM categories WHERE starter_key = ?').get(key).id;
const ownDate = async (title, date, yearly = false) => (await t.http().post('/api/own-dates').send({ title, date, yearly })).body;
const brief = list => list.map(i => [i.day, i.kind, i.entry?.name ?? i.date.title, i.days_away]);

describe('todayPage', () => {
  // Friday 2026-10-16 in Chicago, though already Saturday in UTC.
  const FRIDAY = new Date('2026-10-17T03:00:00Z');

  async function fridayEntry() {
    const venus = await makeEntry(t, cat('category.planets'), 'Venus');
    const green = await makeEntry(t, cat('category.colors'), 'Green');
    const pink = await makeEntry(t, cat('category.colors'), 'Pink');
    const quartz = await makeEntry(t, cat('category.crystals'), 'Rose quartz');
    const gone = await makeEntry(t, cat('category.planets'), 'Gone');
    const friday = await makeEntry(t, cat('category.days'), 'Friday', { links: [venus.id, green.id, pink.id, quartz.id, gone.id] });
    await t.http().delete(`/api/correspondences/${gone.id}`);
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.days.friday', is_starter = 1 WHERE id = ?").run(friday.id);
    return { friday, venus, green, pink };
  }

  it('reads the planet and color from the weekday entry, edited or not, and only the weekday once it is gone', async () => {
    t = makeTestContext({ now: () => FRIDAY });
    const { friday, venus, green, pink } = await fridayEntry();
    const page = todayPage(t.ctx.db, FRIDAY, CHICAGO);
    expect(page.day).toBe('2026-10-16');
    expect(page.weekday).toBe('fri');
    expect(page.planets).toEqual([{ id: venus.id, name: 'Venus', starter_key: null, is_starter: 0, category_id: venus.category_id }]);
    expect(page.colors.map(e => e.id)).toEqual([green.id, pink.id]);

    const current = (await t.http().get(`/api/correspondences/${friday.id}`)).body;
    expect((await t.http().patch(`/api/correspondences/${friday.id}`).send({ name: 'Viernes', version: current.version })).status).toBe(200);
    const renamed = todayPage(t.ctx.db, FRIDAY, CHICAGO);
    expect(renamed.planets.map(e => e.id)).toEqual([venus.id]);
    expect(renamed.colors.map(e => e.id)).toEqual([green.id, pink.id]);

    await t.http().delete(`/api/correspondences/${friday.id}`);
    const gone = todayPage(t.ctx.db, FRIDAY, CHICAGO);
    expect(gone).toMatchObject({ day: '2026-10-16', weekday: 'fri', planets: [], colors: [] });
  });

  it('gives the moon for now', () => {
    t = makeTestContext({ now: () => FRIDAY });
    const page = todayPage(t.ctx.db, FRIDAY, CHICAGO);
    expect(page.moon).toMatchObject({ code: expect.any(String), lit: expect.any(Number), waxing: expect.any(Boolean) });
    expect(page.moon.next).toHaveLength(4);
  });

  it('lists the next three items from tomorrow, wrapping into next year and skipping hidden feasts', async () => {
    const now = new Date('2026-12-30T18:00:00Z');
    t = makeTestContext({ now: () => now });
    const c = cat('category.colors');
    await makeEntry(t, c, 'Today feast', { feast_day: '12-30' });
    await makeEntry(t, c, 'Hidden', { feast_day: '12-31', show_on_calendar: false });
    await makeEntry(t, c, 'Kings', { feast_day: '01-02' });
    await ownDate('Past once', '2026-01-03');
    await ownDate('Visit', '2027-01-02');
    await makeEntry(t, c, 'Fifth', { feast_day: '01-05' });
    await makeEntry(t, c, 'Sixth', { feast_day: '01-06' });
    expect(brief(todayPage(t.ctx.db, now, CHICAGO).coming)).toEqual([
      ['2027-01-02', 'feast', 'Kings', 3],
      ['2027-01-02', 'own', 'Visit', 3],
      ['2027-01-05', 'feast', 'Fifth', 6],
    ]);
  });

  it('does not list a yearly date before its own year', async () => {
    const now = new Date('2024-12-31T18:00:00Z');
    t = makeTestContext({ now: () => now });
    await ownDate('Started', '2025-03-10', true);
    await ownDate('Earlier', '2024-03-01', true);
    expect(brief(todayPage(t.ctx.db, now, CHICAGO).coming)).toEqual([
      ['2025-03-01', 'own', 'Earlier', 60],
      ['2025-03-10', 'own', 'Started', 69],
    ]);
    // In March 2024 its first day (2025-03-10) is more than 366 days off, and 2024-03-10 is before it starts.
    const march = new Date('2024-03-01T18:00:00Z');
    t.cleanup();
    t = makeTestContext({ now: () => march });
    await ownDate('Started', '2025-03-10', true);
    expect(brief(todayPage(t.ctx.db, march, CHICAGO).coming)).toEqual([]);
  });

  it('searches most of a year ahead and shows fewer when fewer exist', async () => {
    const now = new Date('2026-10-16T15:00:00Z');
    t = makeTestContext({ now: () => now });
    await makeEntry(t, cat('category.saints'), 'Far', { feast_day: '10-15' });
    await ownDate('Birthday', '1990-10-16', true);
    expect(brief(todayPage(t.ctx.db, now, CHICAGO).coming)).toEqual([
      ['2027-10-15', 'saint', 'Far', 364],
      ['2027-10-16', 'own', 'Birthday', 365],
    ]);
  });
});

describe('GET /api/today', () => {
  it('uses the clock and the Settings zone', async () => {
    const now = new Date('2026-10-17T03:00:00Z');
    t = makeTestContext({ now: () => now });
    expect((await t.http().put('/api/settings').send({ time_zone: 'America/Chicago' })).status).toBe(200);
    const res = await t.http().get('/api/today');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ day: '2026-10-16', weekday: 'fri', planets: [], colors: [], coming: [] });
    await t.http().put('/api/settings').send({ time_zone: 'UTC' });
    expect((await t.http().get('/api/today')).body).toMatchObject({ day: '2026-10-17', weekday: 'sat' });
  });
});

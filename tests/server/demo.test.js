import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';
import { seedDemo } from '../../server/demo/seed.js';

let t;
afterEach(() => t?.cleanup());

describe('demo seed', () => {
  it('adds sample data once and resets on request', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const names = (await t.http().get('/api/traditions')).body.map(r => r.name);
    expect(names.filter(n => n === 'Kitchen witchery')).toHaveLength(1);
    expect((await t.http().get('/api/trash')).body.map(r => r.title)).toContain('Hedge witchery');
    seedDemo(t.ctx, { reset: true });
    expect((await t.http().get('/api/traditions')).body.filter(r => r.name === 'Kitchen witchery')).toHaveLength(1);
    const n = table => t.ctx.db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    expect(n('categories')).toBe(9);
    expect(n('correspondences')).toBe(0);
    expect(n('correspondence_links')).toBe(0);
  });

  it('adds the two sample spells once and clears the spell tables on reset', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const list = async () => (await t.http().get('/api/spells')).body;
    expect((await list()).map(s => s.title)).toEqual(['A candle for a calm home', 'Doorway sweep']);
    const candle = (await t.http().get(`/api/spells/${(await list())[0].id}`)).body;
    expect(candle.ingredients).toHaveLength(3);
    expect(candle.steps).toHaveLength(3);
    expect(candle.timing).toMatchObject({ day: ['mon'], moon: ['full'] });
    const kinds = (await t.http().get('/api/spell-kinds')).body;
    expect(candle.kind_id).toBe(kinds.find(k => k.starter_key === 'spell-kind.blessing').id);
    expect(candle.source).toBeNull();

    // A spell of the owner's own goes with a reset; the samples are put back once.
    await t.http().post('/api/spells').send({ title: 'Mine', steps: ['One'] });
    expect(await list()).toHaveLength(3);
    seedDemo(t.ctx, { reset: true });
    expect((await list()).map(s => s.title)).toEqual(['A candle for a calm home', 'Doorway sweep']);
    const n = table => t.ctx.db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    expect(n('spells')).toBe(2);
    expect(n('spell_steps')).toBe(5);
    expect(n('spell_ingredients')).toBe(5);
  });

  it('adds the two sample dates once and puts them back after a reset', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const list = async () => (await t.http().get('/api/own-dates')).body;
    const titles = async () => (await list()).map(d => d.title).sort();
    expect(await titles()).toEqual(['Light a candle for the ancestors', 'Visit the old orchard']);
    const candle = (await list()).find(d => d.title === 'Light a candle for the ancestors');
    expect(candle.date.slice(5)).toBe('11-02');
    expect(candle.yearly).toBe(1);
    expect((await list()).find(d => d.title === 'Visit the old orchard').yearly).toBe(0);

    await t.http().post('/api/own-dates').send({ title: 'Mine', date: '2026-05-01' });
    expect(await list()).toHaveLength(3);
    seedDemo(t.ctx, { reset: true });
    expect(await titles()).toEqual(['Light a candle for the ancestors', 'Visit the old orchard']);
    expect(t.ctx.db.prepare('SELECT count(*) n FROM own_date_traditions').get().n).toBe(0);
  });

  it('adds the two sample rituals once and puts them back after a reset', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const list = async () => (await t.http().get('/api/rituals')).body;
    const titles = async () => (await list()).map(r => r.title).sort();
    expect(await titles()).toEqual(['Calm home candle', 'Calm home candle, last week']);
    const rows = await list();
    const planned = rows.find(r => r.title === 'Calm home candle');
    const done = rows.find(r => r.title.endsWith('last week'));
    expect(planned.status).toBe('planned');
    expect(done).toMatchObject({ status: 'done', rating: 4 });
    const today = (await t.http().get('/api/today')).body.day;
    expect(planned.date > today).toBe(true);
    expect(done.date).toBe(new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10));
    const followups = (await t.http().get(`/api/followups?ritual=${done.id}`)).body;
    expect(followups).toHaveLength(1);
    expect((await t.http().get(`/api/rituals/${planned.id}`)).body.supplies).toHaveLength(3);

    await t.http().post('/api/rituals').send({ title: 'Mine', date: today });
    expect(await list()).toHaveLength(3);
    seedDemo(t.ctx, { reset: true });
    expect(await titles()).toEqual(['Calm home candle', 'Calm home candle, last week']);
    const n = table => t.ctx.db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    expect(n('rituals')).toBe(2);
    expect(n('ritual_followups')).toBe(1);
    expect(n('ritual_supplies')).toBe(6);
  });

  it('adds the three sample journal entries once and puts them back after a reset', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const list = async () => (await t.http().get('/api/journal')).body;
    const titles = async () => (await list()).map(r => r.title).sort();
    const want = ['A heron on the garden wall', 'The house with the open windows', 'Three cards for the week'];
    expect(await titles()).toEqual(want);
    const today = (await t.http().get('/api/today')).body.day;
    const day = n => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
    const rows = await list();
    const byTitle = title => rows.find(r => r.title === title);
    expect(byTitle('The house with the open windows').date).toBe(day(-2));
    expect(byTitle('Three cards for the week').date).toBe(day(-1));
    expect(byTitle('A heron on the garden wall').date).toBe(today);

    const dream = (await t.http().get(`/api/journal/${byTitle('The house with the open windows').id}`)).body;
    expect(dream.tags).toEqual(['water', 'house']);
    const tarot = (await t.http().get(`/api/journal/${byTitle('Three cards for the week').id}`)).body;
    expect(tarot.cards).toHaveLength(3);
    expect(tarot.cards.filter(c => c.reversed)).toHaveLength(1);
    expect(tarot.cards.every(c => c.position)).toBe(true);
    const kinds = (await t.http().get('/api/journal-kinds')).body;
    expect(tarot.kind_id).toBe(kinds.find(k => k.starter_key === 'journal-kind.tarot').id);

    await t.http().post('/api/journal').send({ date: today, title: 'Mine' });
    expect(await list()).toHaveLength(4);
    seedDemo(t.ctx, { reset: true });
    expect(await titles()).toEqual(want);
    const n = table => t.ctx.db.prepare(`SELECT count(*) n FROM ${table}`).get().n;
    expect(n('journal_entries')).toBe(3);
    expect(n('journal_cards')).toBe(3);
    expect(n('journal_entry_tags')).toBe(4);
  });
});

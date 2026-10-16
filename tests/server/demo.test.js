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
});

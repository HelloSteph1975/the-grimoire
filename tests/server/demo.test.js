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
  });
});

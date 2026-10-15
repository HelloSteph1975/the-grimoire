import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('system routes', () => {
  it('backs up now and lists backups', async () => {
    t = makeTestContext();
    const made = await t.http().post('/api/backups');
    expect(made.status).toBe(201);
    const list = await t.http().get('/api/backups');
    expect(list.body.map(b => b.name)).toContain(made.body.name);
  });
  it('restores through the API', async () => {
    t = makeTestContext();
    const { body: b } = await t.http().post('/api/backups');
    await t.http().post('/api/traditions').send({ name: 'Gone after restore' });
    const res = await t.http().post('/api/backups/restore').send({ name: b.name });
    expect(res.status).toBe(200);
    const names = (await t.http().get('/api/traditions')).body.map(r => r.name);
    expect(names).not.toContain('Gone after restore');
  });
  it('backs up and calls onShutdown on POST /api/shutdown', async () => {
    const onShutdown = vi.fn();
    t = makeTestContext({ onShutdown });
    const res = await t.http().post('/api/shutdown');
    expect(res.body).toEqual({ ok: true });
    await new Promise(r => setImmediate(r));
    expect(onShutdown).toHaveBeenCalled();
    expect((await t.http().get('/api/backups')).body.length).toBe(1);
  });
  it('shows the data folder', async () => {
    t = makeTestContext();
    expect((await t.http().get('/api/data-folder')).body.path).toBe(t.dataDir);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('health and guards', () => {
  it('answers /api/health', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, demo: false });
  });
  it('refuses a request that names another host', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/health').set('Host', 'evil.example');
    expect(res.status).toBe(403);
  });
  it('refuses a write from another site', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/nothing').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
  it('gives 404 JSON for unknown API routes', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No such API route');
  });
});

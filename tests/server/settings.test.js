import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

describe('/api/settings', () => {
  it('returns defaults', async () => {
    const res = await t.http().get('/api/settings');
    expect(res.body).toMatchObject({ language: 'en', theme: 'old-book', hemisphere: 'north' });
    expect(typeof res.body.time_zone).toBe('string');
  });
  it('saves valid values', async () => {
    const res = await t.http().put('/api/settings').send({ theme: 'book-folk', time_zone: 'Europe/Lisbon', hemisphere: 'south' });
    expect(res.body).toMatchObject({ theme: 'book-folk', time_zone: 'Europe/Lisbon', hemisphere: 'south' });
    expect((await t.http().get('/api/settings')).body.theme).toBe('book-folk');
  });
  it('accepts a time zone alias', async () => {
    const res = await t.http().put('/api/settings').send({ time_zone: 'Asia/Calcutta' });
    expect(res.status).toBe(200);
    expect(res.body.time_zone).toBe('Asia/Calcutta');
  });
  it('rejects unknown keys and bad values and saves nothing', async () => {
    const res = await t.http().put('/api/settings').send({ theme: 'neon', time_zone: 'Mars/Base', colour: 'x', hemisphere: 'south' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details).sort()).toEqual(['colour', 'theme', 'time_zone']);
    expect((await t.http().get('/api/settings')).body.hemisphere).toBe('north');
  });
  it('accepts a language only when its pack exists', async () => {
    expect((await t.http().put('/api/settings').send({ language: 'es' })).status).toBe(400);
    const dir = path.join(t.dataDir, 'locales', 'es');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ _name: 'Español' }));
    expect((await t.http().put('/api/settings').send({ language: 'es' })).body.language).toBe('es');
  });
});

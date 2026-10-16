import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext } from './helpers.js';
import { restoreBackup, backupNow } from '../../server/services/backup.js';
import { readEpoch } from '../../server/services/epoch.js';

let t;
afterEach(() => t?.cleanup());

const epochFile = () => path.join(t.dataDir, 'epoch.txt');
const RESTORED = 'Your data was restored from a backup in another window. Reload the page to continue.';

describe('data epoch', () => {
  it('creates epoch.txt on startup and sends it on every API response', async () => {
    t = makeTestContext();
    const epoch = fs.readFileSync(epochFile(), 'utf8').trim();
    expect(epoch).toMatch(/^[0-9a-f]{32}$/);
    expect((await t.http().get('/api/health')).headers['x-grimoire-epoch']).toBe(epoch);
    expect((await t.http().get('/api/nope')).headers['x-grimoire-epoch']).toBe(epoch);
  });

  it('keeps the same epoch across a restart', () => {
    t = makeTestContext();
    const before = readEpoch(t.dataDir);
    t.ctx.db.close();
    const again = makeTestContext({ dataDir: t.dataDir });
    expect(again.ctx.epoch).toBe(before);
    again.ctx.db.close();
  });

  it('a restore writes a new epoch', async () => {
    t = makeTestContext();
    const before = readEpoch(t.dataDir);
    const { name } = backupNow(t.ctx.db, t.dataDir);
    restoreBackup(t.ctx, name, { discard: () => {} });
    const after = fs.readFileSync(epochFile(), 'utf8').trim();
    expect(after).not.toBe(before);
    expect(t.ctx.epoch).toBe(after);
  });

  it('the restore response carries the new epoch', async () => {
    t = makeTestContext();
    const { body: b } = await t.http().post('/api/backups');
    const res = await t.http().post('/api/backups/restore').send({ name: b.name });
    expect(res.status).toBe(200);
    expect(res.headers['x-grimoire-epoch']).toBe(readEpoch(t.dataDir));
  });

  it('refuses a write sent with an old epoch and changes nothing', async () => {
    t = makeTestContext();
    const { body: row } = await t.http().post('/api/traditions').send({ name: 'Before' });
    const res = await t.http().patch(`/api/traditions/${row.id}`).set('X-Grimoire-Epoch', 'stale').send({ name: 'After', version: row.version });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: RESTORED, code: 'restored', restored: true });
    expect((await t.http().get(`/api/traditions/${row.id}`)).body).toMatchObject({ name: 'Before', version: row.version });
  });

  it('allows a write sent with the current epoch', async () => {
    t = makeTestContext();
    const { body: row } = await t.http().post('/api/traditions').set('X-Grimoire-Epoch', t.ctx.epoch).send({ name: 'Before' });
    const res = await t.http().patch(`/api/traditions/${row.id}`).set('X-Grimoire-Epoch', t.ctx.epoch).send({ name: 'After', version: row.version });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('After');
  });

  it('allows a write with no epoch header', async () => {
    t = makeTestContext();
    expect((await t.http().post('/api/traditions').send({ name: 'Scripted' })).status).toBe(201);
  });

  it('a window opened before a restore cannot overwrite the restored data', async () => {
    t = makeTestContext();
    const { body: b } = await t.http().post('/api/backups');
    const old = (await t.http().get('/api/health')).headers['x-grimoire-epoch'];
    await t.http().post('/api/backups/restore').send({ name: b.name });
    const res = await t.http().post('/api/traditions').set('X-Grimoire-Epoch', old).send({ name: 'From the stale window' });
    expect(res.status).toBe(409);
    expect(res.body.restored).toBe(true);
    const names = (await t.http().get('/api/traditions')).body.map(r => r.name);
    expect(names).not.toContain('From the stale window');
  });
});

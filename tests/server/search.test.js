import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext, makeEntry } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

const cat = () => t.ctx.db.prepare('SELECT id FROM categories LIMIT 1').get().id;
const search = q => t.http().get(`/api/search?q=${encodeURIComponent(q)}`);
const ok = async (pending, status = 201) => {
  const res = await pending;
  if (res.status !== status) throw new Error(`failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
};
const spell = body => ok(t.http().post('/api/spells').send({ title: 'A spell', ...body }));
const ritual = body => ok(t.http().post('/api/rituals').send({ title: 'A ritual', date: '2026-10-20', ...body }));
const entry = body => ok(t.http().post('/api/journal').send({ date: '2026-10-16', title: 'An entry', ...body }));
const ownDate = body => ok(t.http().post('/api/own-dates').send({ title: 'A date', date: '2026-11-01', ...body }));
const ids = g => g.items.map(i => i.id);

describe('/api/search', () => {
  it('finds one word in all five groups', async () => {
    t = makeTestContext();
    const s = await spell({ title: 'Plain', steps: ['Burn the zephyrleaf'] });
    const c = await makeEntry(t, cat(), 'Plain entry', { body: 'The zephyrleaf is airy.' });
    const r = await ritual({ title: 'Plain ritual' });
    await ok(t.http().post('/api/followups').send({ ritual_id: r.id, date: '2026-10-25', text: 'Check the zephyrleaf' }));
    const j = await entry({ title: 'Plain', cards: [{ name: 'Moon', position: 'zephyrleaf' }] });
    const d = await ownDate({ title: 'Plain', notes: 'Bring zephyrleaf' });
    const res = await search('zephyrleaf');
    expect(res.status).toBe(200);
    expect(res.body.q).toBe('zephyrleaf');
    const g = res.body.groups;
    expect(g.spells).toEqual({ total: 1, items: [{ id: s.id, title: 'Plain', purpose: null }] });
    expect(ids(g.correspondences)).toEqual([c.id]);
    expect(Object.keys(g.correspondences.items[0]).sort()).toEqual(['category_id', 'id', 'is_starter', 'name', 'starter_key', 'summary']);
    expect(g.rituals).toEqual({ total: 1, items: [{ id: r.id, title: 'Plain ritual', date: '2026-10-20', status: 'planned' }] });
    expect(g.journal.items).toEqual([{ id: j.id, date: '2026-10-16', time: null, title: 'Plain', excerpt: null, kind_id: null }]);
    expect(g.dates).toEqual({ total: 1, items: [{ id: d.id, title: 'Plain', date: '2026-11-01', yearly: 0 }] });
  });

  it('matches what the spell and correspondence lists find, in the same order', async () => {
    t = makeTestContext();
    await spell({ title: 'Zed two', notes: 'amber' });
    await spell({ title: 'Amber one' });
    await makeEntry(t, cat(), 'Zebra', { summary: 'Amber glow' });
    await makeEntry(t, cat(), 'Amberly');
    const g = (await search('amber')).body.groups;
    const spells = (await t.http().get('/api/spells?q=amber')).body;
    const corrs = (await t.http().get('/api/correspondences?q=amber')).body;
    expect(ids(g.spells)).toEqual(spells.map(x => x.id));
    expect(ids(g.correspondences)).toEqual(corrs.map(x => x.id));
    expect(g.spells.total).toBe(2);
  });

  it('ignores accents and case', async () => {
    t = makeTestContext();
    await entry({ title: 'Café nights' });
    expect((await search('cafe')).body.groups.journal.total).toBe(1);
    expect((await search('CAFÉ')).body.groups.journal.total).toBe(1);
  });

  it('finds a translated starter correspondence by its Spanish word', async () => {
    t = makeTestContext();
    const es = path.join(t.dataDir, 'locales', 'es');
    fs.mkdirSync(es, { recursive: true });
    fs.writeFileSync(path.join(es, 'ui.json'), JSON.stringify({ _name: 'Español' }));
    fs.writeFileSync(path.join(es, 'content.json'), JSON.stringify({ 'corr.test.salt.summary': 'Protección del hogar' }));
    const salt = await makeEntry(t, cat(), 'Salt');
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.test.salt', is_starter = 1 WHERE id = ?").run(salt.id);
    expect(ids((await search('hogar')).body.groups.correspondences)).toEqual([]);
    await ok(t.http().put('/api/settings').send({ language: 'es' }), 200);
    expect(ids((await search('proteccion')).body.groups.correspondences)).toEqual([salt.id]);
  });

  it('caps the items and keeps the total', async () => {
    t = makeTestContext();
    for (let i = 0; i < 25; i++) await entry({ title: `Moonwalk ${i}` });
    for (let i = 0; i < 55; i++) await ownDate({ title: `Moonday ${i}` });
    const g = (await search('moon')).body.groups;
    expect(g.journal.total).toBe(25);
    expect(g.journal.items).toHaveLength(20);
    expect(g.dates.total).toBe(55);
    expect(g.dates.items).toHaveLength(50);
  });

  it('never returns records in the Trash, nor follow-ups of a ritual in the Trash', async () => {
    t = makeTestContext();
    const s = await spell({ title: 'Gone velvet' });
    const r = await ritual({ title: 'Plain' });
    await ok(t.http().post('/api/followups').send({ ritual_id: r.id, date: '2026-10-25', text: 'velvet' }));
    const keep = await ritual({ title: 'Kept' });
    const f = await ok(t.http().post('/api/followups').send({ ritual_id: keep.id, date: '2026-10-25', text: 'velvet note' }));
    const j = await entry({ title: 'Gone velvet', tags: ['velvet'], cards: [{ name: 'velvet' }] });
    const d = await ownDate({ title: 'Gone velvet' });
    expect((await search('velvet')).body.groups.rituals.total).toBe(2);
    await t.http().delete(`/api/spells/${s.id}`);
    await t.http().delete(`/api/rituals/${r.id}`);
    await t.http().delete(`/api/followups/${f.id}`);
    await t.http().delete(`/api/journal/${j.id}`);
    await t.http().delete(`/api/own-dates/${d.id}`);
    const g = (await search('velvet')).body.groups;
    expect(Object.values(g).map(x => x.total)).toEqual([0, 0, 0, 0, 0]);
  });

  it('answers 400 too_short and too_long on q', async () => {
    t = makeTestContext();
    for (const q of ['', ' a ', 'a']) {
      const res = await search(q);
      expect(res.status).toBe(400);
      expect(res.body.details.q).toBeTruthy();
      expect(res.body.detailCodes.q.code).toBe('too_short');
    }
    expect((await t.http().get('/api/search')).status).toBe(400);
    const long = await search('x'.repeat(201));
    expect(long.status).toBe(400);
    expect(long.body.detailCodes.q.code).toBe('too_long');
    expect((await search('x'.repeat(200))).status).toBe(200);
  });
});

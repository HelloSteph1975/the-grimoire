import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext, makeCategoryWithEntries, makeEntry } from './helpers.js';

let t, cat, trads;
beforeEach(async () => {
  t = makeTestContext();
  cat = await makeCategoryWithEntries(t, 0, 'Herbs');
  trads = (await t.http().get('/api/traditions')).body;
});
afterEach(() => t.cleanup());

const get = async id => (await t.http().get(`/api/correspondences/${id}`)).body;
const patch = (id, body) => t.http().patch(`/api/correspondences/${id}`).send(body);
const post = body => t.http().post('/api/correspondences').send({ category_id: cat.id, ...body });

describe('/api/correspondences', () => {
  it('creates with traditions, keywords and feast day', async () => {
    const res = await post({ name: 'Rosemary', summary: 'Remembrance', keywords: [' Protection', 'protection', 'MEMORY ', ''], feast_day: '12-12', traditions: [trads[0].id, trads[1].id, trads[0].id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Rosemary', keywords: ['protection', 'memory'], feast_day: '12-12', traditions: [trads[0].id, trads[1].id], links: [], is_starter: 0, version: 1 });
    expect(await get(res.body.id)).toMatchObject({ keywords: ['protection', 'memory'], traditions: [trads[0].id, trads[1].id] });
  });

  it('sends a code for each bad field', async () => {
    const codes = async body => (await post(body)).body.detailCodes;
    expect((await codes({ name: '' })).name).toEqual({ code: 'required' });
    expect((await codes({ name: 'x'.repeat(81) })).name).toEqual({ code: 'too_long', max: 80 });
    expect((await codes({ name: 'x', keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) })).keywords).toEqual({ code: 'too_many', max: 20 });
    expect((await codes({ name: 'x', keywords: ['k'.repeat(31)] })).keywords).toEqual({ code: 'too_long', max: 30 });
    expect((await codes({ name: 'x', keywords: [3] })).keywords).toEqual({ code: 'not_text' });
    expect((await codes({ name: 'x', feast_day: '13-40' })).feast_day).toEqual({ code: 'bad_format', hint: 'feast_day' });
    expect((await codes({ name: 'x', feast_day: '02-30' })).feast_day.code).toBe('bad_format');
    expect((await post({ name: 'Leap', feast_day: '02-29' })).status).toBe(201);
    expect((await codes({ name: 'x', traditions: [9999] })).traditions).toEqual({ code: 'not_found' });
    expect((await codes({ name: 'x', traditions: ['a'] })).traditions).toEqual({ code: 'bad_id' });
    expect((await codes({ name: 'x', links: [9999] })).links).toEqual({ code: 'not_found' });
    expect((await codes({ name: 'x', category_id: 9999 })).category_id).toEqual({ code: 'not_found' });
    const res = await post({ name: 'x', summary: 's'.repeat(201), body: 'b'.repeat(4001) });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes).toMatchObject({ summary: { code: 'too_long', max: 200 }, body: { code: 'too_long', max: 4000 } });
  });

  it('refuses a category in the Trash and a trashed tradition', async () => {
    const other = await makeCategoryWithEntries(t, 0, 'Other');
    await t.http().delete(`/api/categories/${other.id}`);
    expect((await post({ name: 'x', category_id: other.id })).body.detailCodes.category_id).toEqual({ code: 'not_found' });
    const { body: tr } = await t.http().post('/api/traditions').send({ name: 'Gone' });
    await t.http().delete(`/api/traditions/${tr.id}`);
    expect((await post({ name: 'x', traditions: [tr.id] })).body.detailCodes.traditions).toEqual({ code: 'not_found' });
  });

  it('shows a link on both entries and bumps the other entry on change', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B');
    const linked = await patch(a.id, { version: a.version, links: [b.id] });
    expect(linked.body.links).toEqual([{ id: b.id, name: 'B', category_id: cat.id, is_starter: 0, starter_key: null }]);
    const b2 = await get(b.id);
    expect(b2.links.map(l => l.id)).toEqual([a.id]);
    expect(b2.version).toBe(b.version + 1);
    const unlinked = await patch(a.id, { version: linked.body.version, links: [] });
    expect(unlinked.status).toBe(200);
    const b3 = await get(b.id);
    expect(b3.version).toBe(b2.version + 1);
    expect(b3.links).toEqual([]);
    const stale = await patch(b.id, { version: b2.version, name: 'B edited' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('conflict');
    expect(stale.body.current).toMatchObject({ id: b.id, version: b3.version, links: [] });
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM correspondence_links').get().n).toBe(0);
  });

  it('stores a link once whichever side makes it', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B', { links: [a.id] });
    const a2 = await get(a.id);
    await patch(a.id, { version: a2.version, links: [b.id] });
    expect(t.ctx.db.prepare('SELECT a_id, b_id FROM correspondence_links').all()).toEqual([{ a_id: a.id, b_id: b.id }]);
  });

  it('refuses a link to itself', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const res = await patch(a.id, { version: a.version, links: [a.id] });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes.links).toEqual({ code: 'self_link' });
  });

  it('writes nothing when a stale save also changes links', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B');
    await patch(a.id, { version: a.version, name: 'A2' });
    const stale = await patch(a.id, { version: a.version, links: [b.id] });
    expect(stale.status).toBe(409);
    expect((await get(b.id))).toMatchObject({ version: b.version, links: [] });
  });

  it('hides a linked entry while it is in the Trash and shows it again after restore', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B', { links: [a.id] });
    await t.http().delete(`/api/correspondences/${b.id}`);
    expect((await get(a.id)).links).toEqual([]);
    // Saving A with its visible (empty) list keeps the hidden pair.
    const a2 = await get(a.id);
    await patch(a.id, { version: a2.version, links: [] });
    await t.http().post(`/api/trash/correspondence/${b.id}/restore`);
    expect((await get(a.id)).links.map(l => l.id)).toEqual([b.id]);
  });

  it('hides a tradition in the Trash and keeps the link', async () => {
    const a = await makeEntry(t, cat.id, 'A', { traditions: [trads[0].id] });
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    const hidden = await get(a.id);
    expect(hidden.traditions).toEqual([]);
    await patch(a.id, { version: hidden.version, traditions: [] });
    await t.http().post(`/api/traditions/${trads[0].id}/restore`);
    expect((await get(a.id)).traditions).toEqual([trads[0].id]);
  });

  it('removes the joins when a tradition is deleted forever', async () => {
    const { body: tr } = await t.http().post('/api/traditions').send({ name: 'Mine' });
    const a = await makeEntry(t, cat.id, 'A', { traditions: [tr.id] });
    await t.http().delete(`/api/traditions/${tr.id}`);
    expect((await t.http().delete(`/api/trash/tradition/${tr.id}`)).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM correspondence_traditions WHERE correspondence_id = ?').get(a.id).n).toBe(0);
  });

  it('deletes an entry forever with its links', async () => {
    const a = await makeEntry(t, cat.id, 'A', { traditions: [trads[0].id] });
    const b = await makeEntry(t, cat.id, 'B', { links: [a.id] });
    await t.http().delete(`/api/correspondences/${b.id}`);
    expect((await t.http().get('/api/trash')).body).toMatchObject([{ type: 'correspondence', id: b.id, title: 'B' }]);
    expect((await t.http().delete(`/api/trash/correspondence/${b.id}`)).status).toBe(200);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM correspondence_links').get().n).toBe(0);
    expect((await get(a.id)).traditions).toEqual([trads[0].id]);
  });

  it('empties a Trash holding entries, categories and traditions', async () => {
    const other = await makeCategoryWithEntries(t, 2, 'Other');
    const a = await makeEntry(t, cat.id, 'A', { traditions: [trads[2].id] });
    await makeEntry(t, other.id, 'Linked', { links: [a.id] });
    await t.http().delete(`/api/correspondences/${a.id}`);
    await t.http().delete(`/api/categories/${other.id}`);
    await t.http().delete(`/api/traditions/${trads[2].id}`);
    const res = await t.http().post('/api/trash/empty');
    expect(res.status).toBe(200);
    // What the owner saw: entry A, the category (its three entries grouped under it) and the tradition.
    expect(res.body.removed).toBe(3);
    expect((await t.http().get('/api/trash')).body).toEqual([]);
    expect(t.ctx.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('gives a stale form a 409 after a linked entry comes back from the Trash', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B', { links: [a.id] });
    await t.http().delete(`/api/correspondences/${b.id}`);
    const open = await get(a.id); // the form shows no links
    await t.http().post(`/api/trash/correspondence/${b.id}/restore`);
    const res = await patch(a.id, { version: open.version, links: [] });
    expect(res.status).toBe(409);
    expect(res.body.current.links.map(l => l.id)).toEqual([b.id]);
    expect(t.ctx.db.prepare('SELECT count(*) AS n FROM correspondence_links').get().n).toBe(1);
  });

  it('gives a stale form a 409 after a tradition comes back from the Trash', async () => {
    const a = await makeEntry(t, cat.id, 'A', { traditions: [trads[0].id] });
    await t.http().delete(`/api/traditions/${trads[0].id}`);
    const open = await get(a.id);
    expect(open.version).toBe(a.version + 1);
    await t.http().post(`/api/trash/tradition/${trads[0].id}/restore`);
    const res = await patch(a.id, { version: open.version, traditions: [] });
    expect(res.status).toBe(409);
    expect((await get(a.id)).traditions).toEqual([trads[0].id]);
  });

  it('gives a stale form a 409, not a 400, when a listed link went to the Trash', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const b = await makeEntry(t, cat.id, 'B', { links: [a.id] });
    const open = await get(a.id);
    await t.http().delete(`/api/correspondences/${b.id}`);
    const res = await patch(a.id, { version: open.version, links: [b.id] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('conflict');
    expect(res.body.current.links).toEqual([]);
  });

  it('bumps entries linked across categories when a category goes to the Trash and back', async () => {
    const other = await makeCategoryWithEntries(t, 0, 'Other');
    const a = await makeEntry(t, other.id, 'A');
    await makeEntry(t, cat.id, 'B', { links: [a.id] });
    const v1 = (await get(a.id)).version;
    await t.http().delete(`/api/categories/${cat.id}`);
    const v2 = (await get(a.id)).version;
    expect(v2).toBe(v1 + 1);
    await t.http().post(`/api/categories/${cat.id}/restore`);
    expect((await get(a.id)).version).toBe(v2 + 1);
  });

  it('filters by category and tradition together', async () => {
    const other = await makeCategoryWithEntries(t, 0, 'Other');
    await makeEntry(t, cat.id, 'Both', { traditions: [trads[0].id] });
    await makeEntry(t, cat.id, 'Cat only');
    await makeEntry(t, other.id, 'Trad only', { traditions: [trads[0].id] });
    const names = async qs => (await t.http().get(`/api/correspondences?${qs}`)).body.map(e => e.name);
    expect(await names(`category=${cat.id}`)).toEqual(['Both', 'Cat only']);
    expect(await names(`tradition=${trads[0].id}`)).toEqual(['Both', 'Trad only']);
    expect(await names(`category=${cat.id}&tradition=${trads[0].id}`)).toEqual(['Both']);
    expect((await t.http().get('/api/correspondences?category=abc')).body.code).toBe('bad_id');
  });

  it('lists the short shape ordered by name', async () => {
    await makeEntry(t, cat.id, 'beta', { body: 'long text' });
    await makeEntry(t, cat.id, 'Alpha');
    const { body } = await t.http().get('/api/correspondences');
    expect(body.map(e => e.name)).toEqual(['Alpha', 'beta']);
    expect(Object.keys(body[0]).sort()).toEqual(['category_id', 'feast_day', 'id', 'is_starter', 'name', 'show_on_calendar', 'starter_key', 'summary', 'version']);
  });

  it('searches name, summary, body and keywords, ignoring case and accents', async () => {
    await makeEntry(t, cat.id, 'Salt', { keywords: ['protection'] });
    await makeEntry(t, cat.id, 'Iron', { body: 'Used for PROTECTIVE charms.' });
    await makeEntry(t, cat.id, 'Día de Muertos', { summary: 'Remembering' });
    await makeEntry(t, cat.id, 'Mint', { summary: 'Fresh' });
    const q = async s => (await t.http().get(`/api/correspondences?q=${encodeURIComponent(s)}`)).body.map(e => e.name);
    expect(await q('protec')).toEqual(['Iron', 'Salt']);
    expect(await q('dia')).toEqual(['Día de Muertos']);
    expect(await q('DÍA')).toEqual(['Día de Muertos']);
    expect(await q('remember')).toEqual(['Día de Muertos']);
    expect(await q('  ')).toHaveLength(4);
  });

  it('searches the translated text of starter rows in another language', async () => {
    const es = path.join(t.dataDir, 'locales', 'es');
    fs.mkdirSync(es, { recursive: true });
    fs.writeFileSync(path.join(es, 'ui.json'), JSON.stringify({ _name: 'Español' }));
    fs.writeFileSync(path.join(es, 'content.json'), JSON.stringify({ 'corr.test.salt.summary': 'Protección del hogar', 'corr.test.salt.keywords': 'umbral, sal', 'corr.test.salt.body': ['lista'] }));
    const salt = await makeEntry(t, cat.id, 'Salt', { summary: 'Guards the home' });
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.test.salt', is_starter = 1 WHERE id = ?").run(salt.id);
    const q = async s => (await t.http().get(`/api/correspondences?q=${encodeURIComponent(s)}`)).body.map(e => e.name);
    expect(await q('hogar')).toEqual([]);
    expect((await t.http().put('/api/settings').send({ language: 'es' })).status).toBe(200);
    expect(await q('proteccion')).toEqual(['Salt']);
    expect(await q('umbral')).toEqual(['Salt']);
    expect(await q('guards')).toEqual(['Salt']);
    // Pack values are text only; a list is ignored.
    expect(await q('lista')).toEqual([]);
    const row = await get(salt.id);
    await patch(salt.id, { version: row.version, summary: 'My own words' });
    expect(await q('hogar')).toEqual([]);
  });

  it('keeps the Starter tag when nothing changed and drops it when links change', async () => {
    const a = await makeEntry(t, cat.id, 'A', { keywords: ['x'], traditions: [trads[0].id] });
    const b = await makeEntry(t, cat.id, 'B');
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.test.a', is_starter = 1 WHERE id = ?").run(a.id);
    const row = await get(a.id);
    const same = await patch(a.id, { version: row.version, category_id: cat.id, name: 'A', summary: null, body: '', keywords: ['X'], feast_day: null, traditions: [trads[0].id], links: [] });
    expect(same.status).toBe(200);
    expect(same.body.is_starter).toBe(1);
    const linked = await patch(a.id, { version: same.body.version, links: [b.id] });
    expect(linked.body).toMatchObject({ is_starter: 0, starter_key: 'corr.test.a' });
  });

  it('shows on the calendar by default, and the switch keeps the Starter tag and the version rules', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    expect(a.show_on_calendar).toBe(1);
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.test.a', is_starter = 1 WHERE id = ?").run(a.id);
    const off = await patch(a.id, { version: a.version, show_on_calendar: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ show_on_calendar: 0, version: a.version + 1, is_starter: 1 });
    expect((await t.http().get('/api/correspondences')).body[0].show_on_calendar).toBe(0);
    const stale = await patch(a.id, { version: a.version, show_on_calendar: true });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ show_on_calendar: 0 });
    const on = await patch(a.id, { version: off.body.version, show_on_calendar: true, name: 'A' });
    expect(on.body).toMatchObject({ show_on_calendar: 1, is_starter: 1 });
    expect((await post({ name: 'B', show_on_calendar: false })).body.show_on_calendar).toBe(0);
  });

  it('rejects a null show_on_calendar and writes nothing', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    const res = await patch(a.id, { version: a.version, show_on_calendar: null });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes.show_on_calendar).toEqual({ code: 'required' });
    expect(await get(a.id)).toEqual(a);
  });

  it('drops the Starter tag when traditions change', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    t.ctx.db.prepare('UPDATE correspondences SET is_starter = 1 WHERE id = ?').run(a.id);
    const res = await patch(a.id, { version: a.version, traditions: [trads[1].id] });
    expect(res.body.is_starter).toBe(0);
  });

  it('moves an entry to another category, deletes and restores it', async () => {
    const other = await makeCategoryWithEntries(t, 0, 'Other');
    const a = await makeEntry(t, cat.id, 'A');
    const moved = await patch(a.id, { version: a.version, category_id: other.id });
    expect(moved.body.category_id).toBe(other.id);
    expect((await t.http().delete(`/api/correspondences/${a.id}`)).body).toEqual({ ok: true });
    expect((await t.http().get(`/api/correspondences/${a.id}`)).status).toBe(404);
    const back = await t.http().post(`/api/correspondences/${a.id}/restore`);
    expect(back.body).toMatchObject({ id: a.id, deleted_at: null, links: [] });
  });

  it('needs a version and answers 404 for a missing entry', async () => {
    const a = await makeEntry(t, cat.id, 'A');
    expect((await patch(a.id, { name: 'B' })).body.code).toBe('missing_version');
    expect((await patch(9999, { version: 1, name: 'B' })).status).toBe(404);
    expect((await t.http().get('/api/correspondences/9999')).status).toBe(404);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, makeCategoryWithEntries, makeEntry } from './helpers.js';
import { seedStarter } from '../../server/services/starter.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());
const items = list => list.map(r => ({ id: r.id, version: r.version }));

describe('/api/categories', () => {
  it('lists the nine starter categories in order', async () => {
    const res = await t.http().get('/api/categories');
    expect(res.body.map(c => c.starter_key)).toEqual(['category.days', 'category.colors', 'category.elements', 'category.planets', 'category.moon-phases', 'category.sabbats-feasts', 'category.crystals', 'category.saints', 'category.deities']);
  });
  it('creates, renames, changes icon, rejects a bad icon', async () => {
    const { body: c } = await t.http().post('/api/categories').send({ name: 'Runes', icon: 'star' });
    expect(c).toMatchObject({ name: 'Runes', icon: 'star', version: 1 });
    expect((await t.http().patch(`/api/categories/${c.id}`).send({ version: 1, icon: 'leaf' })).body.icon).toBe('leaf');
    expect((await t.http().patch(`/api/categories/${c.id}`).send({ version: 2, name: 'Runic' })).body).toMatchObject({ name: 'Runic', version: 3 });
    const bad = await t.http().post('/api/categories').send({ name: 'X', icon: 'skull' });
    expect(bad.body.detailCodes.icon.code).toBe('not_one_of');
    const long = await t.http().post('/api/categories').send({ name: 'x'.repeat(61), icon: 'star' });
    expect(long.body.detailCodes.name).toEqual({ code: 'too_long', max: 60 });
  });
  it('drops the Starter tag on a real edit only', async () => {
    const { body: cats } = await t.http().get('/api/categories');
    const days = cats[0];
    const same = await t.http().patch(`/api/categories/${days.id}`).send({ version: days.version, name: days.name, icon: days.icon });
    expect(same.body.is_starter).toBe(1);
    const changed = await t.http().patch(`/api/categories/${days.id}`).send({ version: same.body.version, icon: 'sun' });
    expect(changed.body.is_starter).toBe(0);
  });
  it('counts usage', async () => {
    const cat = await makeCategoryWithEntries(t, 2);
    expect((await t.http().get(`/api/categories/${cat.id}/usage`)).body).toEqual({ entries: 2 });
  });
  it('deletes a category with its entries and restores only those', async () => {
    const cat = await makeCategoryWithEntries(t, 2);
    const early = await makeEntry(t, cat.id, 'Already trashed');
    await t.http().delete(`/api/correspondences/${early.id}`);
    await new Promise(r => setTimeout(r, 5)); // distinct stamps
    expect((await t.http().delete(`/api/categories/${cat.id}`)).body).toEqual({ ok: true });
    expect((await t.http().get(`/api/categories/${cat.id}`)).status).toBe(404);
    const trash = (await t.http().get('/api/trash')).body;
    expect(trash.find(i => i.type === 'category')).toMatchObject({ id: cat.id, extra: 2 });
    expect(trash.filter(i => i.type === 'correspondence').map(i => i.title)).toEqual(['Already trashed']);
    await t.http().post(`/api/trash/category/${cat.id}/restore`);
    const live = (await t.http().get(`/api/correspondences?category=${cat.id}`)).body.map(e => e.name);
    expect(live).toHaveLength(2);
    expect(live).not.toContain('Already trashed');
  });
  it('stamps the category and its entries with one deleted time', async () => {
    const cat = await makeCategoryWithEntries(t, 2);
    await t.http().delete(`/api/categories/${cat.id}`);
    const stamps = t.ctx.db.prepare('SELECT deleted_at FROM correspondences WHERE category_id = ? UNION SELECT deleted_at FROM categories WHERE id = ?').all(cat.id, cat.id);
    expect(stamps).toHaveLength(1);
    expect(stamps[0].deleted_at).toBeTruthy();
  });
  it('restores through the category route too', async () => {
    const cat = await makeCategoryWithEntries(t, 1);
    await t.http().delete(`/api/categories/${cat.id}`);
    const res = await t.http().post(`/api/categories/${cat.id}/restore`);
    expect(res.body).toMatchObject({ id: cat.id, deleted_at: null });
    expect((await t.http().get(`/api/correspondences?category=${cat.id}`)).body).toHaveLength(1);
    expect((await t.http().post(`/api/categories/${cat.id}/restore`)).status).toBe(404);
  });
  it('refuses to restore an entry whose category is in the Trash', async () => {
    const cat = await makeCategoryWithEntries(t, 1);
    const [entry] = (await t.http().get(`/api/correspondences?category=${cat.id}`)).body;
    await t.http().delete(`/api/categories/${cat.id}`);
    const res = await t.http().post(`/api/trash/correspondence/${entry.id}/restore`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('category_in_trash');
    const direct = await t.http().post(`/api/correspondences/${entry.id}/restore`);
    expect(direct.body.code).toBe('category_in_trash');
  });
  it('deleting a category forever deletes its entries forever and keeps starters gone', async () => {
    const { body: cats } = await t.http().get('/api/categories');
    const days = cats.find(c => c.starter_key === 'category.days');
    await t.http().delete(`/api/categories/${days.id}`);
    await t.http().delete(`/api/trash/category/${days.id}`);
    expect(seedStarter(t.ctx.db)).toBe(0);
    expect((await t.http().get('/api/categories')).body.map(c => c.starter_key)).not.toContain('category.days');
  });
  it('purges the entries, their links and traditions when a category is deleted forever', async () => {
    const { body: [trad] } = await t.http().get('/api/traditions');
    const other = await makeCategoryWithEntries(t, 0, 'Other');
    const keep = await makeEntry(t, other.id, 'Keeper');
    const cat = await makeCategoryWithEntries(t, 0);
    const gone = await makeEntry(t, cat.id, 'Gone', { traditions: [trad.id], links: [keep.id] });
    const early = await makeEntry(t, cat.id, 'Early');
    t.ctx.db.prepare("UPDATE correspondences SET starter_key = 'corr.test.gone', is_starter = 1 WHERE id = ?").run(gone.id);
    await t.http().delete(`/api/correspondences/${early.id}`);
    await new Promise(r => setTimeout(r, 5));
    await t.http().delete(`/api/categories/${cat.id}`);
    expect((await t.http().delete(`/api/trash/category/${cat.id}`)).body).toEqual({ ok: true });
    const db = t.ctx.db;
    expect(db.prepare('SELECT count(*) AS n FROM correspondences WHERE category_id = ?').get(cat.id).n).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM correspondence_links').get().n).toBe(0);
    expect(db.prepare('SELECT count(*) AS n FROM correspondence_traditions').get().n).toBe(0);
    expect(db.prepare("SELECT 1 AS x FROM starter_removed WHERE starter_key = 'corr.test.gone'").get()).toEqual({ x: 1 });
    expect((await t.http().get('/api/trash')).body).toEqual([]);
    expect((await t.http().get(`/api/correspondences/${keep.id}`)).body.links).toEqual([]);
  });
  it('reorders categories', async () => {
    const { body: list } = await t.http().get('/api/categories');
    const moved = [list[8], ...list.slice(0, 8)];
    const res = await t.http().post('/api/categories/reorder').send({ items: items(moved) });
    expect(res.body.map(c => c.starter_key)).toEqual(moved.map(c => c.starter_key));
    const stale = await t.http().post('/api/categories/reorder').send({ items: items(list) });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('reorder_conflict');
  });
  it('counts tradition usage', async () => {
    const { body: [trad] } = await t.http().get('/api/traditions');
    const cat = await makeCategoryWithEntries(t, 0);
    await makeEntry(t, cat.id, 'Uses it', { traditions: [trad.id] });
    const trashed = await makeEntry(t, cat.id, 'Trashed', { traditions: [trad.id] });
    await t.http().delete(`/api/correspondences/${trashed.id}`);
    expect((await t.http().get(`/api/traditions/${trad.id}/usage`)).body).toEqual({ entries: 1 });
  });
});

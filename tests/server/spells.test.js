import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, makeCategoryWithEntries, makeEntry } from './helpers.js';

let t, cat, trads, kinds;
beforeEach(async () => {
  t = makeTestContext();
  cat = await makeCategoryWithEntries(t, 0, 'Herbs');
  trads = (await t.http().get('/api/traditions')).body;
  kinds = (await t.http().get('/api/spell-kinds')).body;
});
afterEach(() => t.cleanup());

const db = () => t.ctx.db;
const post = body => t.http().post('/api/spells').send(body);
const patch = (id, body) => t.http().patch(`/api/spells/${id}`).send(body);
const get = async id => (await t.http().get(`/api/spells/${id}`)).body;
const list = async (query = '') => (await t.http().get(`/api/spells${query}`)).body;
const codes = async body => {
  const res = await post({ title: 'x', ...body });
  expect(res.status).toBe(400);
  expect(res.body.code).toBe('invalid');
  return res.body.detailCodes;
};
const lineCount = id => db().prepare('SELECT count(*) AS n FROM spell_ingredients WHERE spell_id = ?').get(id).n;

describe('/api/spells', () => {
  it('creates with every field and reads the same back', async () => {
    const rosemary = await makeEntry(t, cat.id, 'Rosemary');
    const feast = await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    const res = await post({
      title: ' Clear the house ', purpose: 'Calm and light', kind_id: kinds[1].id, notes: 'Open a window.', source: 'my own',
      traditions: [trads[1].id, trads[0].id], feasts: [feast.id],
      ingredients: [{ name: 'Rosemary', amount: 'a sprig', correspondence_id: rosemary.id }, { name: 'Salt', amount: '', correspondence_id: null }],
      steps: ['Sweep', '  ', 'Light the candle'],
      timing: { moon: ['full', 'new', 'full'], day: ['sun', 'mon'], planet: ['moon'], other: ['x'] },
    });
    expect(res.status).toBe(201);
    const expected = {
      title: 'Clear the house', purpose: 'Calm and light', kind_id: kinds[1].id, notes: 'Open a window.', source: 'my own', version: 1,
      traditions: [trads[0].id, trads[1].id],
      feasts: [{ id: feast.id, name: 'Saint Lucy', starter_key: null, is_starter: 0, feast_day: '12-13' }],
      ingredients: [
        { name: 'Rosemary', amount: 'a sprig', correspondence_id: rosemary.id, link: { id: rosemary.id, name: 'Rosemary', starter_key: null, is_starter: 0 } },
        { name: 'Salt', amount: null, correspondence_id: null, link: null },
      ],
      steps: ['Sweep', 'Light the candle'],
      timing: { moon: ['new', 'full'], day: ['mon', 'sun'], planet: ['moon'] },
    };
    expect(res.body).toMatchObject(expected);
    expect(Object.keys(res.body).sort()).toEqual(['created_at', 'feasts', 'id', 'ingredients', 'kind_id', 'notes', 'purpose', 'source', 'steps', 'timing', 'title', 'traditions', 'updated_at', 'version']);
    expect(await get(res.body.id)).toEqual(res.body);
  });

  it('creates with only a title', async () => {
    const res = await post({ title: 'Small' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ purpose: null, kind_id: null, traditions: [], feasts: [], ingredients: [], steps: [], timing: { moon: [], day: [], planet: [] } });
  });

  it('PATCH replaces lines, steps and timing in order, and leaves omitted fields alone', async () => {
    const { body: s } = await post({
      title: 'A', purpose: 'Keep me',
      ingredients: [{ name: 'One' }, { name: 'Two' }, { name: 'Three' }], steps: ['a', 'b'], timing: { moon: ['full'], day: ['fri'] },
    });
    const res = await patch(s.id, { version: 1, ingredients: [{ name: 'Three', amount: '3' }, { name: 'One' }], steps: ['c'], timing: { moon: ['new'] } });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.ingredients.map(l => [l.name, l.amount])).toEqual([['Three', '3'], ['One', null]]);
    expect(res.body.steps).toEqual(['c']);
    expect(res.body.timing).toEqual({ moon: ['new'], day: ['fri'], planet: [] });
    expect(res.body.purpose).toBe('Keep me');
    expect(lineCount(s.id)).toBe(2);
    expect(await get(s.id)).toEqual(res.body);
  });

  it('a stale PATCH gets 409 with the current spell and changes nothing', async () => {
    const { body: s } = await post({ title: 'A', ingredients: [{ name: 'One' }] });
    await patch(s.id, { version: 1, title: 'B' });
    const stale = await patch(s.id, { version: 1, title: 'C', ingredients: [], kind_id: 9999 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('conflict');
    expect(stale.body.current).toMatchObject({ id: s.id, title: 'B', version: 2, ingredients: [{ name: 'One', link: null }], timing: { moon: [], day: [], planet: [] } });
    expect(await get(s.id)).toMatchObject({ title: 'B', version: 2 });
    expect(lineCount(s.id)).toBe(1);
  });

  it('a PATCH with a step that is too long saves nothing', async () => {
    const { body: s } = await post({ title: 'A', ingredients: [{ name: 'One' }], steps: ['first'] });
    const res = await patch(s.id, { version: 1, title: 'B', ingredients: [], steps: ['ok', 'x'.repeat(1001)] });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes['steps.1']).toEqual({ code: 'too_long', max: 1000 });
    expect(await get(s.id)).toMatchObject({ title: 'A', version: 1, steps: ['first'], ingredients: [{ name: 'One' }] });
  });

  it('sends a code for each bad field, all at once', async () => {
    expect((await codes({ title: '' })).title).toEqual({ code: 'required' });
    expect((await codes({ title: 'x'.repeat(201) })).title).toEqual({ code: 'too_long', max: 200 });
    expect((await codes({ purpose: 'x'.repeat(201), notes: 'x'.repeat(4001), source: 'x'.repeat(201) }))).toMatchObject({
      purpose: { code: 'too_long', max: 200 }, notes: { code: 'too_long', max: 4000 }, source: { code: 'too_long', max: 200 },
    });
    expect((await codes({ ingredients: Array.from({ length: 51 }, (_, i) => ({ name: `n${i}` })) })).ingredients).toEqual({ code: 'too_many', max: 50 });
    expect((await codes({ steps: Array.from({ length: 51 }, (_, i) => `s${i}`) })).steps).toEqual({ code: 'too_many', max: 50 });
    expect((await codes({ steps: ['ok', 3] }))['steps.1']).toEqual({ code: 'not_text' });
    expect((await codes({ ingredients: [{ name: ' ', amount: 'a pinch' }] }))['ingredients.0.name']).toEqual({ code: 'required' });
    expect((await codes({ ingredients: [{ name: '', correspondence_id: 9999 }] }))['ingredients.0.name']).toEqual({ code: 'required' });
    expect((await codes({ ingredients: [{ name: 'x'.repeat(201) }] }))['ingredients.0.name']).toEqual({ code: 'too_long', max: 200 });
    expect((await codes({ ingredients: [{ name: 'x', amount: 'a'.repeat(51) }] }))['ingredients.0.amount']).toEqual({ code: 'too_long', max: 50 });
    expect((await codes({ ingredients: [{ name: 'x', correspondence_id: 'a' }] }))['ingredients.0.correspondence_id']).toEqual({ code: 'bad_id' });
    expect((await codes({ ingredients: [{ name: 'x', correspondence_id: 9999 }] }))['ingredients.0.correspondence_id']).toEqual({ code: 'not_found' });
    expect((await codes({ timing: { moon: ['blue'] } }))['timing.moon']).toEqual({ code: 'not_one_of' });
    expect((await codes({ kind_id: 9999 })).kind_id).toEqual({ code: 'not_found' });
    expect((await codes({ traditions: [9999] })).traditions).toEqual({ code: 'not_found' });
    const plain = await makeEntry(t, cat.id, 'No feast day');
    expect((await codes({ feasts: [plain.id] })).feasts).toEqual({ code: 'not_found' });
    // Errors from the row and from the lists come back together.
    expect(await codes({ title: '', ingredients: [{ name: '', amount: '1' }], steps: ['x'.repeat(1001)], timing: { day: ['someday'] } })).toEqual({
      title: { code: 'required' }, 'ingredients.0.name': { code: 'required' }, 'steps.0': { code: 'too_long', max: 1000 }, 'timing.day': { code: 'not_one_of' },
    });
  });

  it('drops blank ingredient lines like blank steps, and names errors by the line as sent', async () => {
    const res = await post({ title: 'A', ingredients: [{ name: 'One' }, { name: ' ', amount: '  ', correspondence_id: null }, {}, { name: 'Two', amount: '2' }] });
    expect(res.status).toBe(201);
    expect(res.body.ingredients.map(l => [l.name, l.amount])).toEqual([['One', null], ['Two', '2']]);
    expect(lineCount(res.body.id)).toBe(2);
    expect(await codes({ ingredients: [{ name: '' }, { name: 'x', amount: 'a'.repeat(51) }, { name: '', amount: '1' }] })).toEqual({
      'ingredients.1.amount': { code: 'too_long', max: 50 }, 'ingredients.2.name': { code: 'required' },
    });
    expect(await codes({ ingredients: [{ name: '' }, { name: 'y', correspondence_id: 9999 }] })).toEqual({ 'ingredients.1.correspondence_id': { code: 'not_found' } });
  });

  it('accepts a feast with a feast day and a sabbat starter entry without one', async () => {
    const feast = await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    const yule = Number(db().prepare("INSERT INTO correspondences (category_id, name, starter_key) VALUES (?, 'Yule', 'corr.sabbats-feasts.yule')").run(cat.id).lastInsertRowid);
    const res = await post({ title: 'Feasts', feasts: [yule, feast.id] });
    expect(res.status).toBe(201);
    expect(res.body.feasts.map(f => f.name)).toEqual(['Saint Lucy', 'Yule']);
  });

  it('accepts an ingredient linked to an entry in the Trash', async () => {
    const e = await makeEntry(t, cat.id, 'Sage');
    await t.http().delete(`/api/correspondences/${e.id}`);
    const res = await post({ title: 'A', ingredients: [{ name: 'Sage', correspondence_id: e.id }] });
    expect(res.status).toBe(201);
    expect(res.body.ingredients).toEqual([{ name: 'Sage', amount: null, correspondence_id: e.id, link: null }]);
  });

  it('searches title, purpose, ingredients, steps, notes and source, ignoring case and accents, and filters', async () => {
    const a = (await post({ title: 'Ancestor altar', kind_id: kinds[1].id, traditions: [trads[0].id], steps: ['Light a candle for Día de Muertos'] })).body;
    const b = (await post({ title: 'Bath', ingredients: [{ name: 'Lavender' }], source: 'Grandmother' })).body;
    const c = (await post({ title: 'Charm', purpose: 'Luck', notes: 'Keep it in a pocket', kind_id: kinds[1].id })).body;
    expect((await list()).map(s => s.title)).toEqual(['Ancestor altar', 'Bath', 'Charm']);
    expect((await list())[0]).toEqual({ id: a.id, title: 'Ancestor altar', purpose: null, kind_id: kinds[1].id, version: 1 });
    expect((await list('?q=lavender')).map(s => s.id)).toEqual([b.id]);
    expect((await list('?q=dia')).map(s => s.id)).toEqual([a.id]);
    expect((await list('?q=GRANDMOTHER')).map(s => s.id)).toEqual([b.id]);
    expect((await list('?q=pocket')).map(s => s.id)).toEqual([c.id]);
    expect((await list('?q=luck')).map(s => s.id)).toEqual([c.id]);
    expect((await list(`?kind=${kinds[1].id}`)).map(s => s.id)).toEqual([a.id, c.id]);
    expect((await list(`?tradition=${trads[0].id}`)).map(s => s.id)).toEqual([a.id]);
    expect((await list(`?kind=${kinds[1].id}&q=charm`)).map(s => s.id)).toEqual([c.id]);
    expect((await list('?kind=')).length).toBe(3);
    expect((await t.http().get('/api/spells?kind=abc')).body.code).toBe('bad_id');
  });

  it('keeps hidden kind, tradition and feast through a save, and shows them again on restore', async () => {
    const feast = await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    const { body: tr } = await t.http().post('/api/traditions').send({ name: 'Mine' });
    const { body: s } = await post({ title: 'A', kind_id: kinds[0].id, traditions: [tr.id, trads[0].id], feasts: [feast.id] });
    await t.http().delete(`/api/spell-kinds/${kinds[0].id}`);
    await t.http().delete(`/api/traditions/${tr.id}`);
    await t.http().delete(`/api/correspondences/${feast.id}`);
    const seen = await get(s.id);
    expect(seen).toMatchObject({ kind_id: null, traditions: [trads[0].id], feasts: [] });
    // What a form sends back: the GET's values, with feasts as ids.
    const saved = await patch(s.id, { ...seen, feasts: seen.feasts.map(f => f.id), title: 'B' });
    expect(saved.status).toBe(200);
    await t.http().post(`/api/spell-kinds/${kinds[0].id}/restore`);
    await t.http().post(`/api/traditions/${tr.id}/restore`);
    await t.http().post(`/api/correspondences/${feast.id}/restore`);
    const back = await get(s.id);
    expect(back.title).toBe('B');
    expect(back.kind_id).toBe(kinds[0].id);
    expect(back.traditions.sort()).toEqual([tr.id, trads[0].id].sort());
    expect(back.feasts.map(f => f.id)).toEqual([feast.id]);
  });

  it('deletes to the Trash, restores, and deleting forever removes its lines', async () => {
    const { body: s } = await post({ title: 'Gone soon', ingredients: [{ name: 'One' }, { name: 'Two' }], steps: ['a'], timing: { moon: ['full'] } });
    expect((await t.http().delete(`/api/spells/${s.id}`)).status).toBe(200);
    expect((await t.http().get(`/api/spells/${s.id}`)).status).toBe(404);
    expect(await list()).toEqual([]);
    const trash = (await t.http().get('/api/trash')).body;
    expect(trash).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'spell', id: s.id, title: 'Gone soon' })]));
    expect((await t.http().post(`/api/spells/${s.id}/restore`)).body).toMatchObject({ id: s.id, ingredients: [{ name: 'One' }, { name: 'Two' }] });
    await t.http().delete(`/api/spells/${s.id}`);
    expect((await t.http().post(`/api/trash/spell/${s.id}/restore`)).status).toBe(200);
    await t.http().delete(`/api/spells/${s.id}`);
    expect((await t.http().delete(`/api/trash/spell/${s.id}`)).status).toBe(200);
    expect(lineCount(s.id)).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM spell_steps WHERE spell_id = ?').get(s.id).n).toBe(0);
    expect(db().prepare('SELECT count(*) AS n FROM spell_timing WHERE spell_id = ?').get(s.id).n).toBe(0);
  });

  it('empties the Trash with a spell and its kind in it', async () => {
    const { body: s } = await post({ title: 'A', kind_id: kinds[0].id, ingredients: [{ name: 'One' }] });
    await t.http().delete(`/api/spells/${s.id}`);
    await t.http().delete(`/api/spell-kinds/${kinds[0].id}`);
    expect((await t.http().post('/api/trash/empty').send({})).status).toBe(200);
    expect(db().prepare('SELECT count(*) AS n FROM spells').get().n).toBe(0);
    expect(lineCount(s.id)).toBe(0);
  });

  it('404s on a missing spell and needs a version to PATCH', async () => {
    expect((await t.http().get('/api/spells/9999')).status).toBe(404);
    expect((await patch(9999, { version: 1, title: 'x' })).status).toBe(404);
    const { body: s } = await post({ title: 'A' });
    expect((await patch(s.id, { title: 'x' })).body.code).toBe('missing_version');
  });
});

describe('spells and the Trash', () => {
  const del = path => t.http().delete(path);
  const restore = path => t.http().post(path);

  async function linked() {
    const e = await makeEntry(t, cat.id, 'Rosemary', { feast_day: '12-12' });
    const f = await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    const s = (await post({ title: 'S', ingredients: [{ name: 'Rosemary', correspondence_id: e.id }], feasts: [f.id], traditions: [trads[0].id] })).body;
    return { e, f, s };
  }

  it('trashing and restoring a linked entry bumps the spell, so a stale PATCH gets 409', async () => {
    const { e, s } = await linked();
    await del(`/api/correspondences/${e.id}`);
    expect((await get(s.id)).version).toBe(s.version + 1);
    expect((await patch(s.id, { title: 'T', version: s.version })).status).toBe(409);
    await restore(`/api/correspondences/${e.id}/restore`);
    expect((await get(s.id)).version).toBe(s.version + 2);
  });

  it('trashing and restoring a feast entry bumps the spell', async () => {
    const { f, s } = await linked();
    await del(`/api/correspondences/${f.id}`);
    expect((await get(s.id)).version).toBe(s.version + 1);
    await restore(`/api/correspondences/${f.id}/restore`);
    expect((await get(s.id)).version).toBe(s.version + 2);
  });

  it("trashing and restoring the entry's category bumps the spell", async () => {
    const { s } = await linked();
    await del(`/api/categories/${cat.id}`);
    expect((await get(s.id)).version).toBe(s.version + 1);
    await restore(`/api/categories/${cat.id}/restore`);
    expect((await get(s.id)).version).toBe(s.version + 2);
  });

  it('trashing and restoring a tradition bumps the spell', async () => {
    const { s } = await linked();
    await del(`/api/traditions/${trads[0].id}`);
    expect((await get(s.id)).version).toBe(s.version + 1);
    await restore(`/api/traditions/${trads[0].id}/restore`);
    expect((await get(s.id)).version).toBe(s.version + 2);
  });

  it('deleting an entry forever keeps the line, unlinked, and bumps the spell', async () => {
    const { e, f, s } = await linked();
    await del(`/api/correspondences/${e.id}`);
    await del(`/api/correspondences/${f.id}`);
    const before = (await get(s.id)).version;
    expect((await del(`/api/trash/correspondence/${e.id}`)).status).toBe(200);
    const after = await get(s.id);
    expect(after.ingredients).toEqual([{ name: 'Rosemary', amount: null, correspondence_id: null, link: null }]);
    expect(after.version).toBe(before + 1);
    expect((await del(`/api/trash/correspondence/${f.id}`)).status).toBe(200);
    const end = await get(s.id);
    expect(end.feasts).toEqual([]);
    expect(end.version).toBe(before + 2);
  });

  // Keep mine after a conflict: the form still holds the old kind, tradition or feast, now in the Trash.
  it('Keep mine with a kind that went to the Trash saves and keeps the hidden kind', async () => {
    const k = kinds[0];
    const s = (await post({ title: 'S', kind_id: k.id })).body;
    await del(`/api/spell-kinds/${k.id}`);
    const now = await get(s.id);
    expect(now.version).toBe(s.version + 1);
    const res = await patch(s.id, { title: 'Mine', kind_id: k.id, version: now.version });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Mine', kind_id: null });
    await restore(`/api/spell-kinds/${k.id}/restore`);
    expect((await get(s.id)).kind_id).toBe(k.id);
  });

  it('Keep mine with a tradition that went to the Trash saves and keeps the hidden tradition', async () => {
    const { s } = await linked();
    await del(`/api/traditions/${trads[0].id}`);
    const now = await get(s.id);
    expect(now.version).toBe(s.version + 1);
    const res = await patch(s.id, { title: 'Mine', traditions: [trads[0].id, trads[1].id], version: now.version });
    expect(res.status).toBe(200);
    expect(res.body.traditions).toEqual([trads[1].id]);
    expect(db().prepare('SELECT count(*) AS n FROM spell_traditions WHERE spell_id = ?').get(s.id).n).toBe(2);
    await restore(`/api/traditions/${trads[0].id}/restore`);
    expect((await get(s.id)).traditions.sort()).toEqual([trads[0].id, trads[1].id].sort());
  });

  it('Keep mine with a feast whose entry went to the Trash saves and keeps the hidden feast', async () => {
    const { f, s } = await linked();
    await del(`/api/correspondences/${f.id}`);
    const now = await get(s.id);
    expect(now.version).toBe(s.version + 1);
    const res = await patch(s.id, { title: 'Mine', feasts: [f.id], version: now.version });
    expect(res.status).toBe(200);
    expect(res.body.feasts).toEqual([]);
    expect(db().prepare('SELECT count(*) AS n FROM spell_feasts WHERE spell_id = ?').get(s.id).n).toBe(1);
    await restore(`/api/correspondences/${f.id}/restore`);
    expect((await get(s.id)).feasts.map(x => x.id)).toEqual([f.id]);
  });

  it('a kind, tradition or feast in the Trash that this spell never had is still refused', async () => {
    const { f } = await linked();
    const s = (await post({ title: 'Other' })).body;
    await del(`/api/spell-kinds/${kinds[0].id}`);
    await del(`/api/traditions/${trads[0].id}`);
    await del(`/api/correspondences/${f.id}`);
    const res = await patch(s.id, { kind_id: kinds[0].id, traditions: [trads[0].id], feasts: [f.id], version: s.version });
    expect(res.status).toBe(400);
    expect(res.body.detailCodes).toMatchObject({ kind_id: { code: 'not_found' }, traditions: { code: 'not_found' }, feasts: { code: 'not_found' } });
  });

  it('a spell in the Trash is not bumped', async () => {
    const { e, s } = await linked();
    await del(`/api/spells/${s.id}`);
    const v = db().prepare('SELECT version FROM spells WHERE id = ?').get(s.id).version;
    await del(`/api/correspondences/${e.id}`);
    expect(db().prepare('SELECT version FROM spells WHERE id = ?').get(s.id).version).toBe(v);
  });

  it('lists where an entry is used, each spell once, leaving out spells in the Trash', async () => {
    const e = await makeEntry(t, cat.id, 'Lucy herb', { feast_day: '12-13' });
    const a = (await post({ title: 'Alpha', ingredients: [{ name: 'a', correspondence_id: e.id }, { name: 'b', correspondence_id: e.id }], feasts: [e.id] })).body;
    const b = (await post({ title: 'Beta', feasts: [e.id] })).body;
    const c = (await post({ title: 'Gamma', ingredients: [{ name: 'c', correspondence_id: e.id }] })).body;
    await del(`/api/spells/${c.id}`);
    const res = await t.http().get(`/api/correspondences/${e.id}/spells`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: a.id, title: 'Alpha' }, { id: b.id, title: 'Beta' }]);
    await del(`/api/correspondences/${e.id}`);
    expect((await t.http().get(`/api/correspondences/${e.id}/spells`)).status).toBe(404);
    expect((await t.http().get('/api/correspondences/99999/spells')).status).toBe(404);
  });

  it('?feasts=1 lists entries with a feast day and the sabbat rows, and combines with q', async () => {
    await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    await makeEntry(t, cat.id, 'Plain');
    db().prepare("INSERT INTO correspondences (category_id, name, starter_key) VALUES (?, 'Yule', 'corr.sabbats-feasts.yule')").run(cat.id);
    const names = async q => (await t.http().get(`/api/correspondences?feasts=1${q}`)).body.map(r => r.name);
    expect(await names('')).toEqual(['Saint Lucy', 'Yule']);
    expect(await names('&q=yul')).toEqual(['Yule']);
  });

  it('keeps a feast whose feast day was cleared, but a new feast must qualify', async () => {
    const f = await makeEntry(t, cat.id, 'Saint Lucy', { feast_day: '12-13' });
    const plain = await makeEntry(t, cat.id, 'Plain');
    const s = (await post({ title: 'S', feasts: [f.id] })).body;
    expect((await t.http().patch(`/api/correspondences/${f.id}`).send({ feast_day: null, version: f.version })).body.feast_day).toBeNull();
    const s2 = await get(s.id);
    const res = await patch(s.id, { title: 'T', feasts: [f.id], version: s2.version });
    expect(res.status).toBe(200);
    expect(res.body.feasts.map(x => x.id)).toEqual([f.id]);
    const bad = await patch(s.id, { feasts: [f.id, plain.id], version: res.body.version });
    expect(bad.status).toBe(400);
  });

  it('a kind in the Trash filters to no rows', async () => {
    const k = kinds[0];
    await post({ title: 'K', kind_id: k.id });
    expect(await list(`?kind=${k.id}`)).toHaveLength(1);
    await del(`/api/spell-kinds/${k.id}`);
    expect(await list(`?kind=${k.id}`)).toEqual([]);
  });
});

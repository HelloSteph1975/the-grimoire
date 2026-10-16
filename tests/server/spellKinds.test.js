import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext, BASE_CONTENT } from './helpers.js';
import { seedStarter } from '../../server/services/starter.js';
import { bumpSpellsUsing } from '../../server/services/spellLinks.js';
import { MOON_PHASES, DAYS, PLANETS, TIMING, SABBAT_KEYS } from '../../server/services/timing.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

const kinds = async () => (await t.http().get('/api/spell-kinds')).body;
const db = () => t.ctx.db;
const addSpell = (title, kindId = null) => Number(db().prepare('INSERT INTO spells (title, kind_id) VALUES (?, ?)').run(title, kindId).lastInsertRowid);
const versionOf = id => db().prepare('SELECT version FROM spells WHERE id = ?').get(id).version;
const addCategory = () => Number(db().prepare("INSERT INTO categories (name) VALUES ('C')").run().lastInsertRowid);
const addEntry = (cat, name) => Number(db().prepare('INSERT INTO correspondences (category_id, name) VALUES (?, ?)').run(cat, name).lastInsertRowid);

describe('/api/spell-kinds', () => {
  it('lists the five starter kinds in order', async () => {
    const list = await kinds();
    expect(list.map(k => k.name)).toEqual(['Spell', 'Ritual', 'Blessing', 'Cleansing', 'Other']);
    expect(list.every(k => k.is_starter === 1)).toBe(true);
    expect(list[0].starter_key).toBe('spell-kind.spell');
  });
  it('adds, renames (dropping Starter) and conflicts on a stale rename', async () => {
    const added = await t.http().post('/api/spell-kinds').send({ name: 'Charm' });
    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: 'Charm', is_starter: 0, version: 1 });
    const [first] = await kinds();
    const renamed = await t.http().patch(`/api/spell-kinds/${first.id}`).send({ version: first.version, name: 'Working' });
    expect(renamed.body).toMatchObject({ name: 'Working', is_starter: 0, version: 2 });
    const stale = await t.http().patch(`/api/spell-kinds/${first.id}`).send({ version: 1, name: 'Again' });
    expect(stale.status).toBe(409);
    expect(stale.body.current.name).toBe('Working');
  });
  it('reorders, and a stale reorder gets reorder_conflict', async () => {
    const list = await kinds();
    const items = list.map(k => ({ id: k.id, version: k.version }));
    const ok = await t.http().post('/api/spell-kinds/reorder').send({ items: [...items].reverse() });
    expect(ok.status).toBe(200);
    expect(ok.body.map(k => k.name)).toEqual(['Other', 'Cleansing', 'Blessing', 'Ritual', 'Spell']);
    const stale = await t.http().post('/api/spell-kinds/reorder').send({ items });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('reorder_conflict');
  });
  it('reports usage 0 for an unused kind and 404 for a missing one', async () => {
    const [first] = await kinds();
    expect((await t.http().get(`/api/spell-kinds/${first.id}/usage`)).body).toEqual({ spells: 0 });
    expect((await t.http().get('/api/spell-kinds/99999/usage')).status).toBe(404);
  });
  it('counts only live spells in usage', async () => {
    const [first] = await kinds();
    addSpell('A', first.id);
    const gone = addSpell('B', first.id);
    db().prepare("UPDATE spells SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(gone);
    expect((await t.http().get(`/api/spell-kinds/${first.id}/usage`)).body).toEqual({ spells: 1 });
  });
  it('deletes to the Trash as type kind, bumping its spells, and restores', async () => {
    const [first] = await kinds();
    const s = addSpell('A', first.id);
    const other = addSpell('B', null);
    expect((await t.http().delete(`/api/spell-kinds/${first.id}`)).status).toBe(200);
    expect(await kinds()).toHaveLength(4);
    expect(versionOf(s)).toBe(2);
    expect(versionOf(other)).toBe(1);
    const trash = (await t.http().get('/api/trash')).body;
    expect(trash).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'kind', id: first.id, title: 'Spell' })]));
    const back = await t.http().post(`/api/trash/kind/${first.id}/restore`);
    expect(back.status).toBe(200);
    expect(versionOf(s)).toBe(3);
    expect((await kinds())[0].name).toBe('Spell');
  });
  it('restores through the kind route too', async () => {
    const [first] = await kinds();
    await t.http().delete(`/api/spell-kinds/${first.id}`);
    expect((await t.http().post(`/api/spell-kinds/${first.id}/restore`)).body).toMatchObject({ id: first.id, deleted_at: null });
  });
  it('deleting forever a starter kind records starter_removed, clears kind_id, bumps spells, and survives a re-seed', async () => {
    const [first] = await kinds();
    const s = addSpell('A', first.id);
    await t.http().delete(`/api/spell-kinds/${first.id}`);
    const v = versionOf(s);
    expect((await t.http().delete(`/api/trash/kind/${first.id}`)).status).toBe(200);
    expect(db().prepare('SELECT 1 FROM starter_removed WHERE starter_key = ?').get('spell-kind.spell')).toBeTruthy();
    expect(db().prepare('SELECT kind_id FROM spells WHERE id = ?').get(s).kind_id).toBeNull();
    expect(versionOf(s)).toBe(v + 1);
    expect(seedStarter(db(), { content: BASE_CONTENT })).toBe(0);
    expect(await kinds()).toHaveLength(4);
  });
});

describe('spell kinds with spells made through the API', () => {
  const makeSpell = async kindId => (await t.http().post('/api/spells').send({ title: 'A', kind_id: kindId })).body;
  const spell = async id => (await t.http().get(`/api/spells/${id}`)).body;

  it('counts one live spell in usage', async () => {
    const [first] = await kinds();
    await makeSpell(first.id);
    expect((await t.http().get(`/api/spell-kinds/${first.id}/usage`)).body).toEqual({ spells: 1 });
  });
  it('deleting a kind bumps its spell, and deleting it forever leaves no kind and bumps again', async () => {
    const [first] = await kinds();
    const s = await makeSpell(first.id);
    await t.http().delete(`/api/spell-kinds/${first.id}`);
    expect(await spell(s.id)).toMatchObject({ kind_id: null, version: 2 });
    await t.http().delete(`/api/trash/kind/${first.id}`);
    expect(await spell(s.id)).toMatchObject({ kind_id: null, version: 3 });
    expect(db().prepare('SELECT kind_id FROM spells WHERE id = ?').get(s.id).kind_id).toBeNull();
  });
});

describe('timing constants', () => {
  it('hold the exact codes', () => {
    expect(MOON_PHASES).toEqual(['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous', 'full', 'waning-gibbous', 'last-quarter', 'waning-crescent']);
    expect(DAYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
    expect(PLANETS).toEqual(['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn']);
    expect(TIMING).toEqual({ moon: MOON_PHASES, day: DAYS, planet: PLANETS });
    expect(SABBAT_KEYS).toEqual(['samhain', 'yule', 'imbolc', 'ostara', 'beltane', 'litha', 'lughnasadh', 'mabon'].map(k => `corr.sabbats-feasts.${k}`));
  });
});

describe('bumpSpellsUsing', () => {
  it('bumps each live spell once, however many ways it matches, and skips the Trash and others', () => {
    const [kind] = db().prepare('SELECT id FROM spell_kinds ORDER BY id').all();
    const trad = Number(db().prepare("INSERT INTO traditions (name) VALUES ('T')").run().lastInsertRowid);
    const cat = addCategory();
    const e1 = addEntry(cat, 'E1');
    const e2 = addEntry(cat, 'E2');
    const multi = addSpell('Multi', kind.id);
    db().prepare("INSERT INTO spell_ingredients (spell_id, position, name, correspondence_id) VALUES (?, 1, 'x', ?), (?, 2, 'y', ?)").run(multi, e1, multi, e2);
    db().prepare('INSERT INTO spell_feasts (spell_id, correspondence_id) VALUES (?, ?)').run(multi, e1);
    db().prepare('INSERT INTO spell_traditions (spell_id, tradition_id) VALUES (?, ?)').run(multi, trad);
    const onlyFeast = addSpell('Feast');
    db().prepare('INSERT INTO spell_feasts (spell_id, correspondence_id) VALUES (?, ?)').run(onlyFeast, e2);
    const trashed = addSpell('Trashed', kind.id);
    db().prepare("UPDATE spells SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(trashed);
    db().prepare('INSERT INTO spell_feasts (spell_id, correspondence_id) VALUES (?, ?)').run(trashed, e1);
    const unrelated = addSpell('Unrelated');

    bumpSpellsUsing(db(), { entries: [e1, e2], traditions: [trad], kinds: [kind.id] });
    expect(versionOf(multi)).toBe(2);
    expect(versionOf(onlyFeast)).toBe(2);
    expect(versionOf(trashed)).toBe(1);
    expect(versionOf(unrelated)).toBe(1);
  });
  it('bumps by tradition or kind alone, and does nothing with no ids', () => {
    const [kind] = db().prepare('SELECT id FROM spell_kinds ORDER BY id').all();
    const trad = Number(db().prepare("INSERT INTO traditions (name) VALUES ('T')").run().lastInsertRowid);
    const a = addSpell('A');
    db().prepare('INSERT INTO spell_traditions (spell_id, tradition_id) VALUES (?, ?)').run(a, trad);
    const b = addSpell('B', kind.id);
    bumpSpellsUsing(db(), {});
    expect([versionOf(a), versionOf(b)]).toEqual([1, 1]);
    bumpSpellsUsing(db(), { traditions: [trad] });
    expect([versionOf(a), versionOf(b)]).toEqual([2, 1]);
    bumpSpellsUsing(db(), { kinds: [kind.id] });
    expect([versionOf(a), versionOf(b)]).toEqual([2, 2]);
  });
});

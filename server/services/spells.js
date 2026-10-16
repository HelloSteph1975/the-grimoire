import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { HttpError, notFound } from '../http.js';
import { validate } from '../validate.js';
import { fold } from './correspondences.js';
import { TIMING, SABBAT_KEYS } from './timing.js';

export const SPELL_SCHEMA = {
  title: { type: 'string!', maxLength: 200 },
  purpose: { type: 'string', maxLength: 200 },
  kind_id: { type: 'int', min: 1 },
  notes: { type: 'string', maxLength: 4000 },
  source: { type: 'string', maxLength: 200 },
  traditions: { type: 'ids', maxItems: 20 },
  feasts: { type: 'ids', maxItems: 20 },
};

const MAX_LINES = 50;
const MAX_STEPS = 50;
const FIELDS = ['title', 'purpose', 'kind_id', 'notes', 'source'];
const R = db => repos(db).spells;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const invalid = (errors, codes) => new HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes });

// Collects field errors as messages and codes, the way validate() reports them.
function collector() {
  const errors = {};
  const codes = {};
  const fail = (key, message, code, vars = {}) => { errors[key] = message; codes[key] = { code, ...vars }; };
  return { errors, codes, fail, any: () => Object.keys(errors).length > 0 };
}

// Optional text, trimmed; blank means null. Returns undefined when it failed.
function text(v, key, max, required, fail) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return fail(key, 'Must be text', 'not_text');
  const s = v.trim();
  if (required && !s) return fail(key, 'Required', 'required');
  if (s.length > max) return fail(key, `Keep it to ${max} characters or fewer`, 'too_long', { max });
  return s || null;
}

// Up to 50 lines of { name, amount, correspondence_id }. A line with no name, amount or link is
// dropped, like a blank step. Errors go under ingredients.<index>.<field>, the index as sent, and
// each kept line remembers that index in `at`.
const blank = v => v === undefined || v === null || (typeof v === 'string' && !v.trim());
function checkIngredients(v, fail) {
  if (v === null) return [];
  if (!Array.isArray(v)) return fail('ingredients', 'Not the right format', 'bad_format');
  if (v.length > MAX_LINES) return fail('ingredients', `No more than ${MAX_LINES}`, 'too_many', { max: MAX_LINES });
  return v.map((line, i) => {
    const key = f => `ingredients.${i}.${f}`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) return fail(key('name'), 'Required', 'required');
    if (blank(line.name) && blank(line.amount) && blank(line.correspondence_id)) return null;
    const name = text(line.name, key('name'), 200, true, fail);
    const amount = text(line.amount, key('amount'), 50, false, fail);
    let link = line.correspondence_id;
    if (link === undefined || link === null || link === '') link = null;
    else if (!Number.isInteger(link) || link < 1) link = fail(key('correspondence_id'), 'That link is broken', 'bad_id');
    return { name, amount, correspondence_id: link, at: i };
  }).filter(Boolean);
}

// Up to 50 steps of text; blank steps are dropped. Errors go under steps.<index> (the index as sent).
function checkSteps(v, fail) {
  if (v === null) return [];
  if (!Array.isArray(v)) return fail('steps', 'Must be a list of text', 'not_text');
  if (v.length > MAX_STEPS) return fail('steps', `No more than ${MAX_STEPS}`, 'too_many', { max: MAX_STEPS });
  return v.map((s, i) => text(s, `steps.${i}`, 1000, false, fail)).filter(Boolean);
}

// { moon, day, planet }: only the keys sent, each without repeats and in the fixed list order.
// Other keys are ignored. null clears all three.
function checkTiming(v, fail) {
  if (v === null) return { moon: [], day: [], planet: [] };
  if (typeof v !== 'object' || Array.isArray(v)) return fail('timing', 'Not the right format', 'bad_format');
  const out = {};
  for (const [key, codes] of Object.entries(TIMING)) {
    if (!has(v, key)) continue;
    const list = v[key] ?? [];
    if (!Array.isArray(list) || list.some(c => !codes.includes(c))) fail(`timing.${key}`, `Must be one of: ${codes.join(', ')}`, 'not_one_of');
    else out[key] = codes.filter(c => list.includes(c));
  }
  return out;
}

const LISTS = { ingredients: checkIngredients, steps: checkSteps, timing: checkTiming };

// Checks the row fields and every list together, so one 400 names every bad field.
function checkSpell(body, { partial = false } = {}) {
  const src = body ?? {};
  const r = validate(SPELL_SCHEMA, src, { partial });
  const c = collector();
  if (r.errors) for (const k of Object.keys(r.errors)) c.fail(k, r.errors[k], r.codes[k].code, r.codes[k]);
  const data = r.data ?? {};
  for (const [key, checkList] of Object.entries(LISTS)) if (has(src, key)) data[key] = checkList(src[key], c.fail);
  if (c.any()) throw invalid(c.errors, c.codes);
  return data;
}

// Traditions in the Trash keep their join but are not shown.
const liveTraditions = (db, id) => db.prepare(`SELECT t.id FROM spell_traditions st JOIN traditions t ON t.id = st.tradition_id
  WHERE st.spell_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.name COLLATE NOCASE, t.id`).all(id).map(r => r.id);

// Feasts whose entry is in the Trash keep their join but are not shown.
const liveFeasts = (db, id) => db.prepare(`SELECT c.id, c.name, c.starter_key, c.is_starter, c.feast_day FROM spell_feasts sf
  JOIN correspondences c ON c.id = sf.correspondence_id
  WHERE sf.spell_id = ? AND c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE, c.id`).all(id);

// Every line keeps its stored link; `link` is filled only while the entry is live.
function ingredients(db, id) {
  return db.prepare(`SELECT i.name, i.amount, i.correspondence_id, c.id AS link_id, c.name AS link_name, c.starter_key, c.is_starter
    FROM spell_ingredients i LEFT JOIN correspondences c ON c.id = i.correspondence_id AND c.deleted_at IS NULL
    WHERE i.spell_id = ? ORDER BY i.position`).all(id).map(r => ({
    name: r.name, amount: r.amount, correspondence_id: r.correspondence_id,
    link: r.link_id ? { id: r.link_id, name: r.link_name, starter_key: r.starter_key, is_starter: r.is_starter } : null,
  }));
}

function timing(db, id) {
  const stored = db.prepare('SELECT kind, code FROM spell_timing WHERE spell_id = ?').all(id);
  return Object.fromEntries(Object.entries(TIMING).map(([key, codes]) =>
    [key, codes.filter(c => stored.some(s => s.kind === key && s.code === c))]));
}

const liveKind = (db, id) => !!id && !!db.prepare('SELECT 1 FROM spell_kinds WHERE id = ? AND deleted_at IS NULL').get(id);

function shape(db, row) {
  return {
    id: row.id, title: row.title, purpose: row.purpose, kind_id: liveKind(db, row.kind_id) ? row.kind_id : null,
    notes: row.notes, source: row.source, version: row.version, created_at: row.created_at, updated_at: row.updated_at,
    traditions: liveTraditions(db, row.id),
    feasts: liveFeasts(db, row.id),
    ingredients: ingredients(db, row.id),
    steps: db.prepare('SELECT text FROM spell_steps WHERE spell_id = ? ORDER BY position').all(row.id).map(r => r.text),
    timing: timing(db, row.id),
  };
}

export function getSpell(db, id) {
  const row = R(db).get(id);
  return row ? shape(db, row) : null;
}

// Every tradition or feast joined to this spell, the ones in the Trash too.
const joined = (db, table, col, id) => db.prepare(`SELECT ${col} AS id FROM ${table} WHERE spell_id = ?`).all(id).map(r => r.id);

// Kind, traditions and feasts must be live; an ingredient may link to an entry in the Trash, but
// the entry must exist. The one exception is what this spell already holds: a kind, tradition or
// feast that went to the Trash after the form was opened (or a form that sends no kind while the
// stored kind is in the Trash) is accepted and left as stored, a hidden link that shows again on
// restore. Those are dropped from `data`, so the write keeps them as they are.
function checkRefs(db, data, stored) {
  const c = collector();
  const live = (table, id) => db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id);
  const hiddenKind = stored?.kind_id && !liveKind(db, stored.kind_id);
  if (hiddenKind && (data.kind_id === null || data.kind_id === stored.kind_id)) delete data.kind_id;
  else if (data.kind_id != null && !liveKind(db, data.kind_id)) c.fail('kind_id', 'Not found', 'not_found');
  if (data.traditions) {
    const had = stored ? joined(db, 'spell_traditions', 'tradition_id', stored.id) : [];
    const hidden = id => had.includes(id) && !live('traditions', id);
    if (data.traditions.some(id => !hidden(id) && !live('traditions', id))) c.fail('traditions', 'Not found', 'not_found');
    else data.traditions = data.traditions.filter(id => !hidden(id));
  }
  // A feast already on this spell stays, even if its entry lost its feast day or went to the Trash;
  // only newly added feasts must be live and have a feast day or be a sabbat entry.
  if (data.feasts) {
    const feastable = db.prepare(`SELECT 1 FROM correspondences WHERE id = ? AND deleted_at IS NULL
      AND (feast_day IS NOT NULL OR starter_key IN (${SABBAT_KEYS.map(() => '?').join(', ')}))`);
    const had = stored ? joined(db, 'spell_feasts', 'correspondence_id', stored.id) : [];
    if (data.feasts.some(id => !(had.includes(id) || feastable.get(id, ...SABBAT_KEYS)))) c.fail('feasts', 'Not found', 'not_found');
    else data.feasts = data.feasts.filter(id => !had.includes(id) || live('correspondences', id));
  }
  const exists = db.prepare('SELECT 1 FROM correspondences WHERE id = ?');
  data.ingredients?.forEach(line => {
    if (line.correspondence_id && !exists.get(line.correspondence_id)) c.fail(`ingredients.${line.at}.correspondence_id`, 'Not found', 'not_found');
  });
  if (c.any()) throw invalid(c.errors, c.codes);
}

// Replaces the live joins in `table`; joins to rows in the Trash (not in `current`) are kept.
function setLive(db, table, col, id, current, wanted) {
  const drop = db.prepare(`DELETE FROM ${table} WHERE spell_id = ? AND ${col} = ?`);
  for (const x of current) if (!wanted.includes(x)) drop.run(id, x);
  const add = db.prepare(`INSERT OR IGNORE INTO ${table} (spell_id, ${col}) VALUES (?, ?)`);
  for (const x of wanted) if (!current.includes(x)) add.run(id, x);
}

// Writes the lists that were sent; the ones left out stay as stored.
function writeChildren(db, id, data) {
  if (data.traditions) setLive(db, 'spell_traditions', 'tradition_id', id, liveTraditions(db, id), data.traditions);
  if (data.feasts) setLive(db, 'spell_feasts', 'correspondence_id', id, liveFeasts(db, id).map(f => f.id), data.feasts);
  if (data.ingredients) {
    db.prepare('DELETE FROM spell_ingredients WHERE spell_id = ?').run(id);
    const add = db.prepare('INSERT INTO spell_ingredients (spell_id, position, name, amount, correspondence_id) VALUES (?, ?, ?, ?, ?)');
    data.ingredients.forEach((l, i) => add.run(id, i + 1, l.name, l.amount, l.correspondence_id));
  }
  if (data.steps) {
    db.prepare('DELETE FROM spell_steps WHERE spell_id = ?').run(id);
    const add = db.prepare('INSERT INTO spell_steps (spell_id, position, text) VALUES (?, ?, ?)');
    data.steps.forEach((s, i) => add.run(id, i + 1, s));
  }
  for (const [key, codes] of Object.entries(data.timing ?? {})) {
    db.prepare('DELETE FROM spell_timing WHERE spell_id = ? AND kind = ?').run(id, key);
    const add = db.prepare('INSERT INTO spell_timing (spell_id, kind, code) VALUES (?, ?, ?)');
    for (const code of codes) add.run(id, key, code);
  }
}

const rowData = data => Object.fromEntries(FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]]));

export function createSpell(db, body) {
  const data = checkSpell(body);
  return transaction(db, () => {
    checkRefs(db, data);
    const row = R(db).create(rowData(data));
    writeChildren(db, row.id, data);
    return getSpell(db, row.id);
  });
}

// One transaction: the version check, the row, then lines, steps, timing, traditions and feasts.
export function updateSpell(db, id, body, version) {
  const data = checkSpell(body, { partial: true });
  return transaction(db, () => {
    const stored = R(db).get(id);
    if (!stored) throw notFound();
    // A stale form gets the conflict (with the current spell) before any check on what it lists.
    if (stored.version !== version) throw new VersionConflict(shape(db, stored));
    checkRefs(db, data, stored);
    try {
      R(db).update(id, rowData(data), version);
    } catch (err) {
      if (err instanceof VersionConflict) throw new VersionConflict(shape(db, err.current));
      throw err;
    }
    writeChildren(db, id, data);
    return getSpell(db, id);
  });
}

// Plain soft delete and restore: lines, steps, timing and joins stay in place.
export function deleteSpell(db, id) {
  if (!transaction(db, () => R(db).remove(id))) throw notFound();
}

export function restoreSpell(db, id) {
  if (!transaction(db, () => R(db).restore(id))) throw notFound('Nothing to restore');
  return getSpell(db, id);
}

// Live spells ordered by title. `q` matches title, purpose, ingredient names, steps, notes and
// source, ignoring case and accents. A kind in the Trash shows as no kind.
export function listSpells(db, { kind, tradition, q } = {}) {
  const where = ['s.deleted_at IS NULL'];
  const args = [];
  if (kind) { where.push('k.id = ?'); args.push(kind); }
  if (tradition) { where.push('EXISTS (SELECT 1 FROM spell_traditions st WHERE st.spell_id = s.id AND st.tradition_id = ?)'); args.push(tradition); }
  const needle = fold(q).trim();
  const search = needle ? `, s.notes, s.source,
    (SELECT group_concat(name, char(10)) FROM spell_ingredients WHERE spell_id = s.id) AS lines,
    (SELECT group_concat(text, char(10)) FROM spell_steps WHERE spell_id = s.id) AS steps` : '';
  let rows = db.prepare(`SELECT s.id, s.title, s.purpose, k.id AS kind_id, s.version${search}
    FROM spells s LEFT JOIN spell_kinds k ON k.id = s.kind_id AND k.deleted_at IS NULL
    WHERE ${where.join(' AND ')} ORDER BY s.title COLLATE NOCASE, s.id`).all(...args);
  if (needle) rows = rows.filter(r => [r.title, r.purpose, r.lines, r.steps, r.notes, r.source].some(s => fold(s).includes(needle)));
  return rows.map(({ id, title, purpose, kind_id, version }) => ({ id, title, purpose, kind_id, version }));
}

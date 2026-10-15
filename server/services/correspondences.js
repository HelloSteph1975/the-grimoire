import { transaction } from '../db/connection.js';
import { NOW } from '../db/migrations.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { HttpError, notFound, notInTrash } from '../http.js';
import { check } from '../validate.js';
import { getSettings } from './settings.js';
import { readPack } from './locales.js';

export const ENTRY_SCHEMA = {
  category_id: { type: 'int!', min: 1 },
  name: { type: 'string!', maxLength: 80 },
  summary: { type: 'string', maxLength: 200 },
  body: { type: 'string', maxLength: 4000 },
  keywords: { type: 'strings', maxItems: 20, maxLength: 30, lowercase: true },
  feast_day: { type: 'monthDay', hintKey: 'feast_day' },
  traditions: { type: 'ids', maxItems: 20 },
  links: { type: 'ids', maxItems: 50 },
};

const FIELDS = ['category_id', 'name', 'summary', 'body', 'keywords', 'feast_day'];
const R = db => repos(db).correspondences;

const parseKeywords = json => {
  try { const v = JSON.parse(json ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
};
const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// Lower-cased, without accents, so "Día" matches "dia".
export const fold = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Traditions in the Trash keep their join but are not shown.
function liveTraditions(db, id) {
  return db.prepare(`SELECT t.id FROM correspondence_traditions ct JOIN traditions t ON t.id = ct.tradition_id
    WHERE ct.correspondence_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.name COLLATE NOCASE, t.id`).all(id).map(r => r.id);
}

// Linked entries in the Trash keep their pair but are not shown.
function liveLinks(db, id) {
  return db.prepare(`SELECT c.id, c.name, c.category_id, c.is_starter, c.starter_key FROM correspondence_links l
    JOIN correspondences c ON c.id = CASE WHEN l.a_id = ? THEN l.b_id ELSE l.a_id END
    WHERE (l.a_id = ? OR l.b_id = ?) AND c.deleted_at IS NULL ORDER BY c.name COLLATE NOCASE, c.id`).all(id, id, id);
}

const shape = (db, row) => ({ ...row, keywords: parseKeywords(row.keywords), traditions: liveTraditions(db, row.id), links: liveLinks(db, row.id) });

export function getEntry(db, id) {
  const row = R(db).get(id);
  return row ? shape(db, row) : null;
}

// Category, traditions and links must name live records; an entry can't link to itself.
function checkRefs(db, data, selfId) {
  const errors = {};
  const codes = {};
  const live = (table, id) => db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id);
  const fail = (key, message, code) => { errors[key] = message; codes[key] = { code }; };
  if (data.category_id !== undefined && !live('categories', data.category_id)) fail('category_id', 'Not found', 'not_found');
  if (data.traditions?.some(id => !live('traditions', id))) fail('traditions', 'Not found', 'not_found');
  if (data.links?.includes(selfId)) fail('links', "An entry can't link to itself.", 'self_link');
  else if (data.links?.some(id => !live('correspondences', id))) fail('links', 'Not found', 'not_found');
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes });
}

// Replaces the live traditions; joins to traditions in the Trash are kept.
function setTraditions(db, id, wanted) {
  const current = liveTraditions(db, id);
  const drop = db.prepare('DELETE FROM correspondence_traditions WHERE correspondence_id = ? AND tradition_id = ?');
  for (const t of current) if (!wanted.includes(t)) drop.run(id, t);
  const add = db.prepare('INSERT OR IGNORE INTO correspondence_traditions (correspondence_id, tradition_id) VALUES (?, ?)');
  for (const t of wanted) if (!current.includes(t)) add.run(id, t);
}

// Replaces the live links, stored once as (lower id, higher id). Pairs with an entry in the
// Trash are kept. Every entry that gained or lost a link gets a new version, so a stale save there gets a 409.
function setLinks(db, id, wanted) {
  const current = new Set(liveLinks(db, id).map(l => l.id));
  const next = new Set(wanted);
  const touched = [];
  const drop = db.prepare('DELETE FROM correspondence_links WHERE a_id = ? AND b_id = ?');
  const add = db.prepare('INSERT INTO correspondence_links (a_id, b_id) VALUES (?, ?)');
  for (const other of current) if (!next.has(other)) { drop.run(Math.min(id, other), Math.max(id, other)); touched.push(other); }
  for (const other of next) if (!current.has(other)) { add.run(Math.min(id, other), Math.max(id, other)); touched.push(other); }
  if (touched.length) db.prepare(`UPDATE correspondences SET version = version + 1, updated_at = ${NOW} WHERE id IN (${touched.map(() => '?').join(',')})`).run(...touched);
}

const rowData = data => {
  const out = {};
  for (const k of FIELDS) if (data[k] !== undefined) out[k] = k === 'keywords' ? JSON.stringify(data[k]) : data[k];
  return out;
};

export function createEntry(db, body) {
  const data = check(ENTRY_SCHEMA, body);
  return transaction(db, () => {
    checkRefs(db, data);
    const row = R(db).create(rowData({ keywords: [], ...data }));
    setTraditions(db, row.id, data.traditions ?? []);
    setLinks(db, row.id, data.links ?? []);
    return getEntry(db, row.id);
  });
}

// One transaction: the version-checked row update, then traditions and links.
export function updateEntry(db, id, body, version) {
  const data = check(ENTRY_SCHEMA, body, { partial: true });
  return transaction(db, () => {
    const stored = R(db).get(id);
    if (!stored) throw notFound();
    // A stale form gets the conflict (with the current entry) before any check on what it lists.
    if (stored.version !== version) throw new VersionConflict(shape(db, stored));
    checkRefs(db, data, id);
    const row = rowData(data);
    // A save that changes nothing keeps the Starter tag.
    if (stored.is_starter) {
      const changed = Object.keys(row).some(k => row[k] !== stored[k])
        || (data.traditions && !sameSet(data.traditions, liveTraditions(db, id)))
        || (data.links && !sameSet(data.links, liveLinks(db, id).map(l => l.id)));
      if (changed) row.is_starter = 0;
    }
    try {
      R(db).update(id, row, version);
    } catch (err) {
      if (err instanceof VersionConflict) throw new VersionConflict(shape(db, err.current));
      throw err;
    }
    if (data.traditions) setTraditions(db, id, data.traditions);
    if (data.links) setLinks(db, id, data.links);
    return getEntry(db, id);
  });
}

// Live entries linked to any of `ids` (and not among them) get a new version, because the links
// they show changed. Used when entries go to the Trash or come back.
export function bumpLinked(db, ids) {
  if (!ids.length) return;
  const set = ids.map(() => '?').join(',');
  db.prepare(`UPDATE correspondences SET version = version + 1, updated_at = ${NOW}
    WHERE deleted_at IS NULL AND id NOT IN (${set}) AND id IN (
      SELECT b_id FROM correspondence_links WHERE a_id IN (${set}) UNION SELECT a_id FROM correspondence_links WHERE b_id IN (${set}))`)
    .run(...ids, ...ids, ...ids);
}

export function deleteEntry(db, id) {
  transaction(db, () => {
    if (!R(db).remove(id)) throw notFound();
    bumpLinked(db, [id]);
  });
}

// An entry can only come back once its category is out of the Trash.
export function restoreEntry(db, id) {
  return transaction(db, () => {
    const row = R(db).get(id, { includeDeleted: true });
    if (!row?.deleted_at) throw notInTrash();
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND deleted_at IS NULL').get(row.category_id)) {
      throw new HttpError(409, 'Its category is in the Trash. Restore the category first.', undefined, { code: 'category_in_trash' });
    }
    R(db).restore(id);
    bumpLinked(db, [id]);
    return getEntry(db, id);
  });
}

// Removes an entry for good: its links and tradition joins first, then the row.
export function purgeEntry(db, row) {
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
  db.prepare('DELETE FROM correspondence_links WHERE a_id = ? OR b_id = ?').run(row.id, row.id);
  db.prepare('DELETE FROM correspondence_traditions WHERE correspondence_id = ?').run(row.id);
  db.prepare('DELETE FROM correspondences WHERE id = ?').run(row.id);
}

export function traditionUsage(db, id) {
  if (!db.prepare('SELECT 1 FROM traditions WHERE id = ? AND deleted_at IS NULL').get(id)) throw notFound();
  return {
    entries: db.prepare(`SELECT count(*) AS n FROM correspondence_traditions ct JOIN correspondences c ON c.id = ct.correspondence_id
      WHERE ct.tradition_id = ? AND c.deleted_at IS NULL`).get(id).n,
  };
}

// The saved language's content pack, or {} for English or a missing pack.
function contentPack(db, dataDir) {
  const { language } = getSettings(db);
  if (language === 'en') return {};
  try { return readPack(dataDir, language, 'content'); } catch { return {}; }
}

// Pack values are text (keywords too, as one comma-separated string); anything else is ignored.
const packText = v => (typeof v === 'string' ? v : '');

// Live entries, ordered by name. `q` matches name, summary, full text and keywords, ignoring
// case and accents; in another language it also matches the translated text of rows that are still starters.
export function listEntries(db, dataDir, { category, tradition, q } = {}) {
  const where = ['c.deleted_at IS NULL'];
  const args = [];
  if (category) { where.push('c.category_id = ?'); args.push(category); }
  if (tradition) { where.push('EXISTS (SELECT 1 FROM correspondence_traditions ct WHERE ct.correspondence_id = c.id AND ct.tradition_id = ?)'); args.push(tradition); }
  let rows = db.prepare(`SELECT c.id, c.category_id, c.name, c.summary, c.feast_day, c.is_starter, c.starter_key, c.version, c.body, c.keywords
    FROM correspondences c WHERE ${where.join(' AND ')} ORDER BY c.name COLLATE NOCASE, c.id`).all(...args);
  const needle = fold(q).trim();
  if (needle) {
    const pack = contentPack(db, dataDir);
    rows = rows.filter(r => {
      const texts = [r.name, r.summary, r.body, ...parseKeywords(r.keywords)];
      if (r.is_starter && r.starter_key) for (const f of ['name', 'summary', 'body', 'keywords']) texts.push(packText(pack[`${r.starter_key}.${f}`]));
      return texts.some(s => fold(s).includes(needle));
    });
  }
  return rows.map(({ body, keywords, ...short }) => short);
}

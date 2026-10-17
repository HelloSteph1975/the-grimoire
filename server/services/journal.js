import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { notFound, notInTrash, queryId } from '../http.js';
import { validate } from '../validate.js';
import { invalid, collector, addErrors, text, checkDayRange, deletedForever } from './fields.js';
import { fold } from './correspondences.js';
import { getSettings } from './settings.js';
import { skyAt } from './sky.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TAGS = 20;
const MAX_CARDS = 20;
const EXCERPT = 80;

export const JOURNAL_SCHEMA = {
  date: { type: 'date!' },
  time: { type: 'string', pattern: TIME, patternHint: 'Use a time like 19:30', hintKey: 'time' },
  kind_id: { type: 'int', min: 1 },
  title: { type: 'string', maxLength: 200 },
  text: { type: 'string', maxLength: 20000 },
};

const FIELDS = ['date', 'time', 'kind_id', 'title', 'text'];
const R = db => repos(db).journal;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const blank = v => v === undefined || v === null || (typeof v === 'string' && !v.trim());

// Up to 20 tags, each up to 50 characters after trimming. Blanks are dropped, and so are repeats
// by case and accents (the first spelling stays). Errors go under tags.<index>, the index as sent.
function checkTags(v, fail) {
  if (v === null) return [];
  if (!Array.isArray(v)) return fail('tags', 'Not the right format', 'bad_format');
  const seen = new Set();
  const out = [];
  v.forEach((raw, i) => {
    if (typeof raw !== 'string') return fail(`tags.${i}`, 'Must be text', 'not_text');
    const tag = raw.trim();
    if (!tag) return;
    if (tag.length > 50) return fail(`tags.${i}`, 'Keep it to 50 characters or fewer', 'too_long', { max: 50 });
    if (seen.has(fold(tag))) return;
    seen.add(fold(tag));
    out.push(tag);
  });
  if (out.length > MAX_TAGS) fail('tags', `No more than ${MAX_TAGS}`, 'too_many', { max: MAX_TAGS });
  return out;
}

// Up to 20 card lines of { name, position, reversed }. A line with no name and no position is
// dropped. Errors go under cards.<index>.<field>, the index as sent.
function checkCards(v, fail) {
  if (v === null) return [];
  if (!Array.isArray(v)) return fail('cards', 'Not the right format', 'bad_format');
  if (v.length > MAX_CARDS) return fail('cards', `No more than ${MAX_CARDS}`, 'too_many', { max: MAX_CARDS });
  return v.map((line, i) => {
    const key = f => `cards.${i}.${f}`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) return fail(key('name'), 'Required', 'required');
    if (blank(line.name) && blank(line.position)) return null;
    const name = text(line.name, key('name'), 100, true, fail);
    const position = text(line.position, key('position'), 100, false, fail);
    const r = line.reversed ?? false;
    if (![true, false, 1, 0].includes(r)) fail(key('reversed'), 'Must be yes or no', 'bad_format');
    return { name, position, reversed: r === true || r === 1 };
  }).filter(Boolean);
}

// Checks the row fields, tags and cards together, so one 400 names every bad field.
function checkEntry(body, { partial = false } = {}) {
  const src = body ?? {};
  const r = validate(JOURNAL_SCHEMA, src, { partial });
  const c = collector();
  addErrors(c, r);
  checkDayRange(c, r, src);
  const data = r.data ?? {};
  if (has(src, 'tags')) data.tags = checkTags(src.tags, c.fail);
  if (has(src, 'cards')) data.cards = checkCards(src.cards, c.fail);
  if (c.any()) throw invalid(c.errors, c.codes);
  return data;
}

// An entry needs a title, some text or a card. A PATCH uses the stored values for what it leaves out.
function checkNotEmpty(data, stored, storedCards) {
  const title = data.title !== undefined ? data.title : stored?.title;
  const body = data.text !== undefined ? data.text : stored?.text;
  const cards = data.cards ? data.cards.length : storedCards;
  if (title || body || cards) return;
  const c = collector();
  c.fail('title', 'Add a title, some text or a card', 'empty');
  throw invalid(c.errors, c.codes);
}

const liveKind = (db, id) => !!id && !!db.prepare('SELECT 1 FROM journal_kinds WHERE id = ? AND deleted_at IS NULL').get(id);

// The kind must be live. The one exception is what this entry already holds: a kind that went to
// the Trash after the form was opened (or a form that sends null or the same id while the stored
// kind is in the Trash) is accepted and left as stored, a hidden link that shows again on
// restore. A kind deleted forever is dropped.
function checkKind(db, data, stored) {
  if (data.kind_id != null && deletedForever(db, 'journal_kinds', data.kind_id)) data.kind_id = null;
  const hidden = stored?.kind_id && !liveKind(db, stored.kind_id);
  if (hidden && (data.kind_id === null || data.kind_id === stored.kind_id)) delete data.kind_id;
  else if (data.kind_id != null && !liveKind(db, data.kind_id)) {
    const c = collector();
    c.fail('kind_id', 'Not found', 'not_found');
    throw invalid(c.errors, c.codes);
  }
}

const tagsOf = (db, id) => db.prepare('SELECT tag FROM journal_entry_tags WHERE entry_id = ? ORDER BY position').all(id).map(r => r.tag);
const cardsOf = (db, id) => db.prepare('SELECT name, position_label, reversed FROM journal_cards WHERE entry_id = ? ORDER BY position')
  .all(id).map(r => ({ name: r.name, position: r.position_label, reversed: r.reversed === 1 }));
const cardCount = (db, id) => db.prepare('SELECT count(*) AS n FROM journal_cards WHERE entry_id = ?').get(id).n;

function parseSky(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

// `kind_id` is the stored link; `kind` is filled only while that kind is live.
function shape(db, row) {
  return {
    id: row.id, date: row.date, time: row.time, kind_id: row.kind_id, kind: liveKind(db, row.kind_id) ? { id: row.kind_id } : null,
    title: row.title, text: row.text, sky: parseSky(row.sky),
    version: row.version, created_at: row.created_at, updated_at: row.updated_at,
    tags: tagsOf(db, row.id), cards: cardsOf(db, row.id),
  };
}

export function getJournal(db, id) {
  const row = R(db).get(id);
  return row ? shape(db, row) : null;
}

// Replaces the lists that were sent; the ones left out stay as stored.
function writeChildren(db, id, data) {
  if (data.tags) {
    db.prepare('DELETE FROM journal_entry_tags WHERE entry_id = ?').run(id);
    const add = db.prepare('INSERT INTO journal_entry_tags (entry_id, position, tag) VALUES (?, ?, ?)');
    data.tags.forEach((tag, i) => add.run(id, i + 1, tag));
  }
  if (data.cards) {
    db.prepare('DELETE FROM journal_cards WHERE entry_id = ?').run(id);
    const add = db.prepare('INSERT INTO journal_cards (entry_id, position, name, position_label, reversed) VALUES (?, ?, ?, ?, ?)');
    data.cards.forEach((l, i) => add.run(id, i + 1, l.name, l.position, l.reversed ? 1 : 0));
  }
}

const rowData = data => Object.fromEntries(FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
const skyFor = (db, date, time) => JSON.stringify(skyAt(date, time, getSettings(db).time_zone));

export function createJournal(db, body) {
  const data = checkEntry(body);
  return transaction(db, () => {
    checkNotEmpty(data, null, 0);
    checkKind(db, data);
    const row = R(db).create({ ...rowData(data), sky: skyFor(db, data.date, data.time ?? null) });
    writeChildren(db, row.id, data);
    return getJournal(db, row.id);
  });
}

// One transaction: the version check, the row, then tags and cards. The sky is worked out again
// only when the date or time really changes, so a saved snapshot stays as it was.
export function updateJournal(db, id, body, version) {
  const data = checkEntry(body, { partial: true });
  return transaction(db, () => {
    const stored = R(db).get(id);
    if (!stored) throw notFound();
    // A stale form gets the conflict (with the current entry) before any check on what it lists.
    if (stored.version !== version) throw new VersionConflict(shape(db, stored));
    checkNotEmpty(data, stored, cardCount(db, id));
    checkKind(db, data, stored);
    const row = rowData(data);
    const date = data.date ?? stored.date;
    const time = data.time !== undefined ? data.time : stored.time;
    if (date !== stored.date || time !== stored.time) row.sky = skyFor(db, date, time);
    try {
      R(db).update(id, row, version);
    } catch (err) {
      if (err instanceof VersionConflict) throw new VersionConflict(shape(db, err.current));
      throw err;
    }
    writeChildren(db, id, data);
    return getJournal(db, id);
  });
}

// Tags and cards stay in place, hidden with the entry.
export function deleteJournal(db, id) {
  if (!transaction(db, () => R(db).remove(id))) throw notFound();
}

export function restoreJournal(db, id) {
  if (!transaction(db, () => R(db).restore(id))) throw notInTrash();
  return getJournal(db, id);
}

// The Trash title: the title, else the start of the text, else the date.
export const journalTitle = row => row.title || (row.text ? row.text.slice(0, 60) : row.date);

const excerptOf = s => (s ? s.slice(0, EXCERPT) : null);

// Newest first. An entry with no time comes before the timed ones of its day.
const ORDER = 'e.date DESC, e.time IS NOT NULL, e.time DESC, e.id DESC';
const ITEM = `e.id, e.date, e.time, k.id AS kind_id, e.title, e.text, json_extract(e.sky, '$.moon') AS moon, e.version`;

const LIST_QUERY = {
  q: { type: 'string' },
  tag: { type: 'string' },
  from: { type: 'date' },
  to: { type: 'date' },
};

// What the tag, card and word filters look at, for these entries: the tags and the cards of live entries.
function searchables(db, ids) {
  const byId = new Map(ids.map(id => [id, { tags: [], cards: [] }]));
  for (const r of db.prepare(`SELECT t.entry_id, t.tag FROM journal_entry_tags t JOIN journal_entries e ON e.id = t.entry_id
    WHERE e.deleted_at IS NULL`).all()) byId.get(r.entry_id)?.tags.push(r.tag);
  for (const r of db.prepare(`SELECT c.entry_id, c.name, c.position_label FROM journal_cards c JOIN journal_entries e ON e.id = c.entry_id
    WHERE e.deleted_at IS NULL`).all()) {
    byId.get(r.entry_id)?.cards.push(r.name, r.position_label ?? '');
  }
  return byId;
}

// Live entries as list items. `needle` and `tag` are already folded. A kind in the Trash shows as no kind.
function select(db, { kind, from, to, tag, needle } = {}) {
  const where = ['e.deleted_at IS NULL'];
  const args = [];
  if (kind) { where.push('k.id = ?'); args.push(kind); }
  if (from) { where.push('e.date >= ?'); args.push(from); }
  if (to) { where.push('e.date <= ?'); args.push(to); }
  let rows = db.prepare(`SELECT ${ITEM} FROM journal_entries e LEFT JOIN journal_kinds k ON k.id = e.kind_id AND k.deleted_at IS NULL
    WHERE ${where.join(' AND ')} ORDER BY ${ORDER}`).all(...args);
  if (tag || needle) {
    const extra = searchables(db, rows.map(r => r.id));
    if (tag) rows = rows.filter(r => extra.get(r.id).tags.some(x => fold(x) === tag));
    if (needle) {
      rows = rows.filter(r => [r.title, r.text, ...extra.get(r.id).tags, ...extra.get(r.id).cards].some(x => fold(x).includes(needle)));
    }
  }
  return rows.map(({ id, date, time, kind_id, title, text: body, moon, version }) =>
    ({ id, date, time, kind_id, title, excerpt: excerptOf(body), moon, version }));
}

// The entries whose title, text, tags, card names or card positions contain the folded needle.
export const matchJournal = (db, needle) => select(db, { needle });

// Live entries, newest first. `q`, `kind`, `tag`, `from` and `to` all narrow the list together.
export function listJournal(db, query) {
  const r = validate(LIST_QUERY, query ?? {}, { partial: true });
  if (r.errors) throw invalid(r.errors, r.codes);
  const { q, tag, from, to } = r.data;
  return select(db, { kind: queryId(query?.kind), from, to, tag: tag ? fold(tag) : null, needle: q ? fold(q) : null });
}

// The live entries of one day: by time, the ones with no time first.
export function journalOnDay(db, day) {
  return db.prepare(`SELECT e.id, e.time, e.title, e.text, k.id AS kind_id FROM journal_entries e
    LEFT JOIN journal_kinds k ON k.id = e.kind_id AND k.deleted_at IS NULL
    WHERE e.deleted_at IS NULL AND e.date = ? ORDER BY e.time IS NOT NULL, e.time, e.id`).all(day)
    .map(({ id, time, title, text: body, kind_id }) => ({ id, time, title, excerpt: excerptOf(body), kind_id }));
}

// Tags on live entries, one spelling for each folded tag: the most used, then the first by
// localeCompare. Sorted with localeCompare.
export function journalTags(db) {
  const rows = db.prepare(`SELECT t.tag, count(*) AS n FROM journal_entry_tags t JOIN journal_entries e ON e.id = t.entry_id
    WHERE e.deleted_at IS NULL GROUP BY t.tag`).all();
  const best = new Map();
  for (const r of rows) {
    const key = fold(r.tag);
    const have = best.get(key);
    if (!have || r.n > have.n || (r.n === have.n && r.tag.localeCompare(have.tag) < 0)) best.set(key, r);
  }
  return [...best.values()].map(r => r.tag).sort((a, b) => a.localeCompare(b));
}

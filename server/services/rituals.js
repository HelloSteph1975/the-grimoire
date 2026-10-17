import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { notFound, notInTrash, queryId } from '../http.js';
import { validate } from '../validate.js';
import { setLiveJoins } from './joins.js';
import { invalid, collector, addErrors, text, checkDayRange, deletedForever } from './fields.js';
import { getSettings } from './settings.js';
import { dayInZone, skyAt } from './sky.js';
import { fold } from './correspondences.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const STATUSES = ['planned', 'done', 'skipped'];

export const RITUAL_SCHEMA = {
  title: { type: 'string!', maxLength: 200 },
  spell_id: { type: 'int', min: 1 },
  date: { type: 'date!' },
  time: { type: 'string', pattern: TIME, patternHint: 'Use a time like 19:30', hintKey: 'time' },
  reminder_days: { type: 'int', min: 0, max: 30 },
  plan_notes: { type: 'string', maxLength: 4000 },
  status: { type: STATUSES, nullable: false },
  changes: { type: 'string', maxLength: 4000 },
  outcome: { type: 'string', maxLength: 4000 },
  rating: { type: 'int', min: 1, max: 5 },
  traditions: { type: 'ids', maxItems: 20 },
};

const MAX_SUPPLIES = 50;
const FIELDS = ['title', 'spell_id', 'date', 'time', 'reminder_days', 'plan_notes', 'status', 'changes', 'outcome', 'rating'];
const JOIN = { table: 'ritual_traditions', ownerCol: 'ritual_id', otherCol: 'tradition_id', otherTable: 'traditions' };
const R = db => repos(db).rituals;
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const blank = v => v === undefined || v === null || (typeof v === 'string' && !v.trim());

// Up to 50 lines of { name, amount, checked }. A line with no name and no amount is dropped.
// Errors go under supplies.<index>.<field>, the index as sent.
function checkSupplies(v, fail) {
  if (v === null) return [];
  if (!Array.isArray(v)) return fail('supplies', 'Not the right format', 'bad_format');
  if (v.length > MAX_SUPPLIES) return fail('supplies', `No more than ${MAX_SUPPLIES}`, 'too_many', { max: MAX_SUPPLIES });
  return v.map((line, i) => {
    const key = f => `supplies.${i}.${f}`;
    if (!line || typeof line !== 'object' || Array.isArray(line)) return fail(key('name'), 'Required', 'required');
    if (blank(line.name) && blank(line.amount)) return null;
    const name = text(line.name, key('name'), 200, true, fail);
    const amount = text(line.amount, key('amount'), 50, false, fail);
    const c = line.checked ?? false;
    if (![true, false, 1, 0].includes(c)) fail(key('checked'), 'Must be yes or no', 'bad_format');
    return { name, amount, checked: c === true || c === 1 };
  }).filter(Boolean);
}

// Checks the row fields and the supplies together, so one 400 names every bad field.
function checkRitual(body, { partial = false } = {}) {
  const src = body ?? {};
  const r = validate(RITUAL_SCHEMA, src, { partial });
  const c = collector();
  addErrors(c, r);
  checkDayRange(c, r, src);
  const data = r.data ?? {};
  if (has(src, 'supplies')) data.supplies = checkSupplies(src.supplies, c.fail);
  if (c.any()) throw invalid(c.errors, c.codes);
  return data;
}

const liveSpell = (db, id) => (id ? db.prepare('SELECT id, title FROM spells WHERE id = ? AND deleted_at IS NULL').get(id) ?? null : null);
const liveTradition = (db, id) => !!db.prepare('SELECT 1 FROM traditions WHERE id = ? AND deleted_at IS NULL').get(id);

// Traditions in the Trash keep their join but are not shown.
const liveTraditions = (db, id) => db.prepare(`SELECT t.id FROM ritual_traditions j JOIN traditions t ON t.id = j.tradition_id
  WHERE j.ritual_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.name COLLATE NOCASE, t.id`).all(id).map(r => r.id);

const supplies = (db, id) => db.prepare('SELECT name, amount, checked FROM ritual_supplies WHERE ritual_id = ? ORDER BY position')
  .all(id).map(r => ({ name: r.name, amount: r.amount, checked: r.checked === 1 }));

function parseSky(s) {
  try { return s ? JSON.parse(s) : null; } catch { return null; }
}

// `spell_id` is the stored link; `spell` is filled only while that spell is live.
function shape(db, row) {
  const spell = liveSpell(db, row.spell_id);
  return {
    id: row.id, title: row.title, spell_id: row.spell_id, spell: spell ? { id: spell.id, title: spell.title } : null,
    date: row.date, time: row.time, reminder_days: row.reminder_days, plan_notes: row.plan_notes, status: row.status,
    changes: row.changes, outcome: row.outcome, rating: row.rating, sky: parseSky(row.sky),
    version: row.version, created_at: row.created_at, updated_at: row.updated_at,
    traditions: liveTraditions(db, row.id),
    supplies: supplies(db, row.id),
  };
}

export function getRitual(db, id) {
  const row = R(db).get(id);
  return row ? shape(db, row) : null;
}

// The spell must be live, and so must the traditions. The one exception is what this ritual
// already holds: a spell or tradition that went to the Trash after the form was opened (or a form
// that sends no spell while the stored one is in the Trash) is accepted and left as stored, a
// hidden link that shows again on restore. Links to rows deleted forever are dropped.
function checkRefs(db, data, stored) {
  const c = collector();
  if (data.spell_id != null && deletedForever(db, 'spells', data.spell_id)) data.spell_id = null;
  if (data.traditions) data.traditions = data.traditions.filter(id => !deletedForever(db, 'traditions', id));
  const hiddenSpell = stored?.spell_id && !liveSpell(db, stored.spell_id);
  if (hiddenSpell && (data.spell_id === null || data.spell_id === stored.spell_id)) delete data.spell_id;
  else if (data.spell_id != null && !liveSpell(db, data.spell_id)) c.fail('spell_id', 'Not found', 'not_found');
  if (data.traditions) {
    const had = stored ? db.prepare('SELECT tradition_id AS id FROM ritual_traditions WHERE ritual_id = ?').all(stored.id).map(r => r.id) : [];
    const hidden = id => had.includes(id) && !liveTradition(db, id);
    if (data.traditions.some(id => !hidden(id) && !liveTradition(db, id))) c.fail('traditions', 'Not found', 'not_found');
    else data.traditions = data.traditions.filter(id => !hidden(id));
  }
  if (c.any()) throw invalid(c.errors, c.codes);
}

// Writes the lists that were sent; the ones left out stay as stored.
function writeChildren(db, id, data) {
  if (data.traditions) setLiveJoins(db, JOIN, id, data.traditions);
  if (data.supplies) {
    db.prepare('DELETE FROM ritual_supplies WHERE ritual_id = ?').run(id);
    const add = db.prepare('INSERT INTO ritual_supplies (ritual_id, position, name, amount, checked) VALUES (?, ?, ?, ?, ?)');
    data.supplies.forEach((l, i) => add.run(id, i + 1, l.name, l.amount, l.checked ? 1 : 0));
  }
}

const rowData = data => Object.fromEntries(FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]]));
const skyFor = (db, date, time) => JSON.stringify(skyAt(date, time, getSettings(db).time_zone));

export function createRitual(db, body) {
  const data = checkRitual(body);
  return transaction(db, () => {
    checkRefs(db, data);
    const row = R(db).create({ ...rowData(data), sky: skyFor(db, data.date, data.time ?? null) });
    writeChildren(db, row.id, data);
    return getRitual(db, row.id);
  });
}

// One transaction: the version check, the row, then supplies and traditions. The sky is worked
// out again only when the date or time really changes, so a saved snapshot stays as it was.
export function updateRitual(db, id, body, version) {
  const data = checkRitual(body, { partial: true });
  return transaction(db, () => {
    const stored = R(db).get(id);
    if (!stored) throw notFound();
    // A stale form gets the conflict (with the current ritual) before any check on what it lists.
    if (stored.version !== version) throw new VersionConflict(shape(db, stored));
    checkRefs(db, data, stored);
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
    return getRitual(db, id);
  });
}

// Supplies, traditions and follow-ups stay in place, hidden with the ritual.
export function deleteRitual(db, id) {
  if (!transaction(db, () => R(db).remove(id))) throw notFound();
}

export function restoreRitual(db, id) {
  if (!transaction(db, () => R(db).restore(id))) throw notInTrash();
  return getRitual(db, id);
}

const LIST_QUERY = {
  tab: { type: ['planned', 'tolog', 'log'] },
  rating: { type: 'int', min: 1, max: 5 },
  from: { type: 'date' },
  to: { type: 'date' },
};

// "Today" is the day `now` falls on in her Settings zone.
const todayOf = (db, now) => dayInZone(now, getSettings(db).time_zone);

const ITEM = 'r.id, r.title, r.spell_id, r.date, r.time, r.status, r.rating, r.version';
const ASC = 'r.date, r.time, r.id';
const DESC = 'r.date DESC, r.time DESC, r.id DESC';

// Live rituals for one tab. Planned: planned from today on, soonest first (a ritual dated today
// stays here all day). To log: planned with a date before today, oldest first. Log: done and
// skipped, newest first. No tab: every live ritual, by date. Filters apply to any tab.
export function listRituals(db, query, now) {
  const r = validate(LIST_QUERY, query ?? {}, { partial: true });
  if (r.errors) throw invalid(r.errors, r.codes);
  const { tab, rating, from, to } = r.data;
  const spell = queryId(query?.spell);
  const tradition = queryId(query?.tradition);
  const today = todayOf(db, now);
  const where = ['r.deleted_at IS NULL'];
  const args = [];
  let order = ASC;
  if (tab === 'planned') { where.push("r.status = 'planned' AND r.date >= ?"); args.push(today); }
  if (tab === 'tolog') { where.push("r.status = 'planned' AND r.date < ?"); args.push(today); }
  if (tab === 'log') { where.push("r.status IN ('done', 'skipped')"); order = DESC; }
  if (spell) { where.push('r.spell_id = ?'); args.push(spell); }
  if (tradition) { where.push('EXISTS (SELECT 1 FROM ritual_traditions j WHERE j.ritual_id = r.id AND j.tradition_id = ?)'); args.push(tradition); }
  if (rating) { where.push('r.rating >= ?'); args.push(rating); }
  if (from) { where.push('r.date >= ?'); args.push(from); }
  if (to) { where.push('r.date <= ?'); args.push(to); }
  return db.prepare(`SELECT ${ITEM} FROM rituals r WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...args);
}

// The live rituals of a live spell: planned from today on (soonest first) and the rest (newest first).
export function spellRituals(db, spellId, now) {
  if (!liveSpell(db, spellId)) throw notFound();
  const today = todayOf(db, now);
  const pick = (test, order) => db.prepare(`SELECT ${ITEM} FROM rituals r
    WHERE r.deleted_at IS NULL AND r.spell_id = ? AND ${test} ORDER BY ${order}`).all(spellId, today);
  return {
    planned: pick("r.status = 'planned' AND r.date >= ?", ASC),
    past: pick("NOT (r.status = 'planned' AND r.date >= ?)", DESC),
  };
}

// Live rituals whose title, plan notes, changes, outcome, supply names or live follow-up texts
// contain the folded needle, newest first.
export function searchRituals(db, needle) {
  const lines = sql => {
    const by = new Map();
    for (const r of db.prepare(sql).all()) by.set(r.id, [...(by.get(r.id) ?? []), r.s]);
    return by;
  };
  const supplyNames = lines('SELECT s.ritual_id AS id, s.name AS s FROM ritual_supplies s JOIN rituals r ON r.id = s.ritual_id WHERE r.deleted_at IS NULL');
  const followups = lines(`SELECT f.ritual_id AS id, f.text AS s FROM ritual_followups f JOIN rituals r ON r.id = f.ritual_id
    WHERE r.deleted_at IS NULL AND f.deleted_at IS NULL`);
  return db.prepare('SELECT id, title, date, status, plan_notes, changes, outcome FROM rituals WHERE deleted_at IS NULL ORDER BY date DESC, time DESC, id DESC').all()
    .filter(r => [r.title, r.plan_notes, r.changes, r.outcome, ...(supplyNames.get(r.id) ?? []), ...(followups.get(r.id) ?? [])].some(x => fold(x).includes(needle)))
    .map(({ id, title, date, status }) => ({ id, title, date, status }));
}

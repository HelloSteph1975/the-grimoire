import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { HttpError, notFound } from '../http.js';
import { validate } from '../validate.js';
import { setLiveJoins } from './joins.js';
import { fold } from './correspondences.js';

export const OWN_DATE_SCHEMA = {
  title: { type: 'string!', maxLength: 120 },
  date: { type: 'date!' },
  yearly: { type: 'bool', nullable: false },
  notes: { type: 'string', maxLength: 2000 },
  traditions: { type: 'ids', maxItems: 20 },
};

const FIELDS = ['title', 'date', 'yearly', 'notes'];
const R = db => repos(db).ownDates;
const JOIN = { table: 'own_date_traditions', ownerCol: 'own_date_id', otherCol: 'tradition_id', otherTable: 'traditions' };
const invalid = (errors, codes) => new HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes });

// A real date in 1900 to 2100. validate() says not_date for a day that doesn't exist; both cases
// are reported the same way, as a date in the wrong format.
function checkOwnDate(body, { partial = false } = {}) {
  const r = validate(OWN_DATE_SCHEMA, body, { partial });
  const errors = { ...r.errors };
  const codes = { ...r.codes };
  const bad = key => { errors[key] = 'Use a date like 2026-05-01 (year 1900 to 2100)'; codes[key] = { code: 'bad_format', hint: 'date' }; };
  if (codes.date?.code === 'not_date') bad('date');
  else if (r.data?.date && (r.data.date < '1900-01-01' || r.data.date > '2100-12-31')) bad('date');
  if (Object.keys(errors).length) throw invalid(errors, codes);
  return r.data;
}

// Traditions in the Trash keep their join but are not shown.
const liveTraditions = (db, id) => db.prepare(`SELECT t.id FROM own_date_traditions j JOIN traditions t ON t.id = j.tradition_id
  WHERE j.own_date_id = ? AND t.deleted_at IS NULL ORDER BY t.sort_order, t.name COLLATE NOCASE, t.id`).all(id).map(r => r.id);

const shape = (db, row) => ({
  id: row.id, title: row.title, date: row.date, yearly: row.yearly, notes: row.notes,
  version: row.version, created_at: row.created_at, updated_at: row.updated_at,
  traditions: liveTraditions(db, row.id),
});

export function getOwnDate(db, id) {
  const row = R(db).get(id);
  return row ? shape(db, row) : null;
}

export function listOwnDates(db) {
  return R(db).list().map(row => shape(db, row));
}

// Traditions must be live. One the date already holds that went to the Trash after the form was
// opened (a PATCH that sends the GET's list) is hidden: it is left out of `data`, so the write keeps it.
function checkRefs(db, data, stored) {
  if (!data.traditions) return;
  const live = id => db.prepare('SELECT 1 FROM traditions WHERE id = ? AND deleted_at IS NULL').get(id);
  const had = stored ? db.prepare('SELECT tradition_id AS id FROM own_date_traditions WHERE own_date_id = ?').all(stored.id).map(r => r.id) : [];
  const hidden = id => had.includes(id) && !live(id);
  if (data.traditions.some(id => !hidden(id) && !live(id))) throw invalid({ traditions: 'Not found' }, { traditions: { code: 'not_found' } });
  data.traditions = data.traditions.filter(id => !hidden(id));
}

const rowData = data => Object.fromEntries(FIELDS.filter(k => data[k] !== undefined).map(k => [k, data[k]]));

export function createOwnDate(db, body) {
  const data = checkOwnDate(body);
  return transaction(db, () => {
    checkRefs(db, data);
    const row = R(db).create(rowData(data));
    setLiveJoins(db, JOIN, row.id, data.traditions ?? []);
    return getOwnDate(db, row.id);
  });
}

// One transaction: the version check, then the references, the row and the traditions.
export function updateOwnDate(db, id, body, version) {
  const data = checkOwnDate(body, { partial: true });
  return transaction(db, () => {
    const stored = R(db).get(id);
    if (!stored) throw notFound();
    // A stale form gets the conflict (with the current date) before any check on what it lists.
    if (stored.version !== version) throw new VersionConflict(shape(db, stored));
    checkRefs(db, data, stored);
    try {
      R(db).update(id, rowData(data), version);
    } catch (err) {
      if (err instanceof VersionConflict) throw new VersionConflict(shape(db, err.current));
      throw err;
    }
    if (data.traditions) setLiveJoins(db, JOIN, id, data.traditions);
    return getOwnDate(db, id);
  });
}

export function deleteOwnDate(db, id) {
  if (!transaction(db, () => R(db).remove(id))) throw notFound();
}

export function restoreOwnDate(db, id) {
  if (!transaction(db, () => R(db).restore(id))) throw notFound('Nothing to restore');
  return getOwnDate(db, id);
}

// Live own dates whose title or notes contain the folded needle, by date.
export function searchOwnDates(db, needle) {
  return db.prepare('SELECT id, title, date, yearly, notes FROM own_dates WHERE deleted_at IS NULL ORDER BY date, title COLLATE NOCASE, id').all()
    .filter(r => [r.title, r.notes].some(x => fold(x).includes(needle)))
    .map(({ id, title, date, yearly }) => ({ id, title, date, yearly }));
}

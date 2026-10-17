import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { VersionConflict } from '../db/repo.js';
import { HttpError, notFound, notInTrash } from '../http.js';
import { validate } from '../validate.js';
import { invalid, collector, addErrors, checkDayRange } from './fields.js';

const EDIT_SCHEMA = {
  date: { type: 'date!' },
  text: { type: 'string!', maxLength: 2000 },
};
const CREATE_SCHEMA = { ritual_id: { type: 'int!', min: 1 }, ...EDIT_SCHEMA };

const R = db => repos(db).followups;
const liveRitual = (db, id) => !!db.prepare('SELECT 1 FROM rituals WHERE id = ? AND deleted_at IS NULL').get(id);

function check(schema, body, { partial = false } = {}) {
  const src = body ?? {};
  const r = validate(schema, src, { partial });
  const c = collector();
  addErrors(c, r);
  checkDayRange(c, r, src);
  if (c.any()) throw invalid(c.errors, c.codes);
  return r.data;
}

const shape = row => ({
  id: row.id, ritual_id: row.ritual_id, date: row.date, text: row.text,
  version: row.version, created_at: row.created_at, updated_at: row.updated_at,
});

// A live follow-up of a live ritual. One whose ritual is in the Trash is hidden with it.
function visible(db, id) {
  const row = R(db).get(id);
  return row && liveRitual(db, row.ritual_id) ? row : null;
}

export function listFollowups(db, ritualId) {
  if (!ritualId) throw new HttpError(400, 'Name the ritual.', undefined, { code: 'bad_id' });
  if (!liveRitual(db, ritualId)) throw notFound();
  return db.prepare('SELECT * FROM ritual_followups WHERE ritual_id = ? AND deleted_at IS NULL ORDER BY date, id').all(ritualId).map(shape);
}

// A follow-up is its own record: adding or editing one never touches the ritual's version.
export function createFollowup(db, body) {
  const data = check(CREATE_SCHEMA, body);
  return transaction(db, () => {
    if (!liveRitual(db, data.ritual_id)) throw invalid({ ritual_id: 'Not found' }, { ritual_id: { code: 'not_found' } });
    return shape(R(db).create(data));
  });
}

export function updateFollowup(db, id, body, version) {
  const data = check(EDIT_SCHEMA, body, { partial: true });
  return transaction(db, () => {
    const stored = visible(db, id);
    if (!stored) throw notFound();
    try {
      return shape(R(db).update(id, data, version));
    } catch (err) {
      if (err instanceof VersionConflict) throw new VersionConflict(shape(err.current));
      throw err;
    }
  });
}

export function deleteFollowup(db, id) {
  transaction(db, () => {
    if (!visible(db, id)) throw notFound();
    R(db).remove(id);
  });
}

// A follow-up can't come back on its own while its ritual is in the Trash.
export function restoreFollowup(db, id) {
  return transaction(db, () => {
    const row = R(db).get(id, { includeDeleted: true });
    if (!row || !row.deleted_at) throw notInTrash();
    if (!liveRitual(db, row.ritual_id)) {
      throw new HttpError(409, 'Restore its ritual first.', undefined, { code: 'ritual_in_trash' });
    }
    R(db).restore(id);
    return shape(R(db).get(id));
  });
}

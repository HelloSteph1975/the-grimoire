import { HttpError } from '../http.js';

export const invalid = (errors, codes) => new HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes });

// Collects field errors as messages and codes, the way validate() reports them.
export function collector() {
  const errors = {};
  const codes = {};
  const fail = (key, message, code, vars = {}) => { errors[key] = message; codes[key] = { code, ...vars }; };
  return { errors, codes, fail, any: () => Object.keys(errors).length > 0 };
}

// Copies validate()'s errors into a collector.
export function addErrors(c, r) {
  if (r.errors) for (const k of Object.keys(r.errors)) c.fail(k, r.errors[k], r.codes[k].code, r.codes[k]);
}

// Optional text, trimmed; blank means null. Returns undefined when it failed.
export function text(v, key, max, required, fail) {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') return fail(key, 'Must be text', 'not_text');
  const s = v.trim();
  if (required && !s) return fail(key, 'Required', 'required');
  if (s.length > max) return fail(key, `Keep it to ${max} characters or fewer`, 'too_long', { max });
  return s || null;
}

// A 'date' field from validate() must also fall in 1900 to 2100. A day that doesn't exist and one
// out of range are both reported as a date in the wrong format. It reads the value sent, since
// validate() returns no data when any other field failed.
export function checkDayRange(c, r, src, key = 'date') {
  const bad = () => c.fail(key, 'Use a date like 2026-05-01 (year 1900 to 2100)', 'bad_format', { hint: 'date' });
  const v = src?.[key];
  if (r.codes?.[key]?.code === 'not_date') bad();
  else if (!r.codes?.[key] && typeof v === 'string' && v && (v < '1900-01-01' || v > '2100-12-31')) bad();
}

// Ids are never reused (AUTOINCREMENT), so an id with no row that is at or below the table's
// high-water mark was deleted forever, perhaps in another window after this form opened.
export function deletedForever(db, table, id) {
  if (!Number.isInteger(id) || id < 1 || db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)) return false;
  const seq = db.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(table)?.seq ?? 0;
  return id <= seq;
}

import { HttpError } from './http.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^\d{2}-\d{2}$/;

function isRealDate(v) {
  if (!DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// A real day in a leap year, so 02-29 is allowed.
function isRealMonthDay(v) {
  if (typeof v !== 'string' || !MONTH_DAY.test(v)) return false;
  const [m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(2024, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function checkStrings(v, rule) {
  if (!Array.isArray(v) || !v.every(x => typeof x === 'string')) return { error: 'Must be a list of text', code: 'not_text' };
  if (rule.maxItems !== undefined && v.length > rule.maxItems) return { error: `No more than ${rule.maxItems}`, code: 'too_many', vars: { max: rule.maxItems } };
  if (rule.maxLength && v.some(x => x.trim().length > rule.maxLength)) return { error: `Keep each one to ${rule.maxLength} characters or fewer`, code: 'too_long', vars: { max: rule.maxLength } };
  return { value: v.map(x => x.trim()) };
}

// A list of record ids, without repeats.
function checkIds(v, rule) {
  if (!Array.isArray(v) || !v.every(x => Number.isInteger(x) && x >= 1)) return { error: 'That link is broken', code: 'bad_id' };
  const ids = [...new Set(v)];
  if (rule.maxItems !== undefined && ids.length > rule.maxItems) return { error: `No more than ${rule.maxItems}`, code: 'too_many', vars: { max: rule.maxItems } };
  return { value: ids };
}

function normalizeRule(raw) {
  const rule = typeof raw === 'string' || Array.isArray(raw) ? { type: raw } : { ...raw };
  if (typeof rule.type === 'string' && rule.type.endsWith('!')) {
    rule.type = rule.type.slice(0, -1);
    rule.required = true;
  }
  return rule;
}

const fail = (errors, codes, key, message, code, vars = {}) => { errors[key] = message; codes[key] = { code, ...vars }; };

function checkNumber(v, rule, integer) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || (typeof v === 'string' && v.trim() === '')) return { error: 'Must be a number', code: 'not_number' };
  if (integer && !Number.isInteger(n)) return { error: 'Must be a whole number', code: 'not_whole' };
  if (rule.min !== undefined && n < rule.min) return { error: `Must be at least ${rule.min}`, code: 'too_small', vars: { min: rule.min } };
  if (rule.max !== undefined && n > rule.max) return { error: `Must be at most ${rule.max}`, code: 'too_big', vars: { max: rule.max } };
  return { value: n };
}

export function validate(schema, body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  const codes = {};
  const src = body ?? {};
  for (const [key, raw] of Object.entries(schema)) {
    const rule = normalizeRule(raw);
    if (!Object.prototype.hasOwnProperty.call(src, key)) {
      if (rule.required && !partial) fail(errors, codes, key, 'Required', 'required');
      continue;
    }
    let v = src[key];
    if (v === '' || v === undefined) v = null;
    if (v === null) {
      if (rule.required || rule.nullable === false) fail(errors, codes, key, 'Required', 'required');
      else data[key] = rule.type === 'strings' || rule.type === 'ids' ? [] : null;
      continue;
    }
    if (Array.isArray(rule.type)) {
      if (rule.type.includes(v)) data[key] = v;
      else fail(errors, codes, key, `Must be one of: ${rule.type.join(', ')}`, 'not_one_of');
      continue;
    }
    let out;
    switch (rule.type) {
      case 'string':
        if (typeof v !== 'string') out = { error: 'Must be text', code: 'not_text' };
        else if ((rule.required || rule.nullable === false) && !v.trim()) out = { error: 'Required', code: 'required' };
        else if (rule.maxLength && v.trim().length > rule.maxLength) out = { error: `Keep it to ${rule.maxLength} characters or fewer`, code: 'too_long', vars: { max: rule.maxLength } };
        else if (rule.pattern && v.trim() && !rule.pattern.test(v.trim())) out = { error: rule.patternHint ?? 'Not the right format', code: 'bad_format', vars: rule.hintKey ? { hint: rule.hintKey } : {} };
        else out = { value: v.trim() || null };
        break;
      case 'number': out = checkNumber(v, rule, false); break;
      case 'int': out = checkNumber(v, rule, true); break;
      case 'bool': out = { value: v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0 }; break;
      case 'date':
        out = typeof v === 'string' && isRealDate(v) ? { value: v } : { error: 'Must be a date (YYYY-MM-DD)', code: 'not_date' };
        break;
      case 'strings': out = checkStrings(v, rule); break;
      case 'ids': out = checkIds(v, rule); break;
      case 'monthDay':
        out = isRealMonthDay(v) ? { value: v } : { error: 'Use a day like 12-12 (month-day)', code: 'bad_format', vars: rule.hintKey ? { hint: rule.hintKey } : {} };
        break;
      default: throw new Error(`Unknown rule type for ${key}`);
    }
    if (out.error) fail(errors, codes, key, out.error, out.code, out.vars);
    else data[key] = out.value;
  }
  return Object.keys(errors).length ? { errors, codes } : { data };
}

export function check(schema, body, opts) {
  const r = validate(schema, body, opts);
  if (r.errors) throw new HttpError(400, 'Please fix the highlighted fields.', r.errors, { code: 'invalid', detailCodes: r.codes });
  return r.data;
}

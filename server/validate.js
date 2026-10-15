import { HttpError } from './http.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(v) {
  if (!DATE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function normalizeRule(raw) {
  const rule = typeof raw === 'string' || Array.isArray(raw) ? { type: raw } : { ...raw };
  if (typeof rule.type === 'string' && rule.type.endsWith('!')) {
    rule.type = rule.type.slice(0, -1);
    rule.required = true;
  }
  return rule;
}

function checkNumber(v, rule, integer) {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || (typeof v === 'string' && v.trim() === '')) return { error: 'Must be a number' };
  if (integer && !Number.isInteger(n)) return { error: 'Must be a whole number' };
  if (rule.min !== undefined && n < rule.min) return { error: `Must be at least ${rule.min}` };
  if (rule.max !== undefined && n > rule.max) return { error: `Must be at most ${rule.max}` };
  return { value: n };
}

export function validate(schema, body, { partial = false } = {}) {
  const data = {};
  const errors = {};
  const src = body ?? {};
  for (const [key, raw] of Object.entries(schema)) {
    const rule = normalizeRule(raw);
    if (!Object.prototype.hasOwnProperty.call(src, key)) {
      if (rule.required && !partial) errors[key] = 'Required';
      continue;
    }
    let v = src[key];
    if (v === '' || v === undefined) v = null;
    if (v === null) {
      if (rule.required || rule.nullable === false) errors[key] = 'Required';
      else data[key] = null;
      continue;
    }
    if (Array.isArray(rule.type)) {
      if (rule.type.includes(v)) data[key] = v;
      else errors[key] = `Must be one of: ${rule.type.join(', ')}`;
      continue;
    }
    let out;
    switch (rule.type) {
      case 'string':
        if (typeof v !== 'string') out = { error: 'Must be text' };
        else if ((rule.required || rule.nullable === false) && !v.trim()) out = { error: 'Required' };
        else if (rule.maxLength && v.trim().length > rule.maxLength) out = { error: `Keep it to ${rule.maxLength} characters or fewer` };
        else if (rule.pattern && v.trim() && !rule.pattern.test(v.trim())) out = { error: rule.patternHint ?? 'Not the right format' };
        else out = { value: v.trim() || null };
        break;
      case 'number': out = checkNumber(v, rule, false); break;
      case 'int': out = checkNumber(v, rule, true); break;
      case 'bool': out = { value: v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0 }; break;
      case 'date':
        out = typeof v === 'string' && isRealDate(v) ? { value: v } : { error: 'Must be a date (YYYY-MM-DD)' };
        break;
      default: throw new Error(`Unknown rule type for ${key}`);
    }
    if (out.error) errors[key] = out.error;
    else data[key] = out.value;
  }
  return Object.keys(errors).length ? { errors } : { data };
}

export function check(schema, body, opts) {
  const r = validate(schema, body, opts);
  if (r.errors) throw new HttpError(400, 'Please fix the highlighted fields.', r.errors);
  return r.data;
}

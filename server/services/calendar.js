import { HttpError } from '../http.js';
import { moonQuarters, seasonDays } from './sky.js';
import { SABBAT_KEYS } from './timing.js';

export const MAX_RANGE_DAYS = 62;
const DAY_MS = 86400000;
const KIND_ORDER = { moon: 0, sabbat: 1, feast: 2, saint: 3, own: 4 };
const SAINT_CATEGORIES = ['category.saints', 'category.deities'];
const sabbatKey = name => `corr.sabbats-feasts.${name}`;

// Ostara, Litha, Mabon and Yule take a season's day; the other four a feast day.
const SEASON_OF = { ostara: 'march-equinox', litha: 'june-solstice', mabon: 'september-equinox', yule: 'december-solstice' };
const DEFAULT_DAY = { imbolc: '02-01', beltane: '05-01', lughnasadh: '08-01', samhain: '10-31' };
const OPPOSITE = { yule: 'litha', litha: 'yule', ostara: 'mabon', mabon: 'ostara', imbolc: 'lughnasadh', lughnasadh: 'imbolc', beltane: 'samhain', samhain: 'beltane' };

const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

// 'MM-DD' in a year; February 29 falls on February 28 in other years.
export function dayInYear(year, monthDay) {
  const md = monthDay === '02-29' && !isLeap(year) ? '02-28' : monthDay;
  return `${String(year).padStart(4, '0')}-${md}`;
}

export const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// The day each of the eight sabbats falls on in `year` ({ 'corr.sabbats-feasts.yule': 'YYYY-12-21', ... }).
// In the south each takes the day its opposite on the wheel has in the north. A fixed sabbat's
// day comes from the live entry's feast_day, or its default when that entry is gone or has none.
export function sabbatDays(db, year, { time_zone, hemisphere }) {
  const feastDays = Object.fromEntries(db.prepare(`SELECT starter_key, feast_day FROM correspondences
    WHERE deleted_at IS NULL AND feast_day IS NOT NULL AND starter_key IN (${SABBAT_KEYS.map(() => '?').join(', ')})`)
    .all(...SABBAT_KEYS).map(r => [r.starter_key, r.feast_day]));
  const seasons = seasonDays(year, time_zone);
  const northDay = name => (SEASON_OF[name] ? seasons[SEASON_OF[name]] : dayInYear(year, feastDays[sabbatKey(name)] ?? DEFAULT_DAY[name]));
  return Object.fromEntries(Object.keys(OPPOSITE).map(name => [sabbatKey(name), northDay(hemisphere === 'south' ? OPPOSITE[name] : name)]));
}

const entryOf = r => ({ id: r.id, name: r.name, starter_key: r.starter_key, is_starter: r.is_starter, category_id: r.category_id });

function entryItems(db, from, to, years, settings) {
  const rows = db.prepare(`SELECT c.id, c.name, c.starter_key, c.is_starter, c.category_id, c.feast_day, cat.starter_key AS category_key
    FROM correspondences c JOIN categories cat ON cat.id = c.category_id
    WHERE c.deleted_at IS NULL AND c.show_on_calendar = 1
      AND (c.feast_day IS NOT NULL OR c.starter_key IN (${SABBAT_KEYS.map(() => '?').join(', ')}))`).all(...SABBAT_KEYS);
  const sabbats = new Map(years.map(y => [y, sabbatDays(db, y, settings)]));
  const out = [];
  for (const r of rows) {
    const isSabbat = SABBAT_KEYS.includes(r.starter_key);
    const kind = isSabbat ? 'sabbat' : SAINT_CATEGORIES.includes(r.category_key) ? 'saint' : 'feast';
    for (const y of years) {
      const day = isSabbat ? sabbats.get(y)[r.starter_key] : dayInYear(y, r.feast_day);
      if (day >= from && day <= to) out.push({ day, kind, entry: entryOf(r) });
    }
  }
  return out;
}

function ownItems(db, from, to, years) {
  const rows = db.prepare(`SELECT id, title, date, yearly FROM own_dates WHERE deleted_at IS NULL
    AND (yearly = 1 OR (date >= ? AND date <= ?))`).all(from, to);
  const out = [];
  for (const r of rows) {
    const date = { id: r.id, title: r.title, yearly: r.yearly };
    // A yearly date starts in its own year.
    const start = Number(r.date.slice(0, 4));
    const days = r.yearly ? years.filter(y => y >= start).map(y => dayInYear(y, r.date.slice(5))) : [r.date];
    for (const day of days) if (day >= from && day <= to) out.push({ day, kind: 'own', date });
  }
  return out;
}

const idOf = item => item.entry?.id ?? item.date?.id ?? 0;
function compare(a, b) {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1;
  if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (a.kind === 'moon') return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
  return idOf(a) - idOf(b);
}

// Every dated item from `from` to `to` ('YYYY-MM-DD', inclusive), sorted by day, kind, then id.
// `moon: false` leaves out the moon quarters.
export function calendarItems(db, { from, to }, settings, { moon: withMoon = true } = {}) {
  const years = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.push(y);
  const moon = !withMoon ? [] : moonQuarters(from, to, settings.time_zone).map(q => ({ day: q.day, kind: 'moon', quarter: q.quarter, at: q.at }));
  return [...moon, ...entryItems(db, from, to, years, settings), ...ownItems(db, from, to, years)].sort(compare);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function goodDay(v) {
  if (typeof v !== 'string' || !DATE.test(v) || v < '1900-01-01' || v > '2100-12-31') return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// A calendar range from the query string: real days in 1900 to 2100, `to` not before `from`, at most 62 days apart.
export function checkRange(query) {
  const errors = {};
  const codes = {};
  for (const key of ['from', 'to']) {
    if (!goodDay(query?.[key])) {
      errors[key] = 'Use a date like 2026-05-01 (year 1900 to 2100)';
      codes[key] = { code: 'bad_format' };
    }
  }
  if (!Object.keys(errors).length) {
    const span = daysBetween(query.from, query.to);
    if (span < 0) { errors.range = 'The end comes before the start.'; codes.range = { code: 'reversed' }; }
    else if (span > MAX_RANGE_DAYS) { errors.range = `Ask for ${MAX_RANGE_DAYS} days or fewer.`; codes.range = { code: 'too_long', max: MAX_RANGE_DAYS }; }
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes });
  return { from: query.from, to: query.to };
}

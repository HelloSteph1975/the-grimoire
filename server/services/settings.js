import { HttpError } from '../http.js';
import { transaction } from '../db/connection.js';

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function defaultSettings() {
  return { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone: machineZone() };
}

// Any zone the runtime understands, aliases like Asia/Calcutta included.
function validZone(v) {
  if (typeof v !== 'string' || !v) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: v }); return true; } catch { return false; }
}
const RULES = {
  language: (v, { languages }) => languages.includes(v),
  theme: v => ['old-book', 'book-folk'].includes(v),
  hemisphere: v => ['north', 'south'].includes(v),
  time_zone: validZone,
};

export function getSettings(db) {
  const defaults = defaultSettings();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const saved = Object.fromEntries(rows.filter(r => Object.hasOwn(defaults, r.key)).map(r => [r.key, r.value]));
  return { ...defaults, ...saved };
}

// Settings are whole values saved together; the last save wins.
export function saveSettings(db, input, { languages = ['en'] } = {}) {
  const errors = Object.create(null);
  const clean = Object.create(null);
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!Object.hasOwn(RULES, k)) { errors[k] = 'Unknown setting'; continue; }
    const norm = typeof v === 'string' ? v.trim() : '';
    if (!RULES[k](norm, { languages })) errors[k] = 'Not a valid value';
    else clean[k] = norm;
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { ...errors });
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(db, () => { for (const [k, v] of Object.entries(clean)) up.run(k, v); });
  return getSettings(db);
}

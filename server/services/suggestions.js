import { moonPhasesOnDays, weekdayOf, WEEKDAY_PLANET, dayInZone } from './sky.js';
import { addDays, feastDaysFor, goodDay } from './calendar.js';
import { notFound } from '../http.js';
import { invalid } from './fields.js';

export const SUGGESTION_DAYS = 90;
export const MAX_SUGGESTIONS = 10;

// The spell's timing codes by group, and its feasts whose entries are live.
function preferences(db, spellId) {
  const codes = kind => db.prepare('SELECT code FROM spell_timing WHERE spell_id = ? AND kind = ?').all(spellId, kind).map(r => r.code);
  const feasts = db.prepare(`SELECT c.id FROM spell_feasts sf JOIN correspondences c ON c.id = sf.correspondence_id
    WHERE sf.spell_id = ? AND c.deleted_at IS NULL ORDER BY c.id`).all(spellId).map(r => r.id);
  return { moon: codes('moon'), days: codes('day'), planets: codes('planet'), feasts };
}

// Up to 10 days from `fromDay` through the next 89 that meet the spell's timing, best first.
// A day scores one point per group it meets (moon phases, days, planets, feasts), counting only
// the groups the spell has. Days that meet none are left out; ties go to the earlier day.
export function suggestDays(db, spellId, fromDay, settings) {
  const want = preferences(db, spellId);
  const groups = Object.keys(want).filter(g => want[g].length);
  if (!groups.length) return [];
  const range = { from: fromDay, to: addDays(fromDay, SUGGESTION_DAYS - 1) };
  const days = Array.from({ length: SUGGESTION_DAYS }, (_, i) => addDays(fromDay, i));
  const phases = want.moon.length ? moonPhasesOnDays(days, settings.time_zone) : {};
  const feastsOn = new Map();
  for (const { day, id } of feastDaysFor(db, want.feasts, range, settings)) feastsOn.set(day, [...(feastsOn.get(day) ?? []), id]);

  const out = [];
  for (const day of days) {
    const weekday = weekdayOf(day);
    const met = {
      moon: want.moon.filter(c => c === phases[day]),
      days: want.days.filter(c => c === weekday),
      planets: want.planets.filter(c => c === WEEKDAY_PLANET[weekday]),
      feasts: want.feasts.filter(id => feastsOn.get(day)?.includes(id)),
    };
    const score = groups.filter(g => met[g].length).length;
    if (score) out.push({ day, met, score });
  }
  return out.sort((a, b) => b.score - a.score || (a.day < b.day ? -1 : 1))
    .slice(0, MAX_SUGGESTIONS).map(({ day, met }) => ({ day, met }));
}

// The suggestions for a live spell, from `from` ('YYYY-MM-DD') or, when it's left out, tomorrow in her zone.
export function spellSuggestions(db, spellId, from, now, settings) {
  if (!db.prepare('SELECT 1 FROM spells WHERE id = ? AND deleted_at IS NULL').get(spellId)) throw notFound();
  if (from !== undefined && !goodDay(from)) {
    throw invalid({ from: 'Use a date like 2026-05-01 (year 1900 to 2100)' }, { from: { code: 'bad_format' } });
  }
  return suggestDays(db, spellId, from ?? addDays(dayInZone(now, settings.time_zone), 1), settings);
}

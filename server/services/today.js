import { dayInZone, moonNow } from './sky.js';
import { RITUAL_SCHEMA } from './rituals.js';
import { calendarItems, addDays, daysBetween, MAX_RANGE_DAYS } from './calendar.js';
import { journalOnDay } from './journal.js';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const COMING = 3;
const LOOK_AHEAD_DAYS = 366;

// Live entries linked to the weekday's entry (by starter key, edited or not), in one category.
function linkedIn(db, weekday, categoryKey) {
  return db.prepare(`SELECT c.id, c.name, c.starter_key, c.is_starter, c.category_id
    FROM correspondences d
    JOIN correspondence_links l ON l.a_id = d.id OR l.b_id = d.id
    JOIN correspondences c ON c.id = CASE WHEN l.a_id = d.id THEN l.b_id ELSE l.a_id END
    JOIN categories cat ON cat.id = c.category_id
    WHERE d.starter_key = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL AND cat.starter_key = ?
    ORDER BY c.name COLLATE NOCASE, c.id`).all(`corr.days.${weekday}`, categoryKey);
}

// The next few feasts and own dates (no moon phases or rituals, which have their own lists) from tomorrow, up to a year ahead.
function comingUp(db, today, settings) {
  const out = [];
  const last = addDays(today, LOOK_AHEAD_DAYS);
  for (let from = addDays(today, 1); from <= last && out.length < COMING; from = addDays(from, MAX_RANGE_DAYS + 1)) {
    const to = [addDays(from, MAX_RANGE_DAYS), last].sort()[0];
    for (const item of calendarItems(db, { from, to }, settings, { moon: false, rituals: false })) {
      out.push({ ...item, days_away: daysBetween(today, item.day) });
      if (out.length === COMING) break;
    }
  }
  return out;
}

const WEEK_DAYS = 7;
const MAX_REMINDER_DAYS = RITUAL_SCHEMA.reminder_days.max;

// Planned rituals from today through the next six days, by date and time.
const thisWeek = (db, today) => db.prepare(`SELECT id, title, date, time, spell_id FROM rituals
  WHERE deleted_at IS NULL AND status = 'planned' AND date >= ? AND date <= ?
  ORDER BY date, time, id`).all(today, addDays(today, WEEK_DAYS - 1));

// Planned rituals whose reminder day has come (date - reminder_days <= today) and whose date hasn't passed.
function reminders(db, today) {
  return db.prepare(`SELECT id, title, date, reminder_days FROM rituals
    WHERE deleted_at IS NULL AND status = 'planned' AND reminder_days IS NOT NULL AND date >= ? AND date <= ?
    ORDER BY date, time, id`).all(today, addDays(today, MAX_REMINDER_DAYS))
    .filter(r => addDays(r.date, -r.reminder_days) <= today)
    .map(r => ({ id: r.id, title: r.title, date: r.date, days_away: daysBetween(today, r.date) }));
}

export function todayPage(db, now, settings) {
  const day = dayInZone(now, settings.time_zone);
  const weekday = WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];
  return {
    day,
    weekday: weekday.slice(0, 3),
    moon: moonNow(now, settings.time_zone),
    planets: linkedIn(db, weekday, 'category.planets'),
    colors: linkedIn(db, weekday, 'category.colors'),
    coming: comingUp(db, day, settings),
    week: thisWeek(db, day),
    reminders: reminders(db, day),
    journal: journalOnDay(db, day),
  };
}

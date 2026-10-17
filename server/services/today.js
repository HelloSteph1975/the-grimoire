import { dayInZone, moonNow } from './sky.js';
import { calendarItems, addDays, daysBetween, MAX_RANGE_DAYS } from './calendar.js';

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

// The next few feasts and own dates (no moon phases) from tomorrow, up to a year ahead.
function comingUp(db, today, settings) {
  const out = [];
  const last = addDays(today, LOOK_AHEAD_DAYS);
  for (let from = addDays(today, 1); from <= last && out.length < COMING; from = addDays(from, MAX_RANGE_DAYS + 1)) {
    const to = [addDays(from, MAX_RANGE_DAYS), last].sort()[0];
    for (const item of calendarItems(db, { from, to }, settings, { moon: false })) {
      out.push({ ...item, days_away: daysBetween(today, item.day) });
      if (out.length === COMING) break;
    }
  }
  return out;
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
  };
}

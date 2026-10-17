import { MoonPhase, Illumination, Body, SearchMoonQuarter, NextMoonQuarter, Seasons } from 'astronomy-engine';

const QUARTERS = ['new', 'first-quarter', 'full', 'last-quarter'];
const DAY_MS = 86400000;

const formatters = new Map();
function formatter(zone) {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(zone, f);
  }
  return f;
}

// The calendar day ('YYYY-MM-DD') this instant falls on in the zone.
export function dayInZone(date, zone) {
  return formatter(zone).format(date);
}

const clockFormatters = new Map();
function clock(zone) {
  let f = clockFormatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    clockFormatters.set(zone, f);
  }
  return f;
}

// How far the zone's wall clock is ahead of UTC at this instant, in ms.
function zoneOffset(ms, zone) {
  const p = Object.fromEntries(clock(zone).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

// The instant the zone's wall clock shows this day and time ('HH:MM'). In the hour a clock change
// skips, it lands an hour off, which is close enough for the sky.
function wallInZone(day, time, zone) {
  const wall = Date.parse(`${day}T${time}:00Z`);
  let ms = wall - zoneOffset(wall, zone);
  ms = wall - zoneOffset(ms, zone);
  return new Date(ms);
}

// The instant of 12:00 on this day in the zone. Noon is never skipped by a clock change.
const noonInZone = (day, zone) => wallInZone(day, '12:00', zone);

// The phase for a whole day in the zone. A main phase (new, first quarter, full, last quarter)
// names only the day it falls on. Any other day is named by the side of the cycle the moon is
// on at local noon: before 90 degrees waxing crescent, before 180 waxing gibbous, before 270
// waning gibbous, then waning crescent.
export function moonPhaseOnDay(day, zone) {
  const quarter = moonQuarters(day, day, zone)[0];
  return quarter ? quarter.quarter : sideAtNoon(day, zone);
}

function sideAtNoon(day, zone) {
  const angle = MoonPhase(noonInZone(day, zone));
  if (angle < 90) return 'waxing-crescent';
  if (angle < 180) return 'waxing-gibbous';
  if (angle < 270) return 'waning-gibbous';
  return 'waning-crescent';
}

// moonPhaseOnDay for each of these days ({ day: code }), searching the quarters only once.
export function moonPhasesOnDays(days, zone) {
  if (!days.length) return {};
  const sorted = [...days].sort();
  const quarters = new Map(moonQuarters(sorted[0], sorted[sorted.length - 1], zone).map(q => [q.day, q.quarter]));
  return Object.fromEntries(days.map(day => [day, quarters.get(day) ?? sideAtNoon(day, zone)]));
}

function quarterEntry(mq, zone) {
  const date = mq.time.date;
  return { quarter: QUARTERS[mq.quarter], at: date.toISOString(), day: dayInZone(date, zone) };
}

// `code` names the zone day (see moonPhaseOnDay); `lit` and `waxing` are for this instant.
export function moonNow(now, zone) {
  const angle = MoonPhase(now);
  const lit = Math.round(Illumination(Body.Moon, now).phase_fraction * 100) / 100;
  const next = [];
  let mq = SearchMoonQuarter(now);
  for (let i = 0; i < 4; i++) {
    next.push(quarterEntry(mq, zone));
    mq = NextMoonQuarter(mq);
  }
  return { code: moonPhaseOnDay(dayInZone(now, zone), zone), angle, lit, waxing: angle < 180, next };
}

// Every quarter whose day in the zone is within fromDay..toDay, inclusive.
export function moonQuarters(fromDay, toDay, zone) {
  // Zone offsets reach 14 hours, so search a little wider and filter by zone day.
  const start = new Date(Date.parse(`${fromDay}T00:00:00Z`) - 2 * DAY_MS);
  const end = Date.parse(`${toDay}T00:00:00Z`) + 3 * DAY_MS;
  const out = [];
  let mq = SearchMoonQuarter(start);
  while (mq.time.date.getTime() < end) {
    const entry = quarterEntry(mq, zone);
    if (entry.day >= fromDay && entry.day <= toDay) out.push(entry);
    mq = NextMoonQuarter(mq);
  }
  return out;
}

export function seasonDays(year, zone) {
  const s = Seasons(year);
  return {
    'march-equinox': dayInZone(s.mar_equinox.date, zone),
    'june-solstice': dayInZone(s.jun_solstice.date, zone),
    'september-equinox': dayInZone(s.sep_equinox.date, zone),
    'december-solstice': dayInZone(s.dec_solstice.date, zone),
  };
}

// The planet that rules each weekday. Suggestions and the ritual sky snapshot both use it.
export const WEEKDAY_PLANET = { sun: 'sun', mon: 'moon', tue: 'mars', wed: 'mercury', thu: 'jupiter', fri: 'venus', sat: 'saturn' };
const WEEKDAYS = Object.keys(WEEKDAY_PLANET);

// The weekday code of a calendar day ('YYYY-MM-DD').
export const weekdayOf = day => WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()];

// The sky for a ritual: the day's phase code, the fraction lit at the time (or noon) in the zone,
// the weekday and its planet.
export function skyAt(day, time, zone) {
  const at = wallInZone(day, time || '12:00', zone);
  const lit = Math.round(Illumination(Body.Moon, at).phase_fraction * 100) / 100;
  const weekday = weekdayOf(day);
  return { moon: moonPhaseOnDay(day, zone), lit, weekday, planet: WEEKDAY_PLANET[weekday] };
}

// Calendar days as 'YYYY-MM-DD' strings and months as 'YYYY-MM'. All arithmetic runs in UTC
// so the machine's own time zone never shifts a day.

export const FIRST_DAY = '1900-01-01';
export const LAST_DAY = '2100-12-31';
export const FIRST_MONTH = '1900-01';
export const LAST_MONTH = '2100-12';

const pad = n => String(n).padStart(2, '0');
const toDate = day => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toDay = date => `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const addDays = (day, n) => {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + n);
  return toDay(date);
};

export const monthOf = day => day.slice(0, 7);

export function addMonths(month, n) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return toDay(date).slice(0, 7);
}

// A real month from 1900-01 to 2100-12.
export const validMonth = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) && v >= FIRST_MONTH && v <= LAST_MONTH;

// A real day, like 2026-02-28 but not 2026-02-30.
export const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toDay(toDate(v)) === v;

// A real day from 1900-01-01 to 2100-12-31, the years the server accepts.
export const dayInRange = v => validDay(v) && v >= FIRST_DAY && v <= LAST_DAY;

// Monday is 0 and Sunday is 6.
const weekdayIndex = day => (toDate(day).getUTCDay() + 6) % 7;

// Every day the month grid shows: Monday before the 1st through the Sunday after the last day.
export function gridDays(month) {
  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  const days = [];
  for (let day = addDays(first, -weekdayIndex(first)); day <= addDays(last, 6 - weekdayIndex(last)); day = addDays(day, 1)) days.push(day);
  return days;
}

// The range to ask the server for, kept inside the years it accepts.
export function gridRange(month) {
  const days = gridDays(month);
  const from = days[0] < FIRST_DAY ? FIRST_DAY : days[0];
  const to = days[days.length - 1] > LAST_DAY ? LAST_DAY : days[days.length - 1];
  return { from, to };
}

// Formats a day (or the 1st of a month) in the screen language, at noon UTC.
export const formatDay = (day, language, options) => new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' })
  .format(new Date(`${day.length === 7 ? `${day}-01` : day}T12:00:00Z`));

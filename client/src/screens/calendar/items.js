import { sortByName } from '../../lib/collate.js';
import { starterText } from '../correspondences/Correspondences.jsx';

// How each moon quarter is drawn.
export const QUARTER_MOON = {
  new: { lit: 0, waxing: true },
  'first-quarter': { lit: 0.5, waxing: true },
  full: { lit: 1, waxing: true },
  'last-quarter': { lit: 0.5, waxing: false },
};

export const itemName = (item, t, tc) => {
  if (item.kind === 'moon') return t(`timing.moon.${item.quarter}`);
  if (item.kind === 'own') return item.date.title;
  if (item.kind === 'ritual') return item.ritual.title;
  return starterText(tc, item.entry, 'name', item.entry.name);
};

export const itemKey = item => `${item.day}-${item.kind}-${item.quarter ?? item.entry?.id ?? item.date?.id ?? item.ritual?.id}`;

// Where an item opens.
export const itemPath = item => {
  if (item.kind === 'own') return `/calendar/dates/${item.date.id}`;
  if (item.kind === 'ritual') return `/rituals/${item.ritual.id}`;
  return `/correspondences/${item.entry.id}`;
};

// A ritual's mark is green while planned and oxblood once done or skipped.
export const markClass = item => [
  `cal-kind-${item.kind}`,
  item.kind === 'ritual' && (item.ritual.status === 'planned' ? 'cal-ritual-planned' : 'cal-ritual-past'),
].filter(Boolean).join(' ');

// Items grouped by day, in date order. In each day the moon comes first, then the rest by
// shown name.
export function byDay(items, t, tc, language) {
  const days = new Map();
  for (const item of items) {
    if (!days.has(item.day)) days.set(item.day, { moon: [], marks: [] });
    days.get(item.day)[item.kind === 'moon' ? 'moon' : 'marks'].push(item);
  }
  // sortByName breaks ties by id; give each item one so equal names keep a fixed order.
  const named = list => sortByName(list.map((item, i) => ({ item, id: i })), r => itemName(r.item, t, tc), language).map(r => r.item);
  return new Map([...days.keys()].sort().map(day => [day, { moon: days.get(day).moon, marks: named(days.get(day).marks) }]));
}

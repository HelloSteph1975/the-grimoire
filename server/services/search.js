import { listSpells } from './spells.js';
import { listEntries, fold } from './correspondences.js';
import { searchRituals } from './rituals.js';
import { searchOwnDates } from './ownDates.js';
import { matchJournal } from './journal.js';
import { invalid, collector } from './fields.js';

export const MIN_QUERY = 2;
export const MAX_QUERY = 200;
const SMALL = 20;
const BIG = 50;

const group = (all, cap, pick) => ({ total: all.length, items: all.slice(0, cap).map(pick) });

// One search over every section, with the same matching each section's own list uses.
// Each group has the full count and the first few items.
export function searchAll(db, dataDir, q) {
  const text = typeof q === 'string' ? q.trim() : '';
  if (text.length < MIN_QUERY || text.length > MAX_QUERY) {
    const c = collector();
    if (text.length < MIN_QUERY) c.fail('q', `Type at least ${MIN_QUERY} characters`, 'too_short', { min: MIN_QUERY });
    else c.fail('q', `Keep it to ${MAX_QUERY} characters or fewer`, 'too_long', { max: MAX_QUERY });
    throw invalid(c.errors, c.codes);
  }
  const needle = fold(text);
  return {
    q: text,
    groups: {
      spells: group(listSpells(db, { q: text }), SMALL, ({ id, title, purpose }) => ({ id, title, purpose })),
      correspondences: group(listEntries(db, dataDir, { q: text }), SMALL,
        ({ id, name, summary, category_id, is_starter, starter_key }) => ({ id, name, summary, category_id, is_starter, starter_key })),
      rituals: group(searchRituals(db, needle), BIG, r => r),
      journal: group(matchJournal(db, needle), SMALL, ({ id, date, time, title, excerpt, kind_id }) => ({ id, date, time, title, excerpt, kind_id })),
      dates: group(searchOwnDates(db, needle), BIG, d => d),
    },
  };
}

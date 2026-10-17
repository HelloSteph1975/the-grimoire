import { createRepo } from './repo.js';

const cache = new WeakMap();

// One repo per table, cached per database handle (a restore opens a new handle).
export function repos(db) {
  let r = cache.get(db);
  if (!r) {
    r = {
      traditions: createRepo(db, 'traditions', ['name', 'description', 'color', 'sort_order', 'starter_key', 'is_starter', 'content_version'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
      categories: createRepo(db, 'categories', ['name', 'icon', 'sort_order', 'starter_key', 'is_starter', 'content_version'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
      spellKinds: createRepo(db, 'spell_kinds', ['name', 'sort_order', 'starter_key', 'is_starter', 'content_version'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
      journalKinds: createRepo(db, 'journal_kinds', ['name', 'sort_order', 'starter_key', 'is_starter', 'content_version'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
      journal: createRepo(db, 'journal_entries', ['date', 'time', 'kind_id', 'title', 'text', 'sky'], { orderBy: 'date DESC, id DESC' }),
      spells: createRepo(db, 'spells', ['title', 'purpose', 'kind_id', 'notes', 'source'], { orderBy: 'title COLLATE NOCASE, id' }),
      ownDates: createRepo(db, 'own_dates', ['title', 'date', 'yearly', 'notes'], { orderBy: 'date, title COLLATE NOCASE, id' }),
      rituals: createRepo(db, 'rituals',
        ['title', 'spell_id', 'date', 'time', 'reminder_days', 'plan_notes', 'status', 'changes', 'outcome', 'rating', 'sky'],
        { orderBy: 'date, time, id' }),
      followups: createRepo(db, 'ritual_followups', ['ritual_id', 'date', 'text'], { orderBy: 'date, id' }),
      correspondences: createRepo(db, 'correspondences',
        ['category_id', 'name', 'summary', 'body', 'keywords', 'feast_day', 'show_on_calendar', 'starter_key', 'is_starter', 'content_version'],
        { orderBy: 'name COLLATE NOCASE, id' }),
    };
    cache.set(db, r);
  }
  return r;
}

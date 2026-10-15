import { createRepo } from './repo.js';

const cache = new WeakMap();

// One repo per table, cached per database handle (a restore opens a new handle).
export function repos(db) {
  let r = cache.get(db);
  if (!r) {
    r = {
      traditions: createRepo(db, 'traditions', ['name', 'description', 'color', 'sort_order', 'starter_key', 'is_starter'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
    };
    cache.set(db, r);
  }
  return r;
}

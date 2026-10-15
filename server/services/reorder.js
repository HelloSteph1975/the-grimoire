import { HttpError } from '../http.js';
import { transaction } from '../db/connection.js';
import { NOW } from '../db/migrations.js';

const CONFLICT = () => new HttpError(409, 'The list changed in another window.', undefined, { code: 'reorder_conflict' });

// Checks the request body for a reorder and returns its items.
export function reorderItems(body) {
  const items = body?.items;
  const ok = Array.isArray(items) && items.length >= 1 && items.length <= 1000
    && items.every(it => it && typeof it === 'object' && Number.isInteger(it.id) && it.id >= 1 && Number.isInteger(it.version) && it.version >= 1);
  if (!ok) throw new HttpError(400, 'Please fix the highlighted fields.', undefined, { code: 'invalid' });
  return items.map(it => ({ id: it.id, version: it.version }));
}

// Gives `table`'s live rows the order of `items`. All or nothing: the list must be exactly
// the live rows, each at the version the caller saw.
export function reorder(db, table, items) {
  return transaction(db, () => {
    const live = db.prepare(`SELECT id, version, sort_order FROM ${table} WHERE deleted_at IS NULL`).all();
    if (live.length !== items.length) throw CONFLICT();
    const byId = new Map(live.map(r => [r.id, r]));
    const seen = new Set();
    for (const it of items) {
      const row = byId.get(it.id);
      if (!row || row.version !== it.version || seen.has(it.id)) throw CONFLICT();
      seen.add(it.id);
    }
    const up = db.prepare(`UPDATE ${table} SET sort_order = ?, version = version + 1, updated_at = ${NOW} WHERE id = ?`);
    items.forEach((it, i) => { const order = (i + 1) * 10; if (byId.get(it.id).sort_order !== order) up.run(order, it.id); });
  });
}

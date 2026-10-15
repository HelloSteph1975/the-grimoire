import fs from 'node:fs';
import path from 'node:path';
import { transaction } from '../db/connection.js';

const CONTENT = path.join(import.meta.dirname, '..', 'content');

// Later stages add their own sets (categories, correspondences, calendar dates).
export const STARTER_SETS = [
  { table: 'traditions', file: 'traditions.json', columns: ['name', 'description', 'color', 'sort_order'] },
];

// Adds starter entries that have never been in this database. Never touches an entry
// that exists (edited or in the Trash) or that the owner deleted forever.
export function seedStarter(db, sets = STARTER_SETS) {
  return transaction(db, () => {
    let added = 0;
    const removed = db.prepare('SELECT 1 FROM starter_removed WHERE starter_key = ?');
    for (const set of sets) {
      const entries = JSON.parse(fs.readFileSync(path.join(CONTENT, set.file), 'utf8'));
      const exists = db.prepare(`SELECT 1 FROM ${set.table} WHERE starter_key = ?`);
      const cols = [...set.columns, 'starter_key', 'is_starter'];
      const insert = db.prepare(`INSERT INTO ${set.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const e of entries) {
        if (exists.get(e.starter_key) || removed.get(e.starter_key)) continue;
        insert.run(...set.columns.map(c => e[c] ?? null), e.starter_key, 1);
        added++;
      }
    }
    return added;
  });
}

import { transaction } from '../db/connection.js';
import { createRepo } from '../db/repo.js';
import { notFound, notInTrash } from '../http.js';

// A kind's name and order, the same for every kind of record (spell kinds, journal kinds).
export const KIND_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  sort_order: { type: 'int', min: 0, max: 10000 },
};

// The mechanics shared by every kind table. `ownerTable.ownerColumn` points at the kind, and
// `bump(db, ids)` raises the version of the live owners that use these kinds, because the kind
// they show changed (going to the Trash, coming back, or being deleted forever).
export function kindService({ table, ownerTable, ownerColumn, bump }) {
  const repo = db => createRepo(db, table, []);
  return {
    usage(db, id) {
      if (!db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND deleted_at IS NULL`).get(id)) throw notFound();
      return { n: db.prepare(`SELECT count(*) AS n FROM ${ownerTable} WHERE ${ownerColumn} = ? AND deleted_at IS NULL`).get(id).n };
    },
    remove(db, id) {
      transaction(db, () => {
        if (!repo(db).remove(id)) throw notFound();
        bump(db, [id]);
      });
    },
    restore(db, id) {
      return transaction(db, () => {
        if (!repo(db).restore(id)) throw notInTrash();
        bump(db, [id]);
        return repo(db).get(id);
      });
    },
    // Runs inside the caller's transaction. The foreign key clears the owners' kind.
    purge(db, row) {
      bump(db, [row.id]);
      if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
      repo(db).purge(row.id);
    },
  };
}

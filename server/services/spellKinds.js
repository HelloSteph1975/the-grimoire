import { transaction } from '../db/connection.js';
import { repos } from '../db/repos.js';
import { notFound, notInTrash } from '../http.js';
import { bumpSpellsUsing } from './spellLinks.js';

export function kindUsage(db, id) {
  if (!db.prepare('SELECT 1 FROM spell_kinds WHERE id = ? AND deleted_at IS NULL').get(id)) throw notFound();
  return { spells: db.prepare('SELECT count(*) AS n FROM spells WHERE kind_id = ? AND deleted_at IS NULL').get(id).n };
}

// Spells that use the kind get a new version, because the kind they show changed.
export function deleteKind(db, id) {
  transaction(db, () => {
    if (!repos(db).spellKinds.remove(id)) throw notFound();
    bumpSpellsUsing(db, { kinds: [id] });
  });
}

export function restoreKind(db, id) {
  return transaction(db, () => {
    if (!repos(db).spellKinds.restore(id)) throw notInTrash();
    bumpSpellsUsing(db, { kinds: [id] });
    return repos(db).spellKinds.get(id);
  });
}

// Runs inside the caller's transaction. The foreign key clears kind_id on the spells.
export function purgeKind(db, row) {
  bumpSpellsUsing(db, { kinds: [row.id] });
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
  repos(db).spellKinds.purge(row.id);
}

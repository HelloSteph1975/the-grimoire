import { transaction } from '../db/connection.js';
import { NOW } from '../db/migrations.js';
import { repos } from '../db/repos.js';
import { notFound, notInTrash } from '../http.js';
import { bumpSpellsUsing } from './spellLinks.js';

// Live entries joined to the tradition get a new version, because the traditions they show changed.
function bumpJoined(db, id) {
  bumpSpellsUsing(db, { traditions: [id] });
  db.prepare(`UPDATE correspondences SET version = version + 1, updated_at = ${NOW}
  WHERE deleted_at IS NULL AND id IN (SELECT correspondence_id FROM correspondence_traditions WHERE tradition_id = ?)`).run(id);
}

export function deleteTradition(db, id) {
  transaction(db, () => {
    if (!repos(db).traditions.remove(id)) throw notFound();
    bumpJoined(db, id);
  });
}

export function restoreTradition(db, id) {
  return transaction(db, () => {
    if (!repos(db).traditions.restore(id)) throw notInTrash();
    bumpJoined(db, id);
    return repos(db).traditions.get(id);
  });
}

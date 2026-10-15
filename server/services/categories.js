import { transaction } from '../db/connection.js';
import { HttpError, notFound } from '../http.js';
import { NOW } from '../db/migrations.js';

export const notInTrash = () => new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });

export function categoryUsage(db, id) {
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ? AND deleted_at IS NULL').get(id)) throw notFound();
  return { entries: db.prepare('SELECT count(*) AS n FROM correspondences WHERE category_id = ? AND deleted_at IS NULL').get(id).n };
}

// The category and its live entries go to the Trash together, with one deleted time.
export function deleteCategory(db, id, stamp = new Date().toISOString()) {
  return transaction(db, () => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!cat) throw notFound();
    db.prepare('UPDATE correspondences SET deleted_at = ?, version = version + 1 WHERE category_id = ? AND deleted_at IS NULL').run(stamp, id);
    db.prepare('UPDATE categories SET deleted_at = ?, version = version + 1 WHERE id = ?').run(stamp, id);
  });
}

// Brings back the category and only the entries that went to the Trash with it.
export function restoreCategory(db, id) {
  return transaction(db, () => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NOT NULL').get(id);
    if (!cat) throw notInTrash();
    db.prepare(`UPDATE correspondences SET deleted_at = NULL, version = version + 1, updated_at = ${NOW} WHERE category_id = ? AND deleted_at = ?`).run(id, cat.deleted_at);
    db.prepare(`UPDATE categories SET deleted_at = NULL, version = version + 1, updated_at = ${NOW} WHERE id = ?`).run(id);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  });
}

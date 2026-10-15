import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { HttpError } from '../http.js';
import { backupNow, rotateQuietly } from './backup.js';
import { restoreCategory } from './categories.js';
import { restoreEntry, purgeEntry } from './correspondences.js';

function recordRemoved(db, row) {
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
}

function purgeRow(db, repo, row) {
  recordRemoved(db, row);
  repo.purge(row.id);
}

// A category takes every entry it holds with it (they are all in the Trash, since a category
// can't be deleted without them). Entries go first so no foreign key is left pointing at it.
function purgeCategory(db, row) {
  for (const entry of db.prepare('SELECT * FROM correspondences WHERE category_id = ?').all(row.id)) purgeEntry(db, entry);
  purgeRow(db, repos(db).categories, row);
}

// Every kind of record that can be in the Trash. Later stages add theirs here.
// Emptying the Trash goes in this order, so entries are purged before their categories.
export const TRASH_TYPES = {
  tradition: { repo: db => repos(db).traditions, title: row => row.name },
  correspondence: { repo: db => repos(db).correspondences, title: row => row.name, restore: restoreEntry, purge: purgeEntry },
  category: { repo: db => repos(db).categories, title: row => row.name, restore: restoreCategory, purge: purgeCategory },
};

function typeOf(type) {
  if (!Object.hasOwn(TRASH_TYPES, type)) throw new HttpError(404, 'Unknown kind of record', undefined, { code: 'unknown_kind' });
  return TRASH_TYPES[type];
}

const notInTrash = () => new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });

// Entries that went to the Trash with their category (same deleted time) are not listed on
// their own; the category row counts them in `extra`.
export function listTrash(db) {
  const rows = Object.entries(TRASH_TYPES).flatMap(([type, t]) => t.repo(db).listDeleted().map(row => ({ type, t, row })));
  const categoryStamp = new Map(rows.filter(r => r.type === 'category').map(r => [r.row.id, r.row.deleted_at]));
  const extra = new Map();
  const out = [];
  for (const { type, t, row } of rows) {
    if (type === 'correspondence' && categoryStamp.get(row.category_id) === row.deleted_at) {
      extra.set(row.category_id, (extra.get(row.category_id) ?? 0) + 1);
      continue;
    }
    out.push({ type, id: row.id, title: t.title(row), deleted_at: row.deleted_at });
  }
  for (const item of out) if (item.type === 'category') item.extra = extra.get(item.id) ?? 0;
  return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at) || b.id - a.id);
}

export function restoreFromTrash(db, type, id) {
  const t = typeOf(type);
  if (t.restore) return t.restore(db, id);
  const ok = transaction(db, () => t.repo(db).restore(id));
  if (!ok) throw notInTrash();
  return t.repo(db).get(id);
}

function purge(db, t, row) {
  if (t.purge) t.purge(db, row);
  else purgeRow(db, t.repo(db), row);
}

export function deleteForever(db, type, id) {
  const t = typeOf(type);
  transaction(db, () => {
    const row = t.repo(db).get(id, { includeDeleted: true });
    if (!row || !row.deleted_at) throw notInTrash();
    purge(db, t, row);
  });
  return true;
}

export function emptyTrash(ctx, { discard } = {}) {
  const { name } = backupNow(ctx.db, ctx.config.dataDir, { kind: 'pre-empty' });
  const removed = transaction(ctx.db, () => {
    let n = 0;
    for (const t of Object.values(TRASH_TYPES)) {
      for (const row of t.repo(ctx.db).listDeleted()) { purge(ctx.db, t, row); n++; }
    }
    return n;
  });
  rotateQuietly(ctx.config.dataDir, discard);
  return { removed, backup: name };
}

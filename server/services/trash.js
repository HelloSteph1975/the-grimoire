import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { HttpError, notInTrash } from '../http.js';
import { backupNow, rotateQuietly } from './backup.js';
import { restoreCategory } from './categories.js';
import { restoreTradition } from './traditions.js';
import { restoreKind, purgeKind } from './spellKinds.js';
import { restoreEntry, purgeEntry } from './correspondences.js';

function recordRemoved(db, row) {
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
}

function purgeRow(db, repo, row) {
  recordRemoved(db, row);
  repo.purge(row.id);
}

// A category takes every entry of it in the Trash with it: the ones deleted with it and the ones
// deleted earlier on their own (the Trash list tells the owner both counts). Entries go first so no
// foreign key is left pointing at the category. A live entry here would mean broken data, so stop.
function purgeCategory(db, row) {
  const live = db.prepare('SELECT count(*) AS n FROM correspondences WHERE category_id = ? AND deleted_at IS NULL').get(row.id).n;
  if (live) throw new Error(`Category ${row.id} is in the Trash but still has ${live} live entries`);
  for (const entry of db.prepare('SELECT * FROM correspondences WHERE category_id = ? AND deleted_at IS NOT NULL').all(row.id)) purgeEntry(db, entry);
  purgeRow(db, repos(db).categories, row);
}

// Every kind of record that can be in the Trash. Later stages add theirs here.
// Emptying the Trash goes in this order, so spells go before the kinds and entries they use, and
// entries before their categories. A spell's lines, steps, timing and joins go with it (foreign keys).
export const TRASH_TYPES = {
  spell: { repo: db => repos(db).spells, title: row => row.title },
  date: { repo: db => repos(db).ownDates, title: row => row.title },
  tradition: { repo: db => repos(db).traditions, title: row => row.name, restore: restoreTradition },
  correspondence: { repo: db => repos(db).correspondences, title: row => row.name, restore: restoreEntry, purge: purgeEntry },
  category: { repo: db => repos(db).categories, title: row => row.name, restore: restoreCategory, purge: purgeCategory },
  kind: { repo: db => repos(db).spellKinds, title: row => row.name, restore: restoreKind, purge: purgeKind },
};

function typeOf(type) {
  if (!Object.hasOwn(TRASH_TYPES, type)) throw new HttpError(404, 'Unknown kind of record', undefined, { code: 'unknown_kind' });
  return TRASH_TYPES[type];
}

// Entries that went to the Trash with their category (same deleted time) are not listed on
// their own; the category row counts them in `extra`, and the entries of it deleted earlier on
// their own in `earlier`. Those earlier entries get `categoryInTrash: true`.
export function listTrash(db) {
  const rows = Object.entries(TRASH_TYPES).flatMap(([type, t]) => t.repo(db).listDeleted().map(row => ({ type, t, row })));
  const categoryStamp = new Map(rows.filter(r => r.type === 'category').map(r => [r.row.id, r.row.deleted_at]));
  const extra = new Map();
  const out = [];
  const earlier = new Map();
  const add = (map, id) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const { type, t, row } of rows) {
    const item = { type, id: row.id, title: t.title(row), deleted_at: row.deleted_at, starter_key: row.is_starter ? row.starter_key ?? null : null };
    if (type === 'correspondence' && categoryStamp.has(row.category_id)) {
      if (categoryStamp.get(row.category_id) === row.deleted_at) { add(extra, row.category_id); continue; }
      add(earlier, row.category_id);
      item.categoryInTrash = true;
    }
    out.push(item);
  }
  for (const item of out) if (item.type === 'category') Object.assign(item, { extra: extra.get(item.id) ?? 0, earlier: earlier.get(item.id) ?? 0 });
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
    // Counts the rows the owner saw in the Trash list, not the entries grouped under a category.
    const n = listTrash(ctx.db).length;
    for (const t of Object.values(TRASH_TYPES)) {
      for (const row of t.repo(ctx.db).listDeleted()) purge(ctx.db, t, row);
    }
    return n;
  });
  rotateQuietly(ctx.config.dataDir, discard);
  return { removed, backup: name };
}

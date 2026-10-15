import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { HttpError } from '../http.js';
import { backupNow, rotateQuietly } from './backup.js';

// Every kind of record that can be in the Trash. Later stages add theirs here.
export const TRASH_TYPES = {
  tradition: { repo: db => repos(db).traditions, title: row => row.name },
};

function typeOf(type) {
  if (!Object.hasOwn(TRASH_TYPES, type)) throw new HttpError(404, 'Unknown kind of record', undefined, { code: 'unknown_kind' });
  return TRASH_TYPES[type];
}

export function listTrash(db) {
  return Object.entries(TRASH_TYPES)
    .flatMap(([type, t]) => t.repo(db).listDeleted().map(row => ({ type, id: row.id, title: t.title(row), deleted_at: row.deleted_at })))
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at) || b.id - a.id);
}

export function restoreFromTrash(db, type, id) {
  const t = typeOf(type);
  const ok = transaction(db, () => t.repo(db).restore(id));
  if (!ok) throw new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });
  return t.repo(db).get(id);
}

function purgeRow(db, repo, row) {
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
  repo.purge(row.id);
}

export function deleteForever(db, type, id) {
  const t = typeOf(type);
  transaction(db, () => {
    const row = t.repo(db).get(id, { includeDeleted: true });
    if (!row || !row.deleted_at) throw new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });
    purgeRow(db, t.repo(db), row);
  });
  return true;
}

export function emptyTrash(ctx, { discard } = {}) {
  const { name } = backupNow(ctx.db, ctx.config.dataDir, { kind: 'pre-empty' });
  const removed = transaction(ctx.db, () => {
    let n = 0;
    for (const t of Object.values(TRASH_TYPES)) {
      const repo = t.repo(ctx.db);
      for (const row of repo.listDeleted()) { purgeRow(ctx.db, repo, row); n++; }
    }
    return n;
  });
  rotateQuietly(ctx.config.dataDir, discard);
  return { removed, backup: name };
}

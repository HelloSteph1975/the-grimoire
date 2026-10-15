import { NOW } from './migrations.js';

const bind = v => (typeof v === 'boolean' ? Number(v) : v);

export class VersionConflict extends Error {
  constructor(current) {
    super('This was changed somewhere else.');
    this.current = current;
  }
}

export function createRepo(db, table, columns, { orderBy = 'id' } = {}) {
  const pickKeys = data => columns.filter(k => data[k] !== undefined);

  function get(id, { includeDeleted = false } = {}) {
    const sql = `SELECT * FROM ${table} WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`;
    return db.prepare(sql).get(id) ?? null;
  }

  return {
    table,
    get,
    list() {
      return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL ORDER BY ${orderBy}`).all();
    },
    listDeleted() {
      return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`).all();
    },
    create(data) {
      const keys = pickKeys(data);
      const sql = keys.length
        ? `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
        : `INSERT INTO ${table} DEFAULT VALUES`;
      const r = db.prepare(sql).run(...keys.map(k => bind(data[k])));
      return get(Number(r.lastInsertRowid));
    },
    // Saves only if the row is still at `version`. Returns the saved row, or null if it is gone.
    update(id, data, version) {
      if (!Number.isInteger(version)) throw new TypeError(`update(${table}) needs the version the row was read at`);
      const keys = pickKeys(data);
      const sets = [...keys.map(k => `${k} = ?`), 'version = version + 1', `updated_at = ${NOW}`];
      const r = db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .run(...keys.map(k => bind(data[k])), id, version);
      if (r.changes === 0) {
        const current = get(id);
        if (!current) return null;
        throw new VersionConflict(current);
      }
      return get(id);
    },
    remove(id, stamp = new Date().toISOString()) {
      return db.prepare(`UPDATE ${table} SET deleted_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL`).run(stamp, id).changes > 0;
    },
    restore(id) {
      return db.prepare(`UPDATE ${table} SET deleted_at = NULL, version = version + 1, updated_at = ${NOW} WHERE id = ? AND deleted_at IS NOT NULL`).run(id).changes > 0;
    },
    purge(id) {
      return db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id).changes > 0;
    },
  };
}

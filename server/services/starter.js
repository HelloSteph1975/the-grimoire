import fs from 'node:fs';
import path from 'node:path';
import { transaction } from '../db/connection.js';
import { NOW } from '../db/migrations.js';

export const CONTENT_DIR = path.join(import.meta.dirname, '..', 'content');

const readJson = (dir, rel) => {
  const file = path.join(dir, rel);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
};

const entryFiles = dir => {
  const folder = path.join(dir, 'correspondences');
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(f => f.endsWith('.json')).sort().flatMap(f => readJson(dir, `correspondences/${f}`));
};

// Prepared once per table and handle.
const prepared = new WeakMap();
function stmt(db, sql) {
  let m = prepared.get(db);
  if (!m) prepared.set(db, (m = new Map()));
  if (!m.has(sql)) m.set(sql, db.prepare(sql));
  return m.get(sql);
}

const idOf = (db, table, key) => stmt(db, `SELECT id FROM ${table} WHERE starter_key = ?`).get(key)?.id;

// Seeds one simple table (traditions, categories). Returns how many rows were added.
function seedSimple(db, table, columns, rows) {
  const removed = db.prepare('SELECT 1 FROM starter_removed WHERE starter_key = ?');
  const cols = [...columns, 'starter_key', 'is_starter', 'content_version'];
  const insert = db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
  let added = 0;
  for (const e of rows) {
    if (idOf(db, table, e.starter_key) || removed.get(e.starter_key)) continue;
    insert.run(...columns.map(c => e[c] ?? null), e.starter_key, 1, e.content_version ?? 1);
    added++;
  }
  return added;
}

const seedTraditions = (db, dir) => seedSimple(db, 'traditions', ['name', 'description', 'color', 'sort_order'], readJson(dir, 'traditions.json'));
const seedCategories = (db, dir) => seedSimple(db, 'categories', ['name', 'icon', 'sort_order'], readJson(dir, 'categories.json'));

function setTraditions(db, corrId, keys = []) {
  db.prepare('DELETE FROM correspondence_traditions WHERE correspondence_id = ?').run(corrId);
  const add = db.prepare('INSERT OR IGNORE INTO correspondence_traditions (correspondence_id, tradition_id) VALUES (?, ?)');
  for (const key of keys) {
    const tid = idOf(db, 'traditions', key);
    if (tid) add.run(corrId, tid);
  }
}

// Adds entries that were never here. Returns the keys it inserted. An entry whose category is in
// the Trash goes in with the category's deleted time, so it restores and purges with the category.
function seedEntries(db, dir) {
  const removed = db.prepare('SELECT 1 FROM starter_removed WHERE starter_key = ?');
  const category = db.prepare('SELECT id, deleted_at FROM categories WHERE starter_key = ?');
  const insert = db.prepare(`INSERT INTO correspondences
    (category_id, name, summary, body, keywords, feast_day, starter_key, is_starter, content_version, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`);
  const inserted = new Set();
  for (const e of entryFiles(dir)) {
    if (idOf(db, 'correspondences', e.starter_key) || removed.get(e.starter_key)) continue;
    const cat = category.get(e.category);
    if (!cat) continue;
    const r = insert.run(cat.id, e.name, e.summary ?? null, e.body ?? null, JSON.stringify(e.keywords ?? []),
      e.feast_day ?? null, e.starter_key, e.content_version ?? 1, cat.deleted_at ?? null);
    setTraditions(db, Number(r.lastInsertRowid), e.traditions);
    inserted.add(e.starter_key);
  }
  return inserted;
}

// Adds a link only when one end is new in this run, so a link the owner removed stays removed.
function seedLinks(db, dir, inserted) {
  const add = db.prepare('INSERT OR IGNORE INTO correspondence_links (a_id, b_id) VALUES (?, ?)');
  let added = 0;
  for (const [ka, kb] of readJson(dir, 'links.json')) {
    if (!inserted.has(ka) && !inserted.has(kb)) continue;
    const a = idOf(db, 'correspondences', ka);
    const b = idOf(db, 'correspondences', kb);
    if (!a || !b || a === b) continue;
    added += Number(add.run(Math.min(a, b), Math.max(a, b)).changes);
  }
  return added;
}

// Copies newer file content onto rows that are still untouched starters and not in the Trash.
// sort_order is set only on insert, so the owner's order survives.
function applyUpdates(db, dir) {
  const sets = [
    ['traditions', ['name', 'description', 'color'], readJson(dir, 'traditions.json')],
    ['categories', ['name', 'icon'], readJson(dir, 'categories.json')],
  ];
  const stale = (table, e) => stmt(
    db, `SELECT id FROM ${table} WHERE starter_key = ? AND is_starter = 1 AND deleted_at IS NULL AND content_version < ?`,
  ).get(e.starter_key, e.content_version ?? 1);
  for (const [table, columns, rows] of sets) {
    for (const e of rows) {
      const row = stale(table, e);
      if (!row) continue;
      stmt(db, `UPDATE ${table} SET ${columns.map(c => `${c} = ?`).join(', ')}, content_version = ?, version = version + 1, updated_at = ${NOW} WHERE id = ?`)
        .run(...columns.map(c => e[c] ?? null), e.content_version ?? 1, row.id);
    }
  }
  const update = db.prepare(`UPDATE correspondences SET name = ?, summary = ?, body = ?, keywords = ?, feast_day = ?,
    content_version = ?, version = version + 1, updated_at = ${NOW} WHERE id = ?`);
  for (const e of entryFiles(dir)) {
    const row = stale('correspondences', e);
    if (!row) continue;
    update.run(e.name, e.summary ?? null, e.body ?? null, JSON.stringify(e.keywords ?? []), e.feast_day ?? null, e.content_version ?? 1, row.id);
    setTraditions(db, row.id, e.traditions);
  }
}

// Tops up starter content. Never re-adds anything that exists (edited or in the Trash), was
// deleted forever, or was an owner-removed link. Updates only untouched starter rows whose
// content_version went up. Returns the number of traditions, categories and entries added (links are not counted).
export function seedStarter(db, { content = CONTENT_DIR } = {}) {
  return transaction(db, () => {
    const added = seedTraditions(db, content) + seedCategories(db, content);
    const inserted = seedEntries(db, content);
    seedLinks(db, content, inserted);
    applyUpdates(db, content);
    return added + inserted.size;
  });
}

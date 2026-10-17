// Replaces the live joins of one owner row in a join table; joins to rows in the Trash are kept
// (hidden, and shown again on restore). `wanted` is the list of other-table ids the owner should
// now show. Run it inside the transaction that saves the owner.
export function setLiveJoins(db, { table, ownerCol, otherCol, otherTable }, ownerId, wanted) {
  const current = db.prepare(`SELECT j.${otherCol} AS id FROM ${table} j JOIN ${otherTable} o ON o.id = j.${otherCol}
    WHERE j.${ownerCol} = ? AND o.deleted_at IS NULL`).all(ownerId).map(r => r.id);
  const drop = db.prepare(`DELETE FROM ${table} WHERE ${ownerCol} = ? AND ${otherCol} = ?`);
  for (const id of current) if (!wanted.includes(id)) drop.run(ownerId, id);
  const add = db.prepare(`INSERT OR IGNORE INTO ${table} (${ownerCol}, ${otherCol}) VALUES (?, ?)`);
  for (const id of wanted) if (!current.includes(id)) add.run(ownerId, id);
}

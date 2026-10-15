// Editable tables use INTEGER PRIMARY KEY AUTOINCREMENT so ids are never reused.
// Every time stamp is ISO-8601 UTC with a Z (like new Date().toISOString()), so stamps compare as strings.
export const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Every editable table gets these. version goes up by one on every change.
export const TS = `version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW}), deleted_at TEXT`;

// Each entry runs once, in order. Never edit an entry after it ships; add a new one.
export const migrations = [
  // 1: settings (key/value, last save wins).
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // 2: traditions, and starter entries the owner deleted forever (so they are never seeded again).
  `
  CREATE TABLE traditions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, ${TS});
  CREATE TABLE starter_removed (starter_key TEXT PRIMARY KEY, removed_at TEXT NOT NULL DEFAULT (${NOW}));
  `,
];

export function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > migrations.length) {
    throw new Error(`This data folder was saved by a newer version of The Grimoire (database version ${current}, this app knows ${migrations.length}). Update the app; nothing was changed.`);
  }
  for (let i = current; i < migrations.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migrations[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

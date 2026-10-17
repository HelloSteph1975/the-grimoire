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
  // 3: categories, correspondences, their tradition joins and links; starter content versions for traditions.
  `
  ALTER TABLE traditions ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
  CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'star',
    sort_order INTEGER NOT NULL DEFAULT 0, starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0,
    content_version INTEGER NOT NULL DEFAULT 1, ${TS});
  CREATE TABLE correspondences (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id),
    name TEXT NOT NULL, summary TEXT, body TEXT, keywords TEXT NOT NULL DEFAULT '[]', feast_day TEXT,
    starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, content_version INTEGER NOT NULL DEFAULT 1, ${TS});
  CREATE INDEX idx_corr_category ON correspondences(category_id);
  CREATE TABLE correspondence_traditions (correspondence_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
    tradition_id INTEGER NOT NULL REFERENCES traditions(id) ON DELETE CASCADE, PRIMARY KEY (correspondence_id, tradition_id));
  CREATE TABLE correspondence_links (a_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
    b_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE, PRIMARY KEY (a_id, b_id), CHECK (a_id < b_id));
  `,
  // 4: the Book of Spells. Kinds, spells, and a spell's traditions, ingredients, steps, timing and feasts.
  `
  CREATE TABLE spell_kinds (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
    starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, content_version INTEGER NOT NULL DEFAULT 1, ${TS});
  CREATE TABLE spells (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, purpose TEXT,
    kind_id INTEGER REFERENCES spell_kinds(id) ON DELETE SET NULL, notes TEXT, source TEXT, ${TS});
  CREATE TABLE spell_traditions (spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
    tradition_id INTEGER NOT NULL REFERENCES traditions(id) ON DELETE CASCADE, PRIMARY KEY (spell_id, tradition_id));
  CREATE TABLE spell_ingredients (spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE, position INTEGER NOT NULL,
    name TEXT NOT NULL, amount TEXT, correspondence_id INTEGER REFERENCES correspondences(id) ON DELETE SET NULL,
    PRIMARY KEY (spell_id, position));
  CREATE TABLE spell_steps (spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE, position INTEGER NOT NULL,
    text TEXT NOT NULL, PRIMARY KEY (spell_id, position));
  CREATE TABLE spell_timing (spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('moon', 'day', 'planet')), code TEXT NOT NULL, PRIMARY KEY (spell_id, kind, code));
  CREATE TABLE spell_feasts (spell_id INTEGER NOT NULL REFERENCES spells(id) ON DELETE CASCADE,
    correspondence_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE, PRIMARY KEY (spell_id, correspondence_id));
  CREATE INDEX idx_spells_kind ON spells(kind_id);
  CREATE INDEX idx_spell_ingredients_corr ON spell_ingredients(correspondence_id);
  CREATE INDEX idx_spell_feasts_corr ON spell_feasts(correspondence_id);
  CREATE INDEX idx_spell_traditions_tradition ON spell_traditions(tradition_id);
  `,
  // 5: the owner's own calendar dates (with tradition joins), and a per-entry switch for showing it on the calendar.
  `
  CREATE TABLE own_dates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date TEXT NOT NULL,
    yearly INTEGER NOT NULL DEFAULT 0, notes TEXT, ${TS});
  CREATE TABLE own_date_traditions (own_date_id INTEGER NOT NULL REFERENCES own_dates(id) ON DELETE CASCADE,
    tradition_id INTEGER NOT NULL REFERENCES traditions(id) ON DELETE CASCADE, PRIMARY KEY (own_date_id, tradition_id));
  CREATE INDEX idx_own_dates_date ON own_dates(date);
  CREATE INDEX idx_own_date_traditions_tradition ON own_date_traditions(tradition_id);
  ALTER TABLE correspondences ADD COLUMN show_on_calendar INTEGER NOT NULL DEFAULT 1;
  `,
  // 6: rituals, with their traditions, supplies and follow-ups. `sky` is a saved JSON snapshot.
  `
  CREATE TABLE rituals (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL,
    spell_id INTEGER REFERENCES spells(id) ON DELETE SET NULL, date TEXT NOT NULL, time TEXT, reminder_days INTEGER,
    plan_notes TEXT, status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'done', 'skipped')),
    changes TEXT, outcome TEXT, rating INTEGER, sky TEXT, ${TS});
  CREATE TABLE ritual_traditions (ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE,
    tradition_id INTEGER NOT NULL REFERENCES traditions(id) ON DELETE CASCADE, PRIMARY KEY (ritual_id, tradition_id));
  CREATE TABLE ritual_supplies (ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE, position INTEGER NOT NULL,
    name TEXT NOT NULL, amount TEXT, checked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (ritual_id, position));
  CREATE TABLE ritual_followups (id INTEGER PRIMARY KEY AUTOINCREMENT,
    ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE, date TEXT NOT NULL, text TEXT NOT NULL, ${TS});
  CREATE INDEX idx_rituals_date ON rituals(date);
  CREATE INDEX idx_rituals_spell ON rituals(spell_id);
  CREATE INDEX idx_ritual_traditions_tradition ON ritual_traditions(tradition_id);
  CREATE INDEX idx_ritual_followups_ritual ON ritual_followups(ritual_id);
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

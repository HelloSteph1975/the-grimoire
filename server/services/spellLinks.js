import { NOW } from '../db/migrations.js';

const marks = ids => ids.map(() => '?').join(', ');

// Raises the version of every live spell that uses any of these entries (as an ingredient link or
// a feast), traditions or kinds, so a form open on the spell gets a conflict instead of saving
// without a link that just changed. Each spell is bumped once, however many ways it matches.
export function bumpSpellsUsing(db, { entries = [], traditions = [], kinds = [] } = {}) {
  const tests = [];
  const params = [];
  if (entries.length) {
    tests.push(`id IN (SELECT spell_id FROM spell_ingredients WHERE correspondence_id IN (${marks(entries)}))`,
      `id IN (SELECT spell_id FROM spell_feasts WHERE correspondence_id IN (${marks(entries)}))`);
    params.push(...entries, ...entries);
  }
  if (traditions.length) {
    tests.push(`id IN (SELECT spell_id FROM spell_traditions WHERE tradition_id IN (${marks(traditions)}))`);
    params.push(...traditions);
  }
  if (kinds.length) {
    tests.push(`kind_id IN (${marks(kinds)})`);
    params.push(...kinds);
  }
  if (!tests.length) return;
  db.prepare(`UPDATE spells SET version = version + 1, updated_at = ${NOW} WHERE deleted_at IS NULL AND (${tests.join(' OR ')})`).run(...params);
}

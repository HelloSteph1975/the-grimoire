import { NOW } from '../db/migrations.js';

const marks = ids => ids.map(() => '?').join(', ');

// Raises the version of every live ritual that uses any of these spells or traditions, so a form
// open on the ritual gets a conflict instead of saving without a link that just changed. Each
// ritual is bumped once, however many ways it matches.
export function bumpRitualsUsing(db, { spells = [], traditions = [] } = {}) {
  const tests = [];
  const params = [];
  if (spells.length) {
    tests.push(`spell_id IN (${marks(spells)})`);
    params.push(...spells);
  }
  if (traditions.length) {
    tests.push(`id IN (SELECT ritual_id FROM ritual_traditions WHERE tradition_id IN (${marks(traditions)}))`);
    params.push(...traditions);
  }
  if (!tests.length) return;
  db.prepare(`UPDATE rituals SET version = version + 1, updated_at = ${NOW} WHERE deleted_at IS NULL AND (${tests.join(' OR ')})`).run(...params);
}

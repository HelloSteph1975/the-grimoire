import { NOW } from '../db/migrations.js';
import { kindService } from './kinds.js';

// Entries that use the kind get a new version, because the kind they show changed.
const kinds = kindService({
  table: 'journal_kinds', ownerTable: 'journal_entries', ownerColumn: 'kind_id',
  bump: (db, ids) => db.prepare(`UPDATE journal_entries SET version = version + 1, updated_at = ${NOW}
    WHERE deleted_at IS NULL AND kind_id IN (${ids.map(() => '?').join(', ')})`).run(...ids),
});

export const journalKindUsage = (db, id) => ({ entries: kinds.usage(db, id).n });
export const deleteJournalKind = kinds.remove;
export const restoreJournalKind = kinds.restore;
export const purgeJournalKind = kinds.purge;

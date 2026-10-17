import { kindService } from './kinds.js';
import { bumpSpellsUsing } from './spellLinks.js';

// Spells that use the kind get a new version, because the kind they show changed.
const kinds = kindService({
  table: 'spell_kinds', ownerTable: 'spells', ownerColumn: 'kind_id',
  bump: (db, ids) => bumpSpellsUsing(db, { kinds: ids }),
});

export const kindUsage = (db, id) => ({ spells: kinds.usage(db, id).n });
export const deleteKind = kinds.remove;
export const restoreKind = kinds.restore;
export const purgeKind = kinds.purge;

import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { seedStarter } from '../services/starter.js';
import { createSpell } from '../services/spells.js';

// Sample data for the demo folder only. Later stages add their own samples here.
export function seedDemo(ctx, { reset = false } = {}) {
  const db = ctx.db;
  transaction(db, () => {
    if (reset) {
      db.exec('DELETE FROM spell_feasts; DELETE FROM spell_timing; DELETE FROM spell_steps; DELETE FROM spell_ingredients; DELETE FROM spell_traditions; DELETE FROM spells; DELETE FROM spell_kinds; DELETE FROM correspondence_links; DELETE FROM correspondence_traditions; DELETE FROM correspondences; DELETE FROM categories; DELETE FROM traditions; DELETE FROM starter_removed; DELETE FROM settings;');
    }
    const t = repos(db).traditions;
    const all = db.prepare('SELECT name FROM traditions').all().map(r => r.name);
    if (!all.includes('Kitchen witchery')) t.create({ name: 'Kitchen witchery', description: 'Magic worked at the stove and the table.', color: '#4a6440', sort_order: 4 });
    if (!all.includes('Hedge witchery')) {
      const h = t.create({ name: 'Hedge witchery', description: 'A sample entry waiting in the Trash.', color: '#5b4430', sort_order: 5 });
      t.remove(h.id);
    }
  });
  seedStarter(db, ctx.config?.contentDir ? { content: ctx.config.contentDir } : undefined);
  seedSpells(db);
}

const SAMPLE_SPELLS = [
  {
    title: 'A candle for a calm home', kind: 'spell-kind.blessing',
    purpose: 'To settle the house at the end of a busy week.',
    ingredients: [
      { name: 'White candle', amount: '1' },
      { name: 'Matches', amount: '1' },
      { name: 'Small dish of salt', amount: '1 pinch' },
    ],
    steps: [
      'Tidy the room and set the candle on the table with the dish of salt beside it.',
      'Light the candle and say what you would like the house to feel like.',
      'Sit quietly until you feel ready, then snuff the candle out.',
    ],
    timing: { day: ['mon'], moon: ['full'] },
  },
  {
    title: 'Doorway sweep', kind: 'spell-kind.cleansing',
    purpose: 'To clear the front step before guests arrive.',
    ingredients: [
      { name: 'Broom', amount: '1' },
      { name: 'Bowl of water', amount: '1' },
    ],
    steps: [
      'Sweep from the inside of the door toward the step, one slow stroke at a time.',
      'Sprinkle a little water over the threshold and open the door to let the air in.',
    ],
  },
];

// Two sample spells, added once (matched by title). A kind that is missing is simply left off.
function seedSpells(db) {
  const have = new Set(db.prepare('SELECT title FROM spells').all().map(r => r.title));
  const kindOf = key => db.prepare('SELECT id FROM spell_kinds WHERE starter_key = ? AND deleted_at IS NULL').get(key)?.id;
  for (const { kind, ...spell } of SAMPLE_SPELLS) {
    if (have.has(spell.title)) continue;
    const kind_id = kindOf(kind);
    createSpell(db, kind_id ? { ...spell, kind_id } : spell);
  }
}

import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { seedStarter } from '../services/starter.js';
import { createSpell } from '../services/spells.js';
import { createOwnDate } from '../services/ownDates.js';
import { createRitual } from '../services/rituals.js';
import { createFollowup } from '../services/followups.js';
import { createJournal } from '../services/journal.js';
import { suggestDays } from '../services/suggestions.js';
import { addDays } from '../services/calendar.js';
import { getSettings } from '../services/settings.js';
import { dayInZone } from '../services/sky.js';

// Sample data for the demo folder only. Later stages add their own samples here.
export function seedDemo(ctx, { reset = false } = {}) {
  const db = ctx.db;
  transaction(db, () => {
    if (reset) {
      db.exec('DELETE FROM journal_cards; DELETE FROM journal_entry_tags; DELETE FROM journal_entries; DELETE FROM journal_kinds; DELETE FROM ritual_followups; DELETE FROM ritual_supplies; DELETE FROM ritual_traditions; DELETE FROM rituals; DELETE FROM spell_feasts; DELETE FROM spell_timing; DELETE FROM spell_steps; DELETE FROM spell_ingredients; DELETE FROM spell_traditions; DELETE FROM spells; DELETE FROM spell_kinds; DELETE FROM correspondence_links; DELETE FROM correspondence_traditions; DELETE FROM correspondences; DELETE FROM categories; DELETE FROM own_date_traditions; DELETE FROM own_dates; DELETE FROM traditions; DELETE FROM starter_removed; DELETE FROM settings;');
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
  seedOwnDates(db);
  seedRituals(db, ctx.now ? ctx.now() : new Date());
  seedJournal(db, ctx.now ? ctx.now() : new Date());
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

// Two sample dates, added once (matched by title): a yearly one on November 2 in this year, and a
// one-time one in the middle of next month.
function seedOwnDates(db, now = new Date()) {
  const have = new Set(db.prepare('SELECT title FROM own_dates').all().map(r => r.title));
  const y = now.getFullYear();
  const next = new Date(y, now.getMonth() + 1, 15);
  const pad = n => String(n).padStart(2, '0');
  const samples = [
    { title: 'Light a candle for the ancestors', date: `${y}-11-02`, yearly: true, notes: 'Set a small candle in the window at dusk and say their names.' },
    { title: 'Visit the old orchard', date: `${next.getFullYear()}-${pad(next.getMonth() + 1)}-15`, yearly: false, notes: 'Bring a basket and a thermos of tea.' },
  ];
  for (const sample of samples) if (!have.has(sample.title)) createOwnDate(db, sample);
}

// Two sample rituals from the calm-home spell, added once (matched by title): one planned on its
// next suggested day, and one done a week ago with a rating and a follow-up.
function seedRituals(db, now) {
  const spell = db.prepare("SELECT id FROM spells WHERE title = 'A candle for a calm home' AND deleted_at IS NULL").get();
  if (!spell) return;
  const have = new Set(db.prepare('SELECT title FROM rituals').all().map(r => r.title));
  const settings = getSettings(db);
  const today = dayInZone(now, settings.time_zone);
  const supplies = [
    { name: 'White candle', amount: '1' },
    { name: 'Matches', amount: '1' },
    { name: 'Small dish of salt', amount: '1 pinch' },
  ];
  const planned = 'Calm home candle';
  if (!have.has(planned)) {
    const next = suggestDays(db, spell.id, addDays(today, 1), settings).map(s => s.day).sort()[0];
    if (next) {
      createRitual(db, {
        title: planned, spell_id: spell.id, date: next, time: '19:30', reminder_days: 1, status: 'planned',
        plan_notes: 'Tidy the front room first and open a window while the candle burns.',
        supplies,
      });
    }
  }
  const done = 'Calm home candle, last week';
  if (!have.has(done)) {
    const ritual = createRitual(db, {
      title: done, spell_id: spell.id, date: addDays(today, -7), time: '20:00', status: 'done', rating: 4,
      changes: 'I used a green candle because the white one had burned down.',
      outcome: 'The house felt quiet afterwards, and we had tea at the table.',
      supplies: supplies.map(s => ({ ...s, checked: true })),
    });
    createFollowup(db, { ritual_id: ritual.id, date: addDays(today, -4), text: 'Still tidy by the door. I will light it again next week.' });
  }
}

// Three sample journal entries, added once (matched by title): a dream from two days ago, a tarot
// pull from yesterday and a sign from today. A kind that is missing is simply left off.
function seedJournal(db, now) {
  const have = new Set(db.prepare('SELECT title FROM journal_entries').all().map(r => r.title));
  const today = dayInZone(now, getSettings(db).time_zone);
  const kindOf = key => db.prepare('SELECT id FROM journal_kinds WHERE starter_key = ? AND deleted_at IS NULL').get(key)?.id;
  const samples = [
    {
      key: 'journal-kind.dream', date: addDays(today, -2), time: '07:10', title: 'The house with the open windows',
      text: 'I walked through a house I did not know, and every window was open. The curtains were moving and I could hear water running somewhere below.\n\nI woke up feeling calm and a little curious.',
      tags: ['water', 'house'],
    },
    {
      key: 'journal-kind.tarot', date: addDays(today, -1), time: '20:15', title: 'Three cards for the week',
      text: 'A simple pull to set the tone for the days ahead. The reversed card made me smile, because it is the one I keep meaning to deal with.',
      tags: ['weekly pull'],
      cards: [
        { name: 'The Star', position: 'The week ahead', reversed: false },
        { name: 'Six of Cups', position: 'What to keep', reversed: false },
        { name: 'Four of Swords', position: 'What to ease up on', reversed: true },
      ],
    },
    {
      key: 'journal-kind.sign', date: today, time: '09:00', title: 'A heron on the garden wall',
      text: 'A grey heron stood on the wall for a full minute this morning, then lifted off without a sound. I took it as a nudge to slow down and notice things today.',
      tags: ['birds'],
    },
  ];
  for (const { key, ...entry } of samples) {
    if (have.has(entry.title)) continue;
    const kind_id = kindOf(key);
    createJournal(db, kind_id ? { ...entry, kind_id } : entry);
  }
}

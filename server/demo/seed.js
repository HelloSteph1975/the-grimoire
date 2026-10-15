import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { seedStarter } from '../services/starter.js';

// Sample data for the demo folder only. Later stages add their own samples here.
export function seedDemo(ctx, { reset = false } = {}) {
  const db = ctx.db;
  transaction(db, () => {
    if (reset) {
      db.exec('DELETE FROM correspondence_links; DELETE FROM correspondence_traditions; DELETE FROM correspondences; DELETE FROM categories; DELETE FROM traditions; DELETE FROM starter_removed; DELETE FROM settings;');
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
}

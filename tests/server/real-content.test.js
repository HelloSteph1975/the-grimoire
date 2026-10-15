import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContext } from '../../server/context.js';
import { CONTENT_DIR } from '../../server/services/starter.js';

const readJson = rel => JSON.parse(fs.readFileSync(path.join(CONTENT_DIR, rel), 'utf8'));
const entries = fs.readdirSync(path.join(CONTENT_DIR, 'correspondences')).filter(f => f.endsWith('.json'))
  .flatMap(f => readJson(`correspondences/${f}`));

// Seeds the real library with no override. Expected values come from the files, so adding a batch needs no edit here.
describe('real starter content', () => {
  it('seeds every entry and link, with no orphans', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grimoire-real-'));
    const ctx = createContext({ dataDir: dir, port: 0, demo: false });
    try {
      const keys = new Set(ctx.db.prepare('SELECT starter_key FROM correspondences').all().map(r => r.starter_key));
      for (const e of entries) expect(keys.has(e.starter_key), e.starter_key).toBe(true);
      expect(keys.size).toBe(entries.length);

      const stored = ctx.db.prepare(`SELECT a.starter_key ka, b.starter_key kb FROM correspondence_links l
        JOIN correspondences a ON a.id = l.a_id JOIN correspondences b ON b.id = l.b_id`).all();
      const pair = (x, y) => [x, y].sort().join('|');
      const have = new Set(stored.map(r => pair(r.ka, r.kb)));
      const wanted = new Set(readJson('links.json').map(([x, y]) => pair(x, y)));
      expect([...wanted].filter(p => !have.has(p))).toEqual([]);
      expect(have.size).toBe(wanted.size);

      const count = sql => ctx.db.prepare(sql).get().n;
      expect(count('SELECT count(*) n FROM correspondences WHERE category_id NOT IN (SELECT id FROM categories)')).toBe(0);
      expect(count('SELECT count(*) n FROM correspondence_links WHERE a_id NOT IN (SELECT id FROM correspondences) OR b_id NOT IN (SELECT id FROM correspondences)')).toBe(0);
      expect(count(`SELECT count(*) n FROM correspondence_traditions WHERE correspondence_id NOT IN (SELECT id FROM correspondences)
        OR tradition_id NOT IN (SELECT id FROM traditions)`)).toBe(0);
    } finally {
      try { ctx.db.close(); } catch {}
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

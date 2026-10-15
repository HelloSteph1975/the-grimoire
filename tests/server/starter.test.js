import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db/connection.js';
import { seedStarter } from '../../server/services/starter.js';
import { repos } from '../../server/db/repos.js';
import { deleteForever, emptyTrash, restoreFromTrash } from '../../server/services/trash.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'content');
let dir, db, extra;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-seed-')); db = openDb(dir); extra = []; });
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); for (const d of extra) fs.rmSync(d, { recursive: true, force: true }); });

// Copies the fixture folder to a temp dir and applies a transform to each named file.
function copyFixtureWith(changes) {
  const to = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-fix-'));
  extra.push(to);
  fs.cpSync(FIXTURE, to, { recursive: true });
  for (const [rel, fn] of Object.entries(changes)) {
    const file = path.join(to, rel);
    fs.writeFileSync(file, JSON.stringify(fn(JSON.parse(fs.readFileSync(file, 'utf8')))));
  }
  return to;
}

describe('seedStarter', () => {
  it('adds the starter traditions and categories once', () => {
    expect(seedStarter(db)).toBe(3 + 9);
    expect(seedStarter(db)).toBe(0);
    expect(repos(db).traditions.list()).toHaveLength(3);
    expect(repos(db).categories.list()).toHaveLength(9);
  });
  it('never overwrites an edited starter entry', () => {
    seedStarter(db);
    const w = repos(db).traditions.list().find(r => r.starter_key === 'tradition.wiccan');
    repos(db).traditions.update(w.id, { description: 'Mine', is_starter: 0 }, w.version);
    seedStarter(db);
    expect(repos(db).traditions.get(w.id).description).toBe('Mine');
  });
  it('does not bring back a starter entry that is in the Trash', () => {
    seedStarter(db);
    const w = repos(db).traditions.list().find(r => r.starter_key === 'tradition.wiccan');
    repos(db).traditions.remove(w.id);
    expect(seedStarter(db)).toBe(0);
    expect(repos(db).traditions.list()).toHaveLength(2);
  });
  it('does not bring back a starter entry deleted forever', () => {
    seedStarter(db);
    db.prepare("INSERT INTO starter_removed (starter_key) VALUES ('tradition.wiccan')").run();
    db.prepare("DELETE FROM traditions WHERE starter_key = 'tradition.wiccan'").run();
    expect(seedStarter(db)).toBe(0);
  });
  it('seeds categories, entries, traditions and links, and skips entries with no category', () => {
    const n = seedStarter(db, { content: FIXTURE });
    expect(n).toBe(3 + 2 + 2);
    const monday = db.prepare("SELECT * FROM correspondences WHERE starter_key='corr.days.monday'").get();
    expect(JSON.parse(monday.keywords)).toEqual(['moon', 'intuition']);
    expect(db.prepare('SELECT count(*) n FROM correspondence_traditions WHERE correspondence_id = ?').get(monday.id).n).toBe(1);
    expect(db.prepare('SELECT count(*) n FROM correspondence_links').get().n).toBe(1);
    expect(db.prepare("SELECT 1 FROM correspondences WHERE starter_key='corr.planets.ghost'").get()).toBeUndefined();
  });
  it('does not re-add a link the owner removed', () => {
    seedStarter(db, { content: FIXTURE });
    db.exec('DELETE FROM correspondence_links');
    seedStarter(db, { content: FIXTURE });
    expect(db.prepare('SELECT count(*) n FROM correspondence_links').get().n).toBe(0);
  });
  it('skips entries whose category was deleted forever', () => {
    db.prepare("INSERT INTO starter_removed (starter_key) VALUES ('category.days')").run();
    seedStarter(db, { content: FIXTURE });
    expect(db.prepare("SELECT 1 FROM correspondences WHERE starter_key='corr.days.monday'").get()).toBeUndefined();
  });
  // Re-seeds Monday while its category sits in the Trash; returns the category's stamp.
  function seedIntoTrashedCategory() {
    seedStarter(db, { content: FIXTURE });
    const stamp = '2026-01-01T00:00:00.000Z';
    db.exec(`UPDATE categories SET deleted_at = '${stamp}' WHERE starter_key = 'category.days'`);
    db.exec("DELETE FROM correspondence_links; DELETE FROM correspondence_traditions; DELETE FROM correspondences WHERE starter_key = 'corr.days.monday'");
    expect(seedStarter(db, { content: FIXTURE })).toBe(1);
    return stamp;
  }
  it('puts an entry whose category is in the Trash into the Trash with it', () => {
    const stamp = seedIntoTrashedCategory();
    expect(db.prepare("SELECT deleted_at FROM correspondences WHERE starter_key='corr.days.monday'").get().deleted_at).toBe(stamp);
  });
  it('lets that category be deleted forever, and records the entry as removed', () => {
    seedIntoTrashedCategory();
    const cat = db.prepare("SELECT id FROM categories WHERE starter_key='category.days'").get();
    deleteForever(db, 'category', cat.id);
    expect(db.prepare("SELECT 1 FROM correspondences WHERE starter_key='corr.days.monday'").get()).toBeUndefined();
    expect(db.prepare("SELECT 1 FROM starter_removed WHERE starter_key='corr.days.monday'").get()).toBeDefined();
  });
  it('lets the Trash be emptied with that category in it', () => {
    seedIntoTrashedCategory();
    const ctx = { db, config: { dataDir: dir } };
    emptyTrash(ctx);
    expect(db.prepare('SELECT count(*) n FROM categories WHERE deleted_at IS NOT NULL').get().n).toBe(0);
    expect(db.prepare("SELECT 1 FROM correspondences WHERE starter_key='corr.days.monday'").get()).toBeUndefined();
  });
  it('brings that entry back live when the category is restored', () => {
    seedIntoTrashedCategory();
    const cat = db.prepare("SELECT id FROM categories WHERE starter_key='category.days'").get();
    restoreFromTrash(db, 'category', cat.id);
    expect(db.prepare("SELECT deleted_at FROM correspondences WHERE starter_key='corr.days.monday'").get().deleted_at).toBeNull();
  });
  it('updates unedited starter rows when content_version goes up, and leaves edited ones alone', () => {
    seedStarter(db, { content: FIXTURE });
    const bumped = copyFixtureWith({ 'correspondences/days.json': d => d.map(e => ({ ...e, summary: 'New text', content_version: 2 })) });
    const moon = db.prepare("SELECT * FROM correspondences WHERE starter_key='corr.planets.moon'").get();
    db.prepare("UPDATE correspondences SET is_starter = 0, summary = 'Mine' WHERE id = ?").run(moon.id);
    seedStarter(db, { content: bumped });
    const monday = db.prepare("SELECT * FROM correspondences WHERE starter_key='corr.days.monday'").get();
    expect(monday).toMatchObject({ summary: 'New text', content_version: 2, version: 2 });
    expect(db.prepare('SELECT summary FROM correspondences WHERE id = ?').get(moon.id).summary).toBe('Mine');
  });
  it('does not update a starter row that is in the Trash', () => {
    seedStarter(db, { content: FIXTURE });
    db.exec("UPDATE correspondences SET deleted_at = '2026-01-01T00:00:00.000Z' WHERE starter_key = 'corr.days.monday'");
    const bumped = copyFixtureWith({ 'correspondences/days.json': d => d.map(e => ({ ...e, summary: 'New text', content_version: 2 })) });
    seedStarter(db, { content: bumped });
    expect(db.prepare("SELECT summary FROM correspondences WHERE starter_key='corr.days.monday'").get().summary).toBe('The day of the moon.');
  });
  it('updates a starter tradition and category when content_version goes up', () => {
    seedStarter(db, { content: FIXTURE });
    const bumped = copyFixtureWith({
      'traditions.json': d => d.map(e => ({ ...e, description: 'Fresh', content_version: 2 })),
      'categories.json': d => d.map(e => ({ ...e, name: 'Renamed', content_version: 2 })),
    });
    seedStarter(db, { content: bumped });
    expect(db.prepare("SELECT description, content_version, version FROM traditions WHERE starter_key='tradition.wiccan'").get())
      .toMatchObject({ description: 'Fresh', content_version: 2, version: 2 });
    expect(db.prepare("SELECT name FROM categories WHERE starter_key='category.days'").get().name).toBe('Renamed');
  });
  it('keeps the owner order when content_version goes up, but updates the text', () => {
    seedStarter(db, { content: FIXTURE });
    db.exec("UPDATE categories SET sort_order = 99 WHERE starter_key = 'category.days'; UPDATE traditions SET sort_order = 77 WHERE starter_key = 'tradition.wiccan'");
    const bumped = copyFixtureWith({
      'traditions.json': d => d.map(e => ({ ...e, description: 'Fresh', content_version: 2 })),
      'categories.json': d => d.map(e => ({ ...e, name: 'Renamed', content_version: 2 })),
    });
    seedStarter(db, { content: bumped });
    expect(db.prepare("SELECT name, sort_order FROM categories WHERE starter_key='category.days'").get()).toMatchObject({ name: 'Renamed', sort_order: 99 });
    expect(db.prepare("SELECT description, sort_order FROM traditions WHERE starter_key='tradition.wiccan'").get()).toMatchObject({ description: 'Fresh', sort_order: 77 });
  });
  it('refreshes the tradition joins on update', () => {
    seedStarter(db, { content: FIXTURE });
    const bumped = copyFixtureWith({ 'correspondences/days.json': d => d.map(e => ({ ...e, traditions: ['tradition.wiccan', 'tradition.mexican-folk'], content_version: 2 })) });
    seedStarter(db, { content: bumped });
    const id = db.prepare("SELECT id FROM correspondences WHERE starter_key='corr.days.monday'").get().id;
    expect(db.prepare('SELECT count(*) n FROM correspondence_traditions WHERE correspondence_id = ?').get(id).n).toBe(2);
  });
});

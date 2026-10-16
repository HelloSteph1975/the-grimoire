import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = path.join(import.meta.dirname, '..', '..', 'server', 'content');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(DIR, rel), 'utf8'));
const ICONS = ['gem', 'palette', 'calendar-days', 'orbit', 'flame', 'moon', 'sparkles', 'cross', 'sun', 'leaf', 'book-open', 'star'];

const categories = readJson('categories.json');
const traditions = readJson('traditions.json');
const files = fs.readdirSync(path.join(DIR, 'correspondences')).filter(f => f.endsWith('.json'));
const entries = files.flatMap(f => readJson(`correspondences/${f}`));
const links = readJson('links.json');
const everyFile = ['categories.json', 'traditions.json', 'links.json', ...files.map(f => `correspondences/${f}`)];

describe('starter content files', () => {
  it('are all JSON arrays', () => {
    for (const rel of everyFile) expect(Array.isArray(readJson(rel)), rel).toBe(true);
  });
  it('have unique, well-formed starter keys', () => {
    const keys = [...categories, ...entries].map(e => e.starter_key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const c of categories) expect(c.starter_key).toMatch(/^category\.[a-z0-9-]+$/);
    for (const e of entries) expect(e.starter_key).toMatch(/^corr\.[a-z0-9-]+\.[a-z0-9-]+$/);
  });
  it('only point at categories and traditions that exist', () => {
    const cats = new Set(categories.map(c => c.starter_key));
    const trads = new Set(traditions.map(t => t.starter_key));
    for (const e of entries) {
      expect(cats.has(e.category), e.starter_key).toBe(true);
      for (const t of e.traditions) expect(trads.has(t), e.starter_key).toBe(true);
    }
  });
  it('respect the field limits and use known icons', () => {
    for (const c of categories) expect(ICONS).toContain(c.icon);
    for (const e of entries) {
      expect(e.name.length).toBeLessThanOrEqual(80);
      expect(e.summary.length).toBeLessThanOrEqual(200);
      expect(e.body.length).toBeLessThanOrEqual(4000);
      expect(e.keywords.length).toBeLessThanOrEqual(20);
      for (const k of e.keywords) expect(k.length).toBeLessThanOrEqual(30);
      if (e.feast_day !== undefined) {
        expect(e.feast_day).toMatch(/^\d{2}-\d{2}$/);
        const [m, d] = e.feast_day.split('-').map(Number);
        expect(m).toBeGreaterThanOrEqual(1);
        expect(m).toBeLessThanOrEqual(12);
        expect(d).toBeGreaterThanOrEqual(1);
        expect(d).toBeLessThanOrEqual(new Date(2024, m, 0).getDate());
      }
    }
  });
  it('have lowercase, trimmed keywords with no repeats', () => {
    for (const e of entries) {
      for (const k of e.keywords) expect(k, e.starter_key).toBe(k.trim().toLowerCase());
      expect(new Set(e.keywords).size, e.starter_key).toBe(e.keywords.length);
    }
  });
  it('key each entry under its own category', () => {
    for (const e of entries) expect(e.starter_key.split('.')[1], e.starter_key).toBe(e.category.replace(/^category\./, ''));
  });
  it('have non-empty text and no TODO', () => {
    for (const e of entries) {
      for (const f of ['name', 'summary', 'body']) expect(String(e[f] ?? '').trim(), `${e.starter_key} ${f}`).not.toBe('');
    }
    for (const rel of everyFile) expect(fs.readFileSync(path.join(DIR, rel), 'utf8'), rel).not.toMatch(/TODO/);
  });
  it('have links between two different existing entries, with no repeats', () => {
    const keys = new Set(entries.map(e => e.starter_key));
    const seen = new Set();
    for (const [a, b] of links) {
      expect(a).not.toBe(b);
      expect(keys.has(a), a).toBe(true);
      expect(keys.has(b), b).toBe(true);
      const id = [a, b].sort().join('|');
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
    }
  });
});

describe('spell kinds', () => {
  const FIXTURE_DIR = path.join(import.meta.dirname, '..', 'fixtures', 'base-content');
  const kinds = readJson('spell-kinds.json');
  it('have unique spell-kind keys and a name each', () => {
    const keys = kinds.map(k => k.starter_key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of kinds) {
      expect(k.starter_key).toMatch(/^spell-kind.[a-z0-9-]+$/);
      expect(String(k.name ?? '').trim(), k.starter_key).not.toBe('');
      expect(k.name.length).toBeLessThanOrEqual(60);
    }
  });
  it('match the test fixture file', () => {
    expect(JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'spell-kinds.json'), 'utf8'))).toEqual(kinds);
  });
});

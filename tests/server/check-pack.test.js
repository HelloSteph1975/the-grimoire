import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkPack } from '../../scripts/check-pack.js';

let tmp, root, dataDir;
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
};
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'grimoire-pack-'));
  root = path.join(tmp, 'app');
  dataDir = path.join(tmp, 'data');
  write(path.join(root, 'client/src/i18n/en.json'), { 'nav.today': 'Today', 'nav.settings': 'Settings', 'nav.books': 'Books' });
  write(path.join(root, 'server/content/traditions.json'), [{ starter_key: 'tradition.wiccan', name: 'Wiccan', description: 'd' }]);
  write(path.join(root, 'server/content/categories.json'), [{ starter_key: 'category.days', name: 'Days' }]);
  write(path.join(root, 'server/content/correspondences/days.json'), [{ starter_key: 'corr.days.monday', name: 'Monday', summary: 's', body: 'b', keywords: ['moon'] }]);
  write(path.join(root, 'server/content/links.json'), []);
  write(path.join(root, 'server/content/spell-kinds.json'), [{ starter_key: 'spell-kind.spell', name: 'Spell' }]);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('checkPack', () => {
  it('reports the exact missing and extra keys', () => {
    write(path.join(dataDir, 'locales/es/ui.json'), { _name: 'Español', 'nav.today': 'Hoy', 'nav.gone': 'x' });
    write(path.join(dataDir, 'locales/es/content.json'), {
      'tradition.wiccan.name': 'Wicca',
      'category.days.name': 'Días',
      'corr.days.monday.name': 'Lunes',
      'corr.days.monday.keywords': 'luna, plata',
      'corr.days.tuesday.name': 'Martes',
    });
    expect(checkPack({ dataDir, code: 'es', root })).toEqual({
      missingUi: ['nav.settings', 'nav.books'],
      missingContent: ['tradition.wiccan.description', 'spell-kind.spell.name', 'corr.days.monday.summary', 'corr.days.monday.body'],
      extra: ['nav.gone', 'corr.days.tuesday.name'],
      bad: [],
    });
  });
  it('accepts plural forms of keys the app uses, and flags them for keys it does not', () => {
    write(path.join(dataDir, 'locales/es/ui.json'), {
      'nav.today': 'Hoy', 'nav.settings': 'Ajustes', 'nav.books': 'Libros', 'nav.books.one': 'Libro', 'nav.books.other': 'Libros', 'nav.gone.one': 'x',
    });
    expect(checkPack({ dataDir, code: 'es', root }).extra).toEqual(['nav.gone.one']);
  });
  it('flags empty and non-text values', () => {
    write(path.join(dataDir, 'locales/es/ui.json'), { _name: 'Español', 'nav.today': '  ', 'nav.settings': 5, 'nav.books': 'Libros' });
    write(path.join(dataDir, 'locales/es/content.json'), { 'tradition.wiccan.name': 'Wicca', 'corr.days.monday.keywords': ['luna'], 'category.days.name': null });
    expect(checkPack({ dataDir, code: 'es', root }).bad).toEqual(['nav.today', 'nav.settings', 'corr.days.monday.keywords', 'category.days.name']);
  });
  it('says which file is not valid JSON', () => {
    fs.mkdirSync(path.join(dataDir, 'locales/es'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'locales/es/ui.json'), '{ "nav.today": ');
    expect(() => checkPack({ dataDir, code: 'es', root })).toThrow(`${path.join(dataDir, 'locales', 'es', 'ui.json')} is not valid JSON`);
  });
  it('reports everything missing when the pack has no files', () => {
    const r = checkPack({ dataDir, code: 'fr', root });
    expect(r.missingUi).toEqual(['nav.today', 'nav.settings', 'nav.books']);
    expect(r.missingContent).toHaveLength(8);
    expect(r.extra).toEqual([]);
  });
});

describe('npm run check-pack', () => {
  const run = (...args) => spawnSync(process.execPath, ['scripts/check-pack.js', ...args], { encoding: 'utf8', env: { ...process.env, GRIMOIRE_DATA_DIR: dataDir } });
  it('prints which file is not valid JSON and exits 1', () => {
    fs.mkdirSync(path.join(dataDir, 'locales/es'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'locales/es/ui.json'), '{ nope');
    const r = run('es');
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`${path.join(dataDir, 'locales', 'es', 'ui.json')} is not valid JSON`);
  });
  it.each(['../x', 'ES', 'e', 'es-mx'])('refuses %s as a language code', code => {
    const r = run(code);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain(`"${code}" is not a language code`);
  });
});

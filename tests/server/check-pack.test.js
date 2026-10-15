import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
      missingContent: ['tradition.wiccan.description', 'corr.days.monday.summary', 'corr.days.monday.body'],
      extra: ['nav.gone', 'corr.days.tuesday.name'],
    });
  });
  it('reports everything missing when the pack has no files', () => {
    const r = checkPack({ dataDir, code: 'fr', root });
    expect(r.missingUi).toEqual(['nav.today', 'nav.settings', 'nav.books']);
    expect(r.missingContent).toHaveLength(7);
    expect(r.extra).toEqual([]);
  });
});

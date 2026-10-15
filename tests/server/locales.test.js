import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

const writePack = (code, files) => {
  const dir = path.join(t.dataDir, 'locales', code);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
};

describe('/api/locales', () => {
  it('has only English with no packs', async () => {
    expect((await t.http().get('/api/locales')).body).toEqual([{ code: 'en', name: 'English' }]);
  });
  it('lists a valid pack and serves its parts', async () => {
    writePack('es', { 'ui.json': JSON.stringify({ _name: 'Español', 'nav.today': 'Hoy' }), 'content.json': JSON.stringify({ 'tradition.wiccan.name': 'Wicca' }) });
    expect((await t.http().get('/api/locales')).body).toEqual([{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }]);
    expect((await t.http().get('/api/locales/es/ui')).body['nav.today']).toBe('Hoy');
    expect((await t.http().get('/api/locales/es/content')).body['tradition.wiccan.name']).toBe('Wicca');
  });
  it('serves an empty content part when content.json is missing', async () => {
    writePack('fr', { 'ui.json': JSON.stringify({ _name: 'Français' }) });
    expect((await t.http().get('/api/locales/fr/content')).body).toEqual({});
  });
  it('skips broken packs and keeps working', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    writePack('de', { 'ui.json': '{ broken' });
    writePack('it', { 'ui.json': JSON.stringify({ 'nav.today': 'Oggi' }) });
    writePack('Bad Code', { 'ui.json': JSON.stringify({ _name: 'X' }) });
    expect((await t.http().get('/api/locales')).body).toEqual([{ code: 'en', name: 'English' }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('refuses unknown codes, path tricks and unknown parts', async () => {
    expect((await t.http().get('/api/locales/xx/ui')).status).toBe(404);
    expect((await t.http().get('/api/locales/..%2F..%2Fsecret/ui')).status).toBe(404);
    writePack('es', { 'ui.json': JSON.stringify({ _name: 'Español' }) });
    expect((await t.http().get('/api/locales/es/other')).status).toBe(404);
  });
});

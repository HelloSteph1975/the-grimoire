import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, DEFAULT_PORT, DEMO_PORT, defaultDataDir } from '../../server/config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'grim-cfg-'));

describe('loadConfig', () => {
  it('uses 4209 and Documents\\The Grimoire Data by default', () => {
    const c = loadConfig({ env: {}, root: tmp() });
    expect(c.port).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(4209);
    expect(c.dataDir).toBe(path.join(os.homedir(), 'Documents', 'The Grimoire Data'));
  });
  it('reads port and dataDir from config.json', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: 5000, dataDir: 'D:\\G' }));
    expect(loadConfig({ env: {}, root })).toMatchObject({ port: 5000, dataDir: 'D:\\G' });
  });
  it('lets GRIMOIRE_PORT and GRIMOIRE_DATA_DIR win', () => {
    const c = loadConfig({ env: { GRIMOIRE_PORT: '4300', GRIMOIRE_DATA_DIR: 'E:\\X' }, root: tmp() });
    expect(c).toMatchObject({ port: 4300, dataDir: 'E:\\X' });
  });
  it('rejects a bad port with a plain message', () => {
    expect(() => loadConfig({ env: { GRIMOIRE_PORT: 'abc' }, root: tmp() })).toThrow(/whole number/);
  });
  it('explains broken config.json', () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, 'config.json'), '{ "dataDir": "C:\\bad" ');
    expect(() => loadConfig({ env: {}, root })).toThrow(/not valid JSON/);
  });
  it('uses the demo port and folder for --demo', () => {
    const c = loadConfig({ env: {}, root: tmp(), demo: true });
    expect(c).toMatchObject({ port: DEMO_PORT, dataDir: defaultDataDir(true), demo: true });
    expect(DEMO_PORT).toBe(4211);
  });
});

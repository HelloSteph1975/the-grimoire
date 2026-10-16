import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeTestContext } from './helpers.js';

let t;
let dist;
afterEach(() => {
  t?.cleanup();
  delete process.env.GRIMOIRE_CLIENT_DIST;
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
  dist = undefined;
});

describe('GRIMOIRE_CLIENT_DIST', () => {
  it('serves that folder instead of client/dist', async () => {
    dist = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-dist-'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<title>Test build</title>');
    process.env.GRIMOIRE_CLIENT_DIST = dist;
    t = makeTestContext();
    const home = await t.http().get('/');
    expect(home.text).toContain('Test build');
    const deep = await t.http().get('/correspondences/1');
    expect(deep.text).toContain('Test build');
  });
});

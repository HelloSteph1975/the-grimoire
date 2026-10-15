import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createContext } from '../../server/context.js';
import { createApp } from '../../server/app.js';

export function makeTestContext({ onShutdown, dataDir } = {}) {
  const dir = dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'grimoire-test-'));
  const ctx = createContext({ dataDir: dir, port: 0, demo: false });
  const app = createApp(ctx, { onShutdown });
  return {
    ctx, app, dataDir: dir,
    // Supertest sends Host 127.0.0.1:<port>, which hostGuard allows.
    http: () => request(app),
    cleanup() { try { ctx.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

// Makes one entry through the API and returns it.
export async function makeEntry(t, categoryId, name, extra = {}) {
  const res = await t.http().post('/api/correspondences').send({ category_id: categoryId, name, ...extra });
  if (res.status !== 201) throw new Error(`makeEntry failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

// Makes a new category with n entries through the API and returns the category.
export async function makeCategoryWithEntries(t, n, name = 'Test category') {
  const res = await t.http().post('/api/categories').send({ name, icon: 'star' });
  if (res.status !== 201) throw new Error(`makeCategoryWithEntries failed: ${res.status} ${JSON.stringify(res.body)}`);
  for (let i = 1; i <= n; i++) await makeEntry(t, res.body.id, `Entry ${i}`);
  return res.body;
}

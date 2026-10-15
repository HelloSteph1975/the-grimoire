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

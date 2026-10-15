# The Grimoire, Stage 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A running, installable Grimoire shell. It saves and loads reliably, with version checks, a Trash, backups and restore, two themes, language packs, a Settings screen with a Traditions manager, empty placeholder screens for later stages, and Windows start/stop tasks and a shortcut.

**Architecture:** Express 5 + `node:sqlite` server, React 19 + React Router client built by Vite, copied and adapted from The Apothecary (`~\dev\the-apothecary`). The server owns correctness: every write is one transaction, every editable row has a `version`, and a stale update gets `409` with the current row. The client funnels every load and save through one hook (`useResource`) that drops replies that are out of date, and one form hook (`useRecordForm`) that guards unsaved changes and handles conflicts. Traditions are the first real record type, so the whole save path is proven end to end in this stage.

**Tech Stack:** Node 24+, Express 5, `node:sqlite`, React 19, React Router 7 (data router), Vite, Vitest, Testing Library, Supertest, Playwright, lucide-react, @fontsource Cormorant Garamond and EB Garamond.

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md`

**Not in this stage:** the sidebar search box (Stage 6), categories (Stage 2), spell kinds (Stage 3), journal kinds (Stage 6), the Spanish pack's text (written with the Stage 2 starter content), and moon or sky data (`astronomy-engine` arrives in Stage 4).

## Global Constraints

- Node 24 or newer (`node:sqlite`). Run the server with `--disable-warning=ExperimentalWarning`.
- Ports: app 4209 (`GRIMOIRE_PORT`), demo 4211 (`GRIMOIRE_DEMO_PORT`), browser tests 4213.
- Data folder: `Documents\The Grimoire Data` (`grimoire.db`, `backups\`, `locales\`), overridable by `dataDir` in `config.json` or `GRIMOIRE_DATA_DIR`. Demo: `Documents\The Grimoire Demo Data` (`GRIMOIRE_DEMO_DATA_DIR`).
- Scheduled tasks: `The Grimoire - Start Morning` (daily 5:30 AM, StartWhenAvailable, ExecutionTimeLimit 72 hours, allowed on battery) and `The Grimoire - Stop 9 PM` (daily 9 PM, runs `node scripts/stop.js` through a hidden `.vbs`; no PowerShell stop script). Desktop shortcut `The Grimoire Dashboard.lnk`.
- Server listens on `127.0.0.1` only. Every `/api` request passes `hostGuard`; backups, restore, Trash empty, data folder and shutdown also pass `localOnly`.
- Every editable table has `version INTEGER NOT NULL DEFAULT 1`, `created_at`, `updated_at`, `deleted_at`. Updates must send `version`. Stale version → `409 { error, current }`.
- Deleting is soft (`deleted_at`). Nothing is purged automatically. Permanent delete happens only from the Trash, with confirmation.
- Backups: `VACUUM INTO backups\<kind>-YYYY-MM-DD-HHMM.db`, kinds `grimoire`, `pre-restore`, `pre-empty`. Keep the newest 30; older ones go to the Recycle Bin (fallback: `backups\_old\`), never hard-deleted.
- Code, README and repo are English. Screen text goes through `t()`. Language packs live in `<dataDir>\locales\<code>\ui.json` and `content.json`, never in the repo.
- Themes: `old-book` (default) and `book-folk`. Text colors pass WCAG AA (4.5:1) on their backgrounds.
- All ornaments are original SVGs written for this repo. No copied art, text or icons beyond Lucide.
- Keep the owner's personal details (name, homes, location) out of the repo.
- Human-facing text (commits, PR body, README, comments) goes through `/unslop` before committing. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A starter entry deleted forever comes back on the next start.** Expect it to stay gone. Pinned by the `starter_removed` table and a test in Task 5.
2. **A data folder path with an apostrophe or spaces** (for example `C:\Users\O'Neil\Documents\The Grimoire Data`) breaks `VACUUM INTO`. Expect backups to work. Pinned by a test in Task 4.
3. **A data folder made by a newer version of the app** (after restoring a newer backup into an older install). Expect a clear error and no change to the file, not a crash or a downgrade. Pinned by tests in Tasks 2 and 4.
4. **A broken language pack** (bad JSON, missing `_name`, or a code like `..`). Expect the app to skip it and keep working in English. Pinned by tests in Task 6.
5. **The server stops while the page is open**, for example at 9 PM. Expect "Can't reach The Grimoire" with Try again on loads, and on saves an error that keeps the form filled in. Pinned by tests in Tasks 8 and 13.

---

## File map

```
package.json, vite.config.js, vitest.config.js, playwright.config.js, .gitignore, LICENSE, NOTICE.md
README.md, AGENTS.md, CLAUDE.md
server/
  index.js            start, shutdown, maintenance
  app.js              express app
  config.js           ports and data folder
  context.js          db handle, reopen after restore
  http.js             HttpError, guards, error handler (409 for conflicts)
  validate.js         schema checks (adds maxLength, pattern)
  db/connection.js    open, pragmas, transaction()
  db/migrations.js    append-only migrations, migrate()
  db/repo.js          versioned repo, VersionConflict
  db/repos.js         one repo per table
  content/traditions.json   starter traditions
  services/starter.js       seed starter content, never overwrite
  services/backup.js        backup, list, rotate, restore
  services/trash.js         list, restore, purge, empty
  services/settings.js      settings with checks
  services/locales.js       language packs from the data folder
  services/maintenance.js   startup housekeeping
  lib/recycle.js            send a file to the Recycle Bin
  routes/index.js, crud.js, traditions.js, trash.js, settings.js, locales.js, system.js
  demo/seed.js
client/
  index.html, public/favicon.svg, public/manifest.webmanifest
  src/main.jsx, App.jsx
  src/i18n/en.json, I18nProvider.jsx
  src/lib/api.js, useResource.js, useRecordForm.js, useLeaveGuard.js
  src/components/  Button, Dialog, Field, ConfirmProvider, ToastProvider, SettingsProvider,
                   Layout, Sidebar, Ornaments, PageHeader, LoadState, ConflictDialog
  src/screens/     Placeholder, NotFound, Settings, settings/Traditions, settings/Backups, Trash
  src/theme/tokens.css, global.css
scripts/setup.js, stop.js, make-icon.js
windows/start-server.vbs, stop-server.vbs, Launch The Grimoire.vbs, install-windows.ps1, uninstall-windows.ps1, the-grimoire.ico
tests/server/*.test.js, tests/client/*.test.jsx, e2e/*.spec.js
```

---

### Task 1: Project scaffold, config, health check

**Files:**
- Create: `package.json`, `.gitignore`, `LICENSE`, `vite.config.js`, `vitest.config.js`, `server/config.js`, `server/http.js`, `server/validate.js`, `server/db/connection.js`, `server/db/migrations.js`, `server/context.js`, `server/app.js`, `server/routes/index.js`, `server/index.js`, `tests/server/helpers.js`, `tests/client/setup.js`
- Test: `tests/server/config.test.js`, `tests/server/health.test.js`, `tests/server/validate.test.js`

**Interfaces:**
- Produces: `loadConfig({ env, root, demo }) → { dataDir, port, demo }`, `DEFAULT_PORT = 4209`, `DEMO_PORT = 4211`, `defaultDataDir(demo)`, `readConfigFile(file)`, `parsePort(value, source)`; `HttpError(status, message, details)`, `notFound()`, `idParam(req)`, `hostGuard`, `localOnly`, `errorHandler`; `validate(schema, body, { partial })`, `check(schema, body, opts)`; `openDb(dataDir) → DatabaseSync`, `ensureDataDirs(dataDir)`, `transaction(db, fn)`; `migrations: string[]`, `migrate(db)`; `createContext(config) → { config, db, reopen() }`; `createApp(ctx, { onShutdown }) → express app`, `ROOT`; test helper `makeTestContext() → { ctx, app, dataDir, http(), cleanup() }`.

- [ ] **Step 1: Create package.json and install dependencies**

```json
{
  "name": "the-grimoire",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "A personal Book of Shadows that runs on your own computer.",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "scripts": {
    "start": "node --disable-warning=ExperimentalWarning server/index.js",
    "demo": "node --disable-warning=ExperimentalWarning server/index.js --demo",
    "dev": "concurrently -n api,web \"node --disable-warning=ExperimentalWarning --watch server/index.js\" \"vite\"",
    "build": "vite build",
    "test": "vitest run --project server && vitest run --project client",
    "test:e2e": "playwright test",
    "icon": "node scripts/make-icon.js",
    "setup": "npm install && npm run build && node scripts/setup.js",
    "install-windows": "node scripts/setup.js --windows",
    "uninstall-windows": "powershell -NoProfile -ExecutionPolicy Bypass -File windows/uninstall-windows.ps1",
    "stop": "node scripts/stop.js"
  }
}
```

Run:
```bash
npm install express react react-dom react-router-dom lucide-react @fontsource/cormorant-garamond @fontsource/eb-garamond
npm install -D vite @vitejs/plugin-react vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event supertest @playwright/test concurrently png-to-ico
npx playwright install chromium
```

- [ ] **Step 2: Create .gitignore, LICENSE, vite and vitest config**

`.gitignore`:
```
node_modules/
client/dist/
config.json
.superpowers/
*.log
test-results/
playwright-report/
```

`LICENSE`: copy `~\dev\the-apothecary\LICENSE` unchanged (MIT, with the owner's copyright line).

`vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:4209' } },
});
```

`vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'server', include: ['tests/server/**/*.test.js'], environment: 'node' } },
      {
        plugins: [react()],
        test: { name: 'client', include: ['tests/client/**/*.test.{js,jsx}'], environment: 'jsdom', testTimeout: 15000, hookTimeout: 15000, setupFiles: ['tests/client/setup.js'] },
      },
    ],
  },
});
```

`tests/client/setup.js`:
```js
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// Vitest runs without globals, so Testing Library can't register its own cleanup.
afterEach(() => cleanup());
configure({ asyncUtilTimeout: 5000 });
```

- [ ] **Step 3: Write the failing config, health and validate tests**

`tests/server/config.test.js`:
```js
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
```

`tests/server/helpers.js`:
```js
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
```

`tests/server/health.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('health and guards', () => {
  it('answers /api/health', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, demo: false });
  });
  it('refuses a request that names another host', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/health').set('Host', 'evil.example');
    expect(res.status).toBe(403);
  });
  it('refuses a write from another site', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/nothing').set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });
  it('gives 404 JSON for unknown API routes', async () => {
    t = makeTestContext();
    const res = await t.http().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('No such API route');
  });
});
```

`tests/server/validate.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validate } from '../../server/validate.js';

describe('validate', () => {
  it('requires fields marked with !', () => {
    expect(validate({ name: 'string!' }, {}).errors).toEqual({ name: 'Required' });
  });
  it('trims text and turns empty text into null', () => {
    expect(validate({ a: 'string', b: 'string' }, { a: '  x ', b: '  ' }).data).toEqual({ a: 'x', b: null });
  });
  it('enforces maxLength', () => {
    expect(validate({ name: { type: 'string!', maxLength: 3 } }, { name: 'abcd' }).errors.name).toMatch(/3 characters/);
  });
  it('enforces pattern', () => {
    const s = { color: { type: 'string', pattern: /^#[0-9a-f]{6}$/i, patternHint: 'Use a color like #6e1f24' } };
    expect(validate(s, { color: 'red' }).errors.color).toBe('Use a color like #6e1f24');
    expect(validate(s, { color: '#6E1F24' }).data.color).toBe('#6E1F24');
  });
  it('skips missing fields in partial mode', () => {
    expect(validate({ name: 'string!' }, {}, { partial: true }).data).toEqual({});
  });
});
```

- [ ] **Step 4: Run the tests to see them fail**

Run: `npx vitest run --project server`
Expected: FAIL, modules not found.

- [ ] **Step 5: Write config.js**

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 4209;
export const DEMO_PORT = 4211;

export function defaultDataDir(demo = false) {
  return path.join(os.homedir(), 'Documents', demo ? 'The Grimoire Demo Data' : 'The Grimoire Data');
}

export function parsePort(value, source) {
  const s = String(value).trim();
  const n = /^\d+$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`The port in ${source} must be a whole number from 1 to 65535 (got ${JSON.stringify(value)}).`);
  }
  return n;
}

export function readConfigFile(file) {
  if (!fs.existsSync(file)) return {};
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). If it has a Windows path, use double backslashes (\\\\), like "D:\\\\Grimoire Data".`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file} must hold a JSON object, like { "port": 4209 }.`);
  return data;
}

export function loadConfig({ env = process.env, root = process.cwd(), demo = false } = {}) {
  if (demo) {
    const port = env.GRIMOIRE_DEMO_PORT ? parsePort(env.GRIMOIRE_DEMO_PORT, 'GRIMOIRE_DEMO_PORT') : DEMO_PORT;
    return { dataDir: env.GRIMOIRE_DEMO_DATA_DIR || defaultDataDir(true), port, demo: true };
  }
  const p = path.join(root, 'config.json');
  const file = readConfigFile(p);
  let port = DEFAULT_PORT;
  if (env.GRIMOIRE_PORT) port = parsePort(env.GRIMOIRE_PORT, 'GRIMOIRE_PORT');
  else if (file.port !== undefined && file.port !== null) port = parsePort(file.port, p);
  return { dataDir: env.GRIMOIRE_DATA_DIR || file.dataDir || defaultDataDir(false), port, demo: false };
}
```

- [ ] **Step 6: Copy http.js and validate.js from The Apothecary, then extend validate.js**

```bash
cp ../the-apothecary/server/http.js server/http.js
cp ../the-apothecary/server/validate.js server/validate.js
sed -i 's/localhost:4197/localhost:4209/' server/http.js
```

In `server/validate.js`, replace the `case 'string':` block with:
```js
      case 'string':
        if (typeof v !== 'string') out = { error: 'Must be text' };
        else if ((rule.required || rule.nullable === false) && !v.trim()) out = { error: 'Required' };
        else if (rule.maxLength && v.trim().length > rule.maxLength) out = { error: `Keep it to ${rule.maxLength} characters or fewer` };
        else if (rule.pattern && v.trim() && !rule.pattern.test(v.trim())) out = { error: rule.patternHint ?? 'Not the right format' };
        else out = { value: v.trim() || null };
        break;
```

- [ ] **Step 7: Write the database connection and the first migration**

`server/db/connection.js`:
```js
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.js';

export const DB_FILE = 'grimoire.db';

export function ensureDataDirs(dataDir) {
  for (const d of [dataDir, path.join(dataDir, 'backups'), path.join(dataDir, 'locales')]) fs.mkdirSync(d, { recursive: true });
}

export function openDb(dataDir, file = DB_FILE) {
  ensureDataDirs(dataDir);
  const db = new DatabaseSync(path.join(dataDir, file));
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    migrate(db);
  } catch (err) {
    db.close();
    throw err;
  }
  return db;
}

// Runs fn inside one write transaction. Nested calls join the outer one.
export function transaction(db, fn) {
  if (db.isTransaction) return fn();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}
```

`server/db/migrations.js`:
```js
// Every editable table gets these. version goes up by one on every change.
export const TS = `version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), deleted_at TEXT`;

// Each entry runs once, in order. Never edit an entry after it ships; add a new one.
export const migrations = [
  // 1: settings (key/value, last save wins).
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export function migrate(db) {
  const current = db.prepare('PRAGMA user_version').get().user_version;
  if (current > migrations.length) {
    throw new Error(`This data folder was saved by a newer version of The Grimoire (database version ${current}, this app knows ${migrations.length}). Update the app; nothing was changed.`);
  }
  for (let i = current; i < migrations.length; i++) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migrations[i]);
      db.exec(`PRAGMA user_version = ${i + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
```

- [ ] **Step 8: Write context.js, app.js, routes/index.js and index.js**

`server/context.js`:
```js
import { openDb } from './db/connection.js';

export function createContext(config) {
  const ctx = {
    config,
    db: openDb(config.dataDir),
    reopen() { ctx.db = openDb(config.dataDir); return ctx.db; },
  };
  return ctx;
}
```

`server/app.js`:
```js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiRouter } from './routes/index.js';
import { errorHandler, hostGuard } from './http.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function createApp(ctx, { onShutdown = () => {} } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); next(); });
  app.use('/api', hostGuard);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', apiRouter(ctx, { onShutdown }));
  const dist = path.join(ROOT, 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
```

`server/routes/index.js`:
```js
import { Router } from 'express';
import { HttpError } from '../http.js';

export function apiRouter(ctx, { onShutdown }) {
  const r = Router();
  r.get('/health', (req, res) => res.json({ ok: true, version: '0.1.0', demo: ctx.config.demo }));
  r.use((req, res, next) => next(new HttpError(404, 'No such API route')));
  return r;
}
```

`server/index.js`:
```js
import { loadConfig } from './config.js';
import { createContext } from './context.js';
import { createApp, ROOT } from './app.js';

const demo = process.argv.includes('--demo');
let config;
try {
  config = loadConfig({ root: ROOT, demo });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
let ctx;
try {
  ctx = createContext(config);
} catch (err) {
  console.error(`Could not open the data folder at ${config.dataDir}:`, err.message);
  process.exit(1);
}

let server;
function shutdown() {
  server?.close();
  try { ctx.db.close(); } catch {}
  process.exit(0);
}
const app = createApp(ctx, { onShutdown: shutdown });
server = app.listen(config.port, '127.0.0.1', () => {
  console.log(`The Grimoire${demo ? ' (demo)' : ''} is open at http://localhost:${config.port}`);
  console.log(`Data folder: ${config.dataDir}`);
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${config.port} is busy; The Grimoire is probably already running.`);
    process.exit(0);
  }
  throw err;
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 9: Run the tests to see them pass**

Run: `npx vitest run --project server`
Expected: PASS (config, health, validate).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "Set up the server, config and health check"
```

---

### Task 2: Versioned repository

**Files:**
- Create: `server/db/repo.js`, `server/db/repos.js`
- Modify: `server/db/migrations.js` (add migration 2), `server/http.js` (409 in `errorHandler`)
- Test: `tests/server/repo.test.js`, `tests/server/db.test.js`

**Interfaces:**
- Consumes: `migrations`, `TS`, `transaction`, `openDb` (Task 1).
- Produces: `class VersionConflict extends Error { current }`; `createRepo(db, table, columns, { orderBy }) → { table, get(id, { includeDeleted }), list(), listDeleted(), create(data), update(id, data, version), remove(id, stamp?), restore(id), purge(id) }`. `update` returns the row, `null` if missing, or throws `VersionConflict`. `remove` and `restore` return `true`/`false`; `purge` deletes only rows already in the Trash. `repos(db) → { traditions }`. Tables: `traditions`, `starter_removed`.

- [ ] **Step 1: Write the failing tests**

`tests/server/repo.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db/connection.js';
import { createRepo, VersionConflict } from '../../server/db/repo.js';

let dir, db, repo;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-repo-'));
  db = openDb(dir);
  repo = createRepo(db, 'traditions', ['name', 'description', 'color', 'sort_order', 'starter_key', 'is_starter'], { orderBy: 'sort_order, id' });
});
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('versioned repo', () => {
  it('creates rows at version 1', () => {
    expect(repo.create({ name: 'Eclectic' })).toMatchObject({ name: 'Eclectic', version: 1, deleted_at: null });
  });
  it('updates with the right version and bumps it', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.update(a.id, { name: 'B' }, 1)).toMatchObject({ name: 'B', version: 2 });
  });
  it('refuses a stale version and hands back the current row', () => {
    const a = repo.create({ name: 'A' });
    repo.update(a.id, { name: 'B' }, 1);
    let err;
    try { repo.update(a.id, { name: 'C' }, 1); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(VersionConflict);
    expect(err.current).toMatchObject({ name: 'B', version: 2 });
    expect(repo.get(a.id).name).toBe('B');
  });
  it('requires a version on update', () => {
    const a = repo.create({ name: 'A' });
    expect(() => repo.update(a.id, { name: 'B' })).toThrow(TypeError);
  });
  it('returns null when updating a missing or deleted row', () => {
    const a = repo.create({ name: 'A' });
    repo.remove(a.id);
    expect(repo.update(a.id, { name: 'B' }, 2)).toBeNull();
    expect(repo.update(999, { name: 'B' }, 1)).toBeNull();
  });
  it('soft-deletes, lists the Trash, and restores', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.remove(a.id)).toBe(true);
    expect(repo.list()).toEqual([]);
    expect(repo.listDeleted().map(r => r.id)).toEqual([a.id]);
    expect(repo.restore(a.id)).toBe(true);
    expect(repo.get(a.id)).toMatchObject({ deleted_at: null, version: 3 });
  });
  it('purges only rows already in the Trash', () => {
    const a = repo.create({ name: 'A' });
    expect(repo.purge(a.id)).toBe(false);
    repo.remove(a.id);
    expect(repo.purge(a.id)).toBe(true);
    expect(repo.get(a.id, { includeDeleted: true })).toBeNull();
  });
});
```

`tests/server/db.test.js`:
```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../../server/db/connection.js';
import { migrations } from '../../server/db/migrations.js';

describe('database', () => {
  it('migrates a fresh folder to the latest version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const db = openDb(dir);
    expect(db.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    expect(tables).toEqual(expect.arrayContaining(['settings', 'traditions', 'starter_removed']));
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('refuses a database from a newer app and leaves it alone', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-db-'));
    const raw = new DatabaseSync(path.join(dir, 'grimoire.db'));
    raw.exec(`PRAGMA user_version = ${migrations.length + 5}`);
    raw.close();
    expect(() => openDb(dir)).toThrow(/newer version/);
    const again = new DatabaseSync(path.join(dir, 'grimoire.db'));
    expect(again.prepare('PRAGMA user_version').get().user_version).toBe(migrations.length + 5);
    again.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project server tests/server/repo.test.js tests/server/db.test.js`
Expected: FAIL (`repo.js` missing, `traditions` table missing).

- [ ] **Step 3: Add migration 2**

Append to the `migrations` array in `server/db/migrations.js`:
```js
  // 2: traditions, and starter entries the owner deleted forever (so they are never seeded again).
  `
  CREATE TABLE traditions (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0, starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, ${TS});
  CREATE TABLE starter_removed (starter_key TEXT PRIMARY KEY, removed_at TEXT NOT NULL DEFAULT (datetime('now')));
  `,
```

- [ ] **Step 4: Write repo.js and repos.js**

`server/db/repo.js`:
```js
const bind = v => (typeof v === 'boolean' ? Number(v) : v);

export class VersionConflict extends Error {
  constructor(current) {
    super('This was changed somewhere else.');
    this.current = current;
  }
}

export function createRepo(db, table, columns, { orderBy = 'id' } = {}) {
  const pickKeys = data => columns.filter(k => data[k] !== undefined);

  function get(id, { includeDeleted = false } = {}) {
    const sql = `SELECT * FROM ${table} WHERE id = ?${includeDeleted ? '' : ' AND deleted_at IS NULL'}`;
    return db.prepare(sql).get(id) ?? null;
  }

  return {
    table,
    get,
    list() {
      return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL ORDER BY ${orderBy}`).all();
    },
    listDeleted() {
      return db.prepare(`SELECT * FROM ${table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC`).all();
    },
    create(data) {
      const keys = pickKeys(data);
      const sql = keys.length
        ? `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
        : `INSERT INTO ${table} DEFAULT VALUES`;
      const r = db.prepare(sql).run(...keys.map(k => bind(data[k])));
      return get(Number(r.lastInsertRowid));
    },
    // Saves only if the row is still at `version`. Returns the saved row, or null if it is gone.
    update(id, data, version) {
      if (!Number.isInteger(version)) throw new TypeError(`update(${table}) needs the version the row was read at`);
      const keys = pickKeys(data);
      const sets = [...keys.map(k => `${k} = ?`), 'version = version + 1', "updated_at = datetime('now')"];
      const r = db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ? AND version = ? AND deleted_at IS NULL`)
        .run(...keys.map(k => bind(data[k])), id, version);
      if (r.changes === 0) {
        const current = get(id);
        if (!current) return null;
        throw new VersionConflict(current);
      }
      return get(id);
    },
    remove(id, stamp = new Date().toISOString()) {
      return db.prepare(`UPDATE ${table} SET deleted_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL`).run(stamp, id).changes > 0;
    },
    restore(id) {
      return db.prepare(`UPDATE ${table} SET deleted_at = NULL, version = version + 1, updated_at = datetime('now') WHERE id = ? AND deleted_at IS NOT NULL`).run(id).changes > 0;
    },
    purge(id) {
      return db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id).changes > 0;
    },
  };
}
```

`server/db/repos.js`:
```js
import { createRepo } from './repo.js';

const cache = new WeakMap();

// One repo per table, cached per database handle (a restore opens a new handle).
export function repos(db) {
  let r = cache.get(db);
  if (!r) {
    r = {
      traditions: createRepo(db, 'traditions', ['name', 'description', 'color', 'sort_order', 'starter_key', 'is_starter'],
        { orderBy: 'sort_order, name COLLATE NOCASE, id' }),
    };
    cache.set(db, r);
  }
  return r;
}
```

- [ ] **Step 5: Map VersionConflict to 409 in http.js**

At the top of `server/http.js` add `import { VersionConflict } from './db/repo.js';` and make `errorHandler` start with:
```js
export function errorHandler(err, req, res, next) {
  if (err instanceof VersionConflict) {
    return res.status(409).json({ error: err.message, current: err.current });
  }
  const status = err.status || err.statusCode || 500;
```
(the rest unchanged).

- [ ] **Step 6: Run the tests to see them pass**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the versioned repository and traditions table"
```

---

### Task 3: CRUD routes, traditions and starter content

**Files:**
- Create: `server/routes/crud.js`, `server/routes/traditions.js`, `server/content/traditions.json`, `server/services/starter.js`
- Modify: `server/routes/index.js`, `server/context.js`
- Test: `tests/server/traditions.test.js`, `tests/server/starter.test.js`

**Interfaces:**
- Consumes: `repos(db).traditions`, `check`, `idParam`, `notFound`, `HttpError`, `transaction`, `VersionConflict` → 409.
- Produces: `crudRouter(ctx, { repo, schema, starter = false, beforeDelete })`. Routes: `GET /` list, `GET /:id`, `POST /` → 201 row, `PATCH /:id` with body `{ version, ...fields }` → row or 409 `{ error, current }`, `DELETE /:id` → `{ ok: true }`, `POST /:id/restore` → row. `TRADITION_SCHEMA`. `STARTER_SETS: { table, file, columns }[]`, `seedStarter(db, sets = STARTER_SETS) → number added`. API: `/api/traditions`.

- [ ] **Step 1: Write the failing tests**

`tests/server/traditions.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

describe('/api/traditions', () => {
  it('lists the three starter traditions', async () => {
    const res = await t.http().get('/api/traditions');
    expect(res.body.map(r => r.name)).toEqual(['Eclectic', 'Wiccan', 'Mexican folk']);
    expect(res.body.every(r => r.is_starter === 1)).toBe(true);
  });
  it('creates, reads, updates and deletes', async () => {
    const created = await t.http().post('/api/traditions').send({ name: 'Kitchen witchery', color: '#5b4430' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Kitchen witchery', version: 1, is_starter: 0 });
    const id = created.body.id;
    const upd = await t.http().patch(`/api/traditions/${id}`).send({ version: 1, description: 'Hearth and home' });
    expect(upd.body).toMatchObject({ description: 'Hearth and home', version: 2 });
    expect((await t.http().get(`/api/traditions/${id}`)).body.version).toBe(2);
    expect((await t.http().delete(`/api/traditions/${id}`)).body).toEqual({ ok: true });
    expect((await t.http().get(`/api/traditions/${id}`)).status).toBe(404);
    const back = await t.http().post(`/api/traditions/${id}/restore`);
    expect(back.body).toMatchObject({ id, deleted_at: null });
  });
  it('answers 409 with the current row for a stale version', async () => {
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'B' });
    const stale = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'C' });
    expect(stale.status).toBe(409);
    expect(stale.body.current).toMatchObject({ name: 'B', version: 2 });
  });
  it('needs a version to update', async () => {
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    const res = await t.http().patch(`/api/traditions/${a.id}`).send({ name: 'B' });
    expect(res.status).toBe(400);
    expect(res.body.details.version).toMatch(/version/i);
  });
  it('rejects bad input with per-field messages and writes nothing', async () => {
    const res = await t.http().post('/api/traditions').send({ name: '', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.details).toMatchObject({ name: 'Required', color: expect.any(String) });
    expect((await t.http().get('/api/traditions')).body).toHaveLength(3);
  });
  it('drops the Starter tag when a starter tradition is edited', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const w = list.find(r => r.name === 'Wiccan');
    const res = await t.http().patch(`/api/traditions/${w.id}`).send({ version: w.version, description: 'Mine now' });
    expect(res.body).toMatchObject({ is_starter: 0, starter_key: 'tradition.wiccan' });
  });
  it('ignores fields that are not in the schema', async () => {
    const res = await t.http().post('/api/traditions').send({ name: 'X', is_starter: 1, starter_key: 'hack', version: 9 });
    expect(res.body).toMatchObject({ is_starter: 0, starter_key: null, version: 1 });
  });
});
```

`tests/server/starter.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../../server/db/connection.js';
import { seedStarter } from '../../server/services/starter.js';
import { repos } from '../../server/db/repos.js';

let dir, db;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-seed-')); db = openDb(dir); });
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });

describe('seedStarter', () => {
  it('adds the starter traditions once', () => {
    expect(seedStarter(db)).toBe(3);
    expect(seedStarter(db)).toBe(0);
    expect(repos(db).traditions.list()).toHaveLength(3);
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
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project server tests/server/traditions.test.js tests/server/starter.test.js`
Expected: FAIL.

- [ ] **Step 3: Write the starter traditions**

`server/content/traditions.json` (original text):
```json
[
  {
    "starter_key": "tradition.eclectic",
    "name": "Eclectic",
    "description": "Practice gathered from many sources and shaped by your own experience, keeping what works for you.",
    "color": "#5b4430",
    "sort_order": 1
  },
  {
    "starter_key": "tradition.wiccan",
    "name": "Wiccan",
    "description": "A modern witchcraft religion that honors the God and the Goddess and keeps the eight sabbats of the Wheel of the Year.",
    "color": "#2f4a3a",
    "sort_order": 2
  },
  {
    "starter_key": "tradition.mexican-folk",
    "name": "Mexican folk",
    "description": "Folk practice from Mexico, including curanderismo, ofrendas for the dead, and devotion to the saints and the Virgin of Guadalupe.",
    "color": "#9a3b07",
    "sort_order": 3
  }
]
```

- [ ] **Step 4: Write starter.js**

```js
import fs from 'node:fs';
import path from 'node:path';
import { transaction } from '../db/connection.js';

const CONTENT = path.join(import.meta.dirname, '..', 'content');

// Later stages add their own sets (categories, correspondences, calendar dates).
export const STARTER_SETS = [
  { table: 'traditions', file: 'traditions.json', columns: ['name', 'description', 'color', 'sort_order'] },
];

// Adds starter entries that have never been in this database. Never touches an entry
// that exists (edited or in the Trash) or that the owner deleted forever.
export function seedStarter(db, sets = STARTER_SETS) {
  return transaction(db, () => {
    let added = 0;
    const removed = db.prepare('SELECT 1 FROM starter_removed WHERE starter_key = ?');
    for (const set of sets) {
      const entries = JSON.parse(fs.readFileSync(path.join(CONTENT, set.file), 'utf8'));
      const exists = db.prepare(`SELECT 1 FROM ${set.table} WHERE starter_key = ?`);
      const cols = [...set.columns, 'starter_key', 'is_starter'];
      const insert = db.prepare(`INSERT INTO ${set.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`);
      for (const e of entries) {
        if (exists.get(e.starter_key) || removed.get(e.starter_key)) continue;
        insert.run(...set.columns.map(c => e[c] ?? null), e.starter_key, 1);
        added++;
      }
    }
    return added;
  });
}
```

- [ ] **Step 5: Seed on open in context.js**

```js
import { openDb } from './db/connection.js';
import { seedStarter } from './services/starter.js';

// Opening (and reopening after a restore) always tops up starter content.
function open(dataDir) {
  const db = openDb(dataDir);
  seedStarter(db);
  return db;
}

export function createContext(config) {
  const ctx = {
    config,
    db: open(config.dataDir),
    reopen() { ctx.db = open(config.dataDir); return ctx.db; },
  };
  return ctx;
}
```

- [ ] **Step 6: Write crud.js**

```js
import { Router } from 'express';
import { check } from '../validate.js';
import { HttpError, idParam, notFound } from '../http.js';
import { transaction } from '../db/connection.js';

function versionOf(body) {
  const v = body?.version;
  if (!Number.isInteger(v) || v < 1) throw new HttpError(400, 'Please reload and try again.', { version: 'Missing version' });
  return v;
}

// Shared routes for one kind of record. `starter: true` drops the Starter tag on edit.
export function crudRouter(ctx, { repo, schema, starter = false, beforeDelete }) {
  const r = Router();
  const R = () => repo(ctx.db);

  r.get('/', (req, res) => res.json(R().list()));

  r.get('/:id', (req, res) => {
    const row = R().get(idParam(req));
    if (!row) throw notFound();
    res.json(row);
  });

  r.post('/', (req, res) => {
    const data = check(schema, req.body);
    res.status(201).json(transaction(ctx.db, () => R().create(data)));
  });

  r.patch('/:id', (req, res) => {
    const id = idParam(req);
    const version = versionOf(req.body);
    const data = check(schema, req.body, { partial: true });
    if (starter) data.is_starter = 0;
    const row = transaction(ctx.db, () => R().update(id, data, version));
    if (!row) throw notFound();
    res.json(row);
  });

  r.delete('/:id', (req, res) => {
    const id = idParam(req);
    transaction(ctx.db, () => {
      const row = R().get(id);
      if (!row) throw notFound();
      beforeDelete?.(ctx, row);
      R().remove(id);
    });
    res.json({ ok: true });
  });

  r.post('/:id/restore', (req, res) => {
    const id = idParam(req);
    const ok = transaction(ctx.db, () => R().restore(id));
    if (!ok) throw notFound('Nothing to restore');
    res.json(R().get(id));
  });

  return r;
}
```

- [ ] **Step 7: Write traditions.js and mount it**

`server/routes/traditions.js`:
```js
import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';

export const TRADITION_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  description: { type: 'string', maxLength: 600 },
  color: { type: 'string', pattern: /^#[0-9a-f]{6}$/i, patternHint: 'Use a color like #6e1f24' },
  sort_order: { type: 'int', min: 0, max: 10000 },
};

export const traditionsRouter = ctx => crudRouter(ctx, { repo: db => repos(db).traditions, schema: TRADITION_SCHEMA, starter: true });
```

In `server/routes/index.js` import it and add `r.use('/traditions', traditionsRouter(ctx));` before the 404 handler.

- [ ] **Step 8: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add shared record routes, traditions and starter content"
```

---

### Task 4: Backups, restore, shutdown and maintenance

**Files:**
- Create: `server/lib/recycle.js`, `server/services/backup.js`, `server/services/maintenance.js`, `server/routes/system.js`
- Modify: `server/routes/index.js`, `server/index.js`
- Test: `tests/server/backup.test.js`, `tests/server/system.test.js`

**Interfaces:**
- Consumes: `ctx`, `migrations`, `DB_FILE`, `HttpError`, `localOnly`, `check`.
- Produces: `sendToRecycleBin(file, { dataDir }) → 'recycled' | 'moved'`; `backupNow(db, dataDir, { kind = 'grimoire', now }) → { name, file }`; `listBackups(dataDir) → { name, size, modified }[]` newest first; `rotateBackups(dataDir, { keep = 30, discard }) → string[]`; `ensureTodayBackup(db, dataDir, now) → boolean`; `restoreBackup(ctx, name) → { restored, safetyCopy }`; `runMaintenance(ctx)`. API: `GET/POST /api/backups`, `POST /api/backups/restore { name }`, `GET /api/data-folder`, `POST /api/data-folder/open`, `POST /api/shutdown`.

- [ ] **Step 1: Write the failing tests**

`tests/server/backup.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { makeTestContext } from './helpers.js';
import { backupNow, listBackups, rotateBackups, ensureTodayBackup, restoreBackup } from '../../server/services/backup.js';
import { repos } from '../../server/db/repos.js';
import { migrations } from '../../server/db/migrations.js';

let t;
afterEach(() => t?.cleanup());

describe('backups', () => {
  it('writes grimoire-YYYY-MM-DD-HHMM.db and lists it', () => {
    t = makeTestContext();
    const { name } = backupNow(t.ctx.db, t.dataDir, { now: new Date(2026, 9, 14, 21, 5) });
    expect(name).toBe('grimoire-2026-10-14-2105.db');
    expect(listBackups(t.dataDir).map(b => b.name)).toEqual([name]);
  });
  it('never overwrites a backup made in the same minute', () => {
    t = makeTestContext();
    const now = new Date(2026, 9, 14, 21, 5);
    const a = backupNow(t.ctx.db, t.dataDir, { now });
    const b = backupNow(t.ctx.db, t.dataDir, { now });
    expect(b.name).toBe('grimoire-2026-10-14-2105-2.db');
    expect(fs.existsSync(a.file)).toBe(true);
  });
  it('works when the data folder path has an apostrophe and spaces', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grim o'neil "));
    t = makeTestContext({ dataDir: dir });
    const { file } = backupNow(t.ctx.db, dir);
    expect(fs.statSync(file).size).toBeGreaterThan(0);
  });
  it('keeps the newest 30 and discards the rest through the Recycle Bin hook', () => {
    t = makeTestContext();
    for (let i = 0; i < 33; i++) backupNow(t.ctx.db, t.dataDir, { now: new Date(2026, 0, 1 + i, 9, 0) });
    const discarded = [];
    const removed = rotateBackups(t.dataDir, { discard: f => { discarded.push(path.basename(f)); fs.rmSync(f); } });
    expect(removed).toHaveLength(3);
    expect(discarded).toEqual(['grimoire-2026-01-03-0900.db', 'grimoire-2026-01-02-0900.db', 'grimoire-2026-01-01-0900.db']);
    expect(listBackups(t.dataDir)).toHaveLength(30);
  });
  it('makes a start-of-day backup only once per day', () => {
    t = makeTestContext();
    const now = new Date(2026, 9, 14, 6, 0);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, now)).toBe(true);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, new Date(2026, 9, 14, 20, 0))).toBe(false);
    expect(ensureTodayBackup(t.ctx.db, t.dataDir, new Date(2026, 9, 15, 6, 0))).toBe(true);
  });
  it('restores a backup and keeps a safety copy of the data it replaced', () => {
    t = makeTestContext();
    const { name } = backupNow(t.ctx.db, t.dataDir);
    repos(t.ctx.db).traditions.create({ name: 'Added after backup' });
    const out = restoreBackup(t.ctx, name);
    expect(out.safetyCopy).toMatch(/^pre-restore-/);
    expect(repos(t.ctx.db).traditions.list().map(r => r.name)).not.toContain('Added after backup');
    const safety = new DatabaseSync(path.join(t.dataDir, 'backups', out.safetyCopy), { readOnly: true });
    expect(safety.prepare("SELECT count(*) AS n FROM traditions WHERE name = 'Added after backup'").get().n).toBe(1);
    safety.close();
  });
  it('refuses names that are not backups', () => {
    t = makeTestContext();
    expect(() => restoreBackup(t.ctx, '../grimoire.db')).toThrow(/not a Grimoire backup/);
  });
  it('refuses a backup from a newer app and changes nothing', () => {
    t = makeTestContext();
    const { name, file } = backupNow(t.ctx.db, t.dataDir);
    const raw = new DatabaseSync(file);
    raw.exec(`PRAGMA user_version = ${migrations.length + 1}`);
    raw.close();
    repos(t.ctx.db).traditions.create({ name: 'Still here' });
    expect(() => restoreBackup(t.ctx, name)).toThrow(/newer version/);
    expect(repos(t.ctx.db).traditions.list().map(r => r.name)).toContain('Still here');
  });
  it('refuses a damaged file', () => {
    t = makeTestContext();
    fs.writeFileSync(path.join(t.dataDir, 'backups', 'grimoire-2026-01-01-0900.db'), 'not a database');
    expect(() => restoreBackup(t.ctx, 'grimoire-2026-01-01-0900.db')).toThrow(/damaged/);
  });
});
```

`tests/server/system.test.js`:
```js
import { describe, it, expect, afterEach, vi } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('system routes', () => {
  it('backs up now and lists backups', async () => {
    t = makeTestContext();
    const made = await t.http().post('/api/backups');
    expect(made.status).toBe(201);
    const list = await t.http().get('/api/backups');
    expect(list.body.map(b => b.name)).toContain(made.body.name);
  });
  it('restores through the API', async () => {
    t = makeTestContext();
    const { body: b } = await t.http().post('/api/backups');
    await t.http().post('/api/traditions').send({ name: 'Gone after restore' });
    const res = await t.http().post('/api/backups/restore').send({ name: b.name });
    expect(res.status).toBe(200);
    const names = (await t.http().get('/api/traditions')).body.map(r => r.name);
    expect(names).not.toContain('Gone after restore');
  });
  it('backs up and calls onShutdown on POST /api/shutdown', async () => {
    const onShutdown = vi.fn();
    t = makeTestContext({ onShutdown });
    const res = await t.http().post('/api/shutdown');
    expect(res.body).toEqual({ ok: true });
    await new Promise(r => setImmediate(r));
    expect(onShutdown).toHaveBeenCalled();
    expect((await t.http().get('/api/backups')).body.length).toBe(1);
  });
  it('shows the data folder', async () => {
    t = makeTestContext();
    expect((await t.http().get('/api/data-folder')).body.path).toBe(t.dataDir);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project server tests/server/backup.test.js tests/server/system.test.js`
Expected: FAIL.

- [ ] **Step 3: Write recycle.js**

```js
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Sends a file to the Windows Recycle Bin so it can be brought back. If that isn't
// possible (another OS, or PowerShell is blocked), moves it to backups\_old instead.
// The path goes through an environment variable, never into the command text.
export function sendToRecycleBin(file, { dataDir }) {
  if (process.platform === 'win32') {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:GRIMOIRE_RECYCLE, 'OnlyErrorDialogs', 'SendToRecycleBin')"],
      { env: { ...process.env, GRIMOIRE_RECYCLE: file }, stdio: 'ignore', timeout: 30000 });
      if (!fs.existsSync(file)) return 'recycled';
    } catch (err) {
      console.error('Could not send a backup to the Recycle Bin; moving it to backups\\_old instead:', err.message);
    }
  }
  const old = path.join(dataDir, 'backups', '_old');
  fs.mkdirSync(old, { recursive: true });
  fs.renameSync(file, path.join(old, path.basename(file)));
  return 'moved';
}
```

- [ ] **Step 4: Write backup.js**

```js
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../http.js';
import { migrations } from '../db/migrations.js';
import { DB_FILE } from '../db/connection.js';
import { sendToRecycleBin } from '../lib/recycle.js';

const pad = n => String(n).padStart(2, '0');
const stampOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const dirOf = dataDir => path.join(dataDir, 'backups');
const NAME = /^(grimoire|pre-restore|pre-empty)-\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?\.db$/;
const sqlQuote = s => `'${s.replace(/'/g, "''")}'`;

export function backupNow(db, dataDir, { kind = 'grimoire', now = new Date() } = {}) {
  const dir = dirOf(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const base = `${kind}-${stampOf(now)}`;
  let name = `${base}.db`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${base}-${i}.db`;
  const file = path.join(dir, name);
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  try {
    db.exec(`VACUUM INTO ${sqlQuote(tmp)}`);
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  fs.utimesSync(file, now, now);
  return { name, file };
}

export function listBackups(dataDir) {
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n => NAME.test(n)).map(name => {
    const st = fs.statSync(path.join(dir, name));
    return { name, size: st.size, modified: st.mtime.toISOString() };
  }).sort((a, b) => b.modified.localeCompare(a.modified) || b.name.localeCompare(a.name));
}

export function rotateBackups(dataDir, { keep = 30, discard = f => sendToRecycleBin(f, { dataDir }) } = {}) {
  const extra = listBackups(dataDir).slice(keep);
  for (const b of extra) discard(path.join(dirOf(dataDir), b.name));
  return extra.map(b => b.name);
}

export function ensureTodayBackup(db, dataDir, now = new Date()) {
  const today = `grimoire-${stampOf(now).slice(0, 10)}-`;
  if (listBackups(dataDir).some(b => b.name.startsWith(today))) return false;
  backupNow(db, dataDir, { now });
  return true;
}

function checkBackupFile(file) {
  let probe;
  try {
    probe = new DatabaseSync(file, { readOnly: true });
    if (probe.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') return 'damaged';
    const v = probe.prepare('PRAGMA user_version').get().user_version;
    if (v > migrations.length) return 'newer';
    const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('settings','traditions')").all();
    return v >= 2 && tables.length === 2 ? 'ok' : 'foreign';
  } catch {
    return 'damaged';
  } finally {
    try { probe?.close(); } catch {}
  }
}

const removeSidecars = live => { for (const ext of ['-wal', '-shm']) { try { fs.rmSync(live + ext, { force: true }); } catch {} } };

export function restoreBackup(ctx, name) {
  if (!NAME.test(String(name))) throw new HttpError(400, 'That is not a Grimoire backup.');
  const dataDir = ctx.config.dataDir;
  const src = path.join(dirOf(dataDir), name);
  if (!fs.existsSync(src)) throw new HttpError(404, 'Backup not found.');
  const live = path.join(dataDir, DB_FILE);
  const tmp = `${live}.restore-tmp`;
  fs.copyFileSync(src, tmp);
  const verdict = checkBackupFile(tmp);
  if (verdict !== 'ok') {
    fs.rmSync(tmp, { force: true });
    const why = {
      damaged: 'That backup file is damaged, so nothing was changed.',
      newer: 'That backup was made by a newer version of The Grimoire. Update the app first; nothing was changed.',
      foreign: "That file isn't a Grimoire backup, so nothing was changed.",
    }[verdict];
    throw new HttpError(400, why);
  }
  let safety;
  try {
    safety = backupNow(ctx.db, dataDir, { kind: 'pre-restore' });
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
  ctx.db.close();
  let failure = null;
  try {
    removeSidecars(live);
    fs.renameSync(tmp, live);
  } catch (err) {
    failure = err;
    fs.rmSync(tmp, { force: true });
    try { fs.copyFileSync(safety.file, live); removeSidecars(live); } catch {}
  }
  const FAILED = 'Restore failed; your data was put back from the safety copy.';
  try {
    ctx.reopen();
  } catch {
    try {
      fs.copyFileSync(safety.file, live);
      removeSidecars(live);
      ctx.reopen();
    } catch {
      throw new HttpError(500, `Restore failed and the database could not be reopened. Restart The Grimoire; your safety copy is ${safety.name} in the backups folder.`);
    }
    throw new HttpError(500, FAILED);
  }
  if (failure) throw new HttpError(500, FAILED);
  return { restored: name, safetyCopy: safety.name };
}
```

- [ ] **Step 5: Write maintenance.js and system.js, mount, and call maintenance on start**

`server/services/maintenance.js`:
```js
import { ensureTodayBackup, rotateBackups } from './backup.js';

// Startup housekeeping. A failed step is logged and the app still runs.
export function runMaintenance(ctx) {
  const steps = [
    ['Start-of-day backup', () => ensureTodayBackup(ctx.db, ctx.config.dataDir)],
    ['Tidying old backups', () => rotateBackups(ctx.config.dataDir)],
  ];
  for (const [label, fn] of steps) {
    try { fn(); } catch (err) { console.error(`${label} failed (the app will still run):`, err); }
  }
}
```

`server/routes/system.js`:
```js
import { Router } from 'express';
import { spawn } from 'node:child_process';
import { localOnly } from '../http.js';
import { backupNow, listBackups, rotateBackups, restoreBackup } from '../services/backup.js';
import { check } from '../validate.js';

export function systemRouter(ctx, { onShutdown }) {
  const r = Router();
  r.get('/backups', localOnly, (req, res) => res.json(listBackups(ctx.config.dataDir)));
  r.post('/backups', localOnly, (req, res) => {
    const b = backupNow(ctx.db, ctx.config.dataDir);
    rotateBackups(ctx.config.dataDir);
    res.status(201).json({ name: b.name });
  });
  r.post('/backups/restore', localOnly, (req, res) => {
    const { name } = check({ name: 'string!' }, req.body);
    res.json(restoreBackup(ctx, name));
  });
  r.get('/data-folder', localOnly, (req, res) => res.json({ path: ctx.config.dataDir }));
  r.post('/data-folder/open', localOnly, (req, res) => {
    if (process.platform === 'win32') spawn('explorer.exe', [ctx.config.dataDir], { detached: true, stdio: 'ignore' }).unref();
    res.json({ path: ctx.config.dataDir, opened: process.platform === 'win32' });
  });
  r.post('/shutdown', localOnly, (req, res) => {
    try {
      backupNow(ctx.db, ctx.config.dataDir);
      rotateBackups(ctx.config.dataDir);
    } catch (err) {
      console.error('Backup before shutdown failed:', err);
    }
    res.json({ ok: true });
    setImmediate(onShutdown);
  });
  return r;
}
```

In `server/routes/index.js` add `r.use(systemRouter(ctx, { onShutdown }));` just before the 404 handler. In `server/index.js` import `runMaintenance` and call `runMaintenance(ctx);` right after the context is created.

- [ ] **Step 6: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add backups, restore, shutdown and startup maintenance"
```

---

### Task 5: Trash

**Files:**
- Create: `server/services/trash.js`, `server/routes/trash.js`
- Modify: `server/routes/index.js`
- Test: `tests/server/trash.test.js`

**Interfaces:**
- Consumes: `repos`, `transaction`, `backupNow`, `localOnly`, `HttpError`.
- Produces: `TRASH_TYPES: { [type]: { repo: db => repo, title: row => string } }` (later stages add entries); `listTrash(db) → { type, id, title, deleted_at }[]` newest first; `restoreFromTrash(db, type, id) → row`; `deleteForever(db, type, id) → true`; `emptyTrash(ctx) → { removed, backup }`. API: `GET /api/trash`, `POST /api/trash/:type/:id/restore`, `DELETE /api/trash/:type/:id`, `POST /api/trash/empty`.

- [ ] **Step 1: Write the failing test**

`tests/server/trash.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';
import { seedStarter } from '../../server/services/starter.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

const addAndDelete = async name => {
  const { body } = await t.http().post('/api/traditions').send({ name });
  await t.http().delete(`/api/traditions/${body.id}`);
  return body.id;
};

describe('/api/trash', () => {
  it('lists deleted records with type, title and date', async () => {
    const id = await addAndDelete('Old path');
    const res = await t.http().get('/api/trash');
    expect(res.body).toEqual([{ type: 'tradition', id, title: 'Old path', deleted_at: expect.any(String) }]);
  });
  it('restores from the Trash', async () => {
    const id = await addAndDelete('Back again');
    const res = await t.http().post(`/api/trash/tradition/${id}/restore`);
    expect(res.body).toMatchObject({ id, deleted_at: null });
    expect((await t.http().get('/api/trash')).body).toEqual([]);
  });
  it('deletes one record forever', async () => {
    const id = await addAndDelete('Gone');
    expect((await t.http().delete(`/api/trash/tradition/${id}`)).body).toEqual({ ok: true });
    expect((await t.http().get('/api/trash')).body).toEqual([]);
    expect((await t.http().post(`/api/traditions/${id}/restore`)).status).toBe(404);
  });
  it('will not delete forever a record that is not in the Trash', async () => {
    const { body } = await t.http().post('/api/traditions').send({ name: 'Alive' });
    expect((await t.http().delete(`/api/trash/tradition/${body.id}`)).status).toBe(404);
  });
  it('rejects unknown types', async () => {
    expect((await t.http().get('/api/trash/nope/1/restore')).status).toBe(404);
    expect((await t.http().delete('/api/trash/nope/1')).status).toBe(404);
  });
  it('empties the Trash after making a pre-empty backup', async () => {
    await addAndDelete('One');
    await addAndDelete('Two');
    const res = await t.http().post('/api/trash/empty');
    expect(res.body.removed).toBe(2);
    expect(res.body.backup).toMatch(/^pre-empty-/);
    expect((await t.http().get('/api/trash')).body).toEqual([]);
  });
  it('keeps a starter entry deleted forever from coming back', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const w = list.find(r => r.starter_key === 'tradition.wiccan');
    await t.http().delete(`/api/traditions/${w.id}`);
    await t.http().delete(`/api/trash/tradition/${w.id}`);
    expect(seedStarter(t.ctx.db)).toBe(0);
    expect((await t.http().get('/api/traditions')).body.map(r => r.name)).not.toContain('Wiccan');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project server tests/server/trash.test.js`
Expected: FAIL.

- [ ] **Step 3: Write trash.js (service)**

```js
import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { HttpError } from '../http.js';
import { backupNow } from './backup.js';

// Every kind of record that can be in the Trash. Later stages add theirs here.
export const TRASH_TYPES = {
  tradition: { repo: db => repos(db).traditions, title: row => row.name },
};

function typeOf(type) {
  if (!Object.hasOwn(TRASH_TYPES, type)) throw new HttpError(404, 'Unknown kind of record');
  return TRASH_TYPES[type];
}

export function listTrash(db) {
  return Object.entries(TRASH_TYPES)
    .flatMap(([type, t]) => t.repo(db).listDeleted().map(row => ({ type, id: row.id, title: t.title(row), deleted_at: row.deleted_at })))
    .sort((a, b) => b.deleted_at.localeCompare(a.deleted_at) || b.id - a.id);
}

export function restoreFromTrash(db, type, id) {
  const t = typeOf(type);
  const ok = transaction(db, () => t.repo(db).restore(id));
  if (!ok) throw new HttpError(404, 'That is not in the Trash.');
  return t.repo(db).get(id);
}

function purgeRow(db, repo, row) {
  if (row.starter_key) db.prepare('INSERT OR IGNORE INTO starter_removed (starter_key) VALUES (?)').run(row.starter_key);
  repo.purge(row.id);
}

export function deleteForever(db, type, id) {
  const t = typeOf(type);
  transaction(db, () => {
    const row = t.repo(db).get(id, { includeDeleted: true });
    if (!row || !row.deleted_at) throw new HttpError(404, 'That is not in the Trash.');
    purgeRow(db, t.repo(db), row);
  });
  return true;
}

export function emptyTrash(ctx) {
  const { name } = backupNow(ctx.db, ctx.config.dataDir, { kind: 'pre-empty' });
  const removed = transaction(ctx.db, () => {
    let n = 0;
    for (const t of Object.values(TRASH_TYPES)) {
      const repo = t.repo(ctx.db);
      for (const row of repo.listDeleted()) { purgeRow(ctx.db, repo, row); n++; }
    }
    return n;
  });
  return { removed, backup: name };
}
```

- [ ] **Step 4: Write routes/trash.js and mount it**

```js
import { Router } from 'express';
import { idParam, localOnly } from '../http.js';
import { listTrash, restoreFromTrash, deleteForever, emptyTrash } from '../services/trash.js';

export function trashRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listTrash(ctx.db)));
  r.post('/empty', localOnly, (req, res) => res.json(emptyTrash(ctx)));
  r.post('/:type/:id/restore', (req, res) => res.json(restoreFromTrash(ctx.db, req.params.type, idParam(req))));
  r.delete('/:type/:id', (req, res) => res.json({ ok: deleteForever(ctx.db, req.params.type, idParam(req)) }));
  return r;
}
```

In `server/routes/index.js`: `r.use('/trash', trashRouter(ctx));` before the system router.

- [ ] **Step 5: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add the Trash"
```

---

### Task 6: Settings and language packs

**Files:**
- Create: `server/services/settings.js`, `server/services/locales.js`, `server/routes/settings.js`, `server/routes/locales.js`
- Modify: `server/routes/index.js`
- Test: `tests/server/settings.test.js`, `tests/server/locales.test.js`

**Interfaces:**
- Consumes: `HttpError`, `transaction`.
- Produces: `defaultSettings() → { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone }`; `getSettings(db)`; `saveSettings(db, input, { languages: string[] })`; `listLocales(dataDir) → { code, name }[]` (English first); `readPack(dataDir, code, part: 'ui'|'content') → object`. API: `GET/PUT /api/settings`, `GET /api/locales`, `GET /api/locales/:code/:part`.

Pack format: `<dataDir>\locales\<code>\ui.json` is a flat object of string keys to strings, plus `"_name"` (the language's own name, like `"Español"`). `content.json` is a flat object keyed `<starter_key>.<field>`, like `"tradition.wiccan.name": "Wicca"`.

- [ ] **Step 1: Write the failing tests**

`tests/server/settings.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());

describe('/api/settings', () => {
  it('returns defaults', async () => {
    const res = await t.http().get('/api/settings');
    expect(res.body).toMatchObject({ language: 'en', theme: 'old-book', hemisphere: 'north' });
    expect(typeof res.body.time_zone).toBe('string');
  });
  it('saves valid values', async () => {
    const res = await t.http().put('/api/settings').send({ theme: 'book-folk', time_zone: 'Europe/Lisbon', hemisphere: 'south' });
    expect(res.body).toMatchObject({ theme: 'book-folk', time_zone: 'Europe/Lisbon', hemisphere: 'south' });
    expect((await t.http().get('/api/settings')).body.theme).toBe('book-folk');
  });
  it('rejects unknown keys and bad values and saves nothing', async () => {
    const res = await t.http().put('/api/settings').send({ theme: 'neon', time_zone: 'Mars/Base', colour: 'x', hemisphere: 'south' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.details).sort()).toEqual(['colour', 'theme', 'time_zone']);
    expect((await t.http().get('/api/settings')).body.hemisphere).toBe('north');
  });
  it('accepts a language only when its pack exists', async () => {
    expect((await t.http().put('/api/settings').send({ language: 'es' })).status).toBe(400);
    const dir = path.join(t.dataDir, 'locales', 'es');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'ui.json'), JSON.stringify({ _name: 'Español' }));
    expect((await t.http().put('/api/settings').send({ language: 'es' })).body.language).toBe('es');
  });
});
```

`tests/server/locales.test.js`:
```js
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
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project server tests/server/settings.test.js tests/server/locales.test.js`
Expected: FAIL.

- [ ] **Step 3: Write locales.js**

```js
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../http.js';

const CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const PARTS = new Set(['ui', 'content']);
const dirOf = dataDir => path.join(dataDir, 'locales');

function readJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('must hold a JSON object');
  return data;
}

// English is built in. A pack counts only if its folder name is a language code and
// its ui.json parses and names the language in "_name". Broken packs are skipped.
export function listLocales(dataDir) {
  const out = [{ code: 'en', name: 'English' }];
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return out;
  for (const code of fs.readdirSync(dir).sort()) {
    if (!CODE.test(code) || code === 'en') continue;
    const file = path.join(dir, code, 'ui.json');
    if (!fs.existsSync(file)) continue;
    try {
      const ui = readJson(file);
      if (typeof ui._name !== 'string' || !ui._name.trim()) throw new Error('"_name" is missing');
      out.push({ code, name: ui._name.trim() });
    } catch (err) {
      console.warn(`Skipping the language pack in ${path.join(dir, code)}: ${err.message}`);
    }
  }
  return out;
}

export function readPack(dataDir, code, part) {
  if (!PARTS.has(part) || code === 'en' || !listLocales(dataDir).some(l => l.code === code)) throw new HttpError(404, 'No such language pack');
  const file = path.join(dirOf(dataDir), code, `${part}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    return readJson(file);
  } catch (err) {
    console.warn(`Could not read ${file}: ${err.message}`);
    return {};
  }
}
```

- [ ] **Step 4: Write settings.js (service)**

```js
import { HttpError } from '../http.js';
import { transaction } from '../db/connection.js';

const machineZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export function defaultSettings() {
  return { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone: machineZone() };
}

const ZONES = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);
const RULES = {
  language: (v, { languages }) => languages.includes(v),
  theme: v => ['old-book', 'book-folk'].includes(v),
  hemisphere: v => ['north', 'south'].includes(v),
  time_zone: v => ZONES.has(v),
};

export function getSettings(db) {
  const defaults = defaultSettings();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const saved = Object.fromEntries(rows.filter(r => Object.hasOwn(defaults, r.key)).map(r => [r.key, r.value]));
  return { ...defaults, ...saved };
}

// Settings are whole values saved together; the last save wins.
export function saveSettings(db, input, { languages = ['en'] } = {}) {
  const errors = Object.create(null);
  const clean = Object.create(null);
  for (const [k, v] of Object.entries(input ?? {})) {
    if (!Object.hasOwn(RULES, k)) { errors[k] = 'Unknown setting'; continue; }
    const norm = typeof v === 'string' ? v.trim() : '';
    if (!RULES[k](norm, { languages })) errors[k] = 'Not a valid value';
    else clean[k] = norm;
  }
  if (Object.keys(errors).length) throw new HttpError(400, 'Please fix the highlighted fields.', { ...errors });
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  transaction(db, () => { for (const [k, v] of Object.entries(clean)) up.run(k, v); });
  return getSettings(db);
}
```

- [ ] **Step 5: Write the routes and mount them**

`server/routes/settings.js`:
```js
import { Router } from 'express';
import { getSettings, saveSettings } from '../services/settings.js';
import { listLocales } from '../services/locales.js';

export function settingsRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(getSettings(ctx.db)));
  r.put('/', (req, res) => {
    const languages = listLocales(ctx.config.dataDir).map(l => l.code);
    res.json(saveSettings(ctx.db, req.body, { languages }));
  });
  return r;
}
```

`server/routes/locales.js`:
```js
import { Router } from 'express';
import { listLocales, readPack } from '../services/locales.js';

export function localesRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listLocales(ctx.config.dataDir)));
  r.get('/:code/:part', (req, res) => res.json(readPack(ctx.config.dataDir, req.params.code, req.params.part)));
  return r;
}
```

Mount in `server/routes/index.js`: `r.use('/settings', settingsRouter(ctx)); r.use('/locales', localesRouter(ctx));`.

- [ ] **Step 6: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add settings and language packs"
```

---

### Task 7: Client data layer

**Files:**
- Create: `client/src/lib/api.js`, `client/src/lib/useResource.js`
- Test: `tests/client/useResource.test.jsx`

**Interfaces:**
- Produces: `class ApiError extends Error { status, details, current }`; `api.get/post/put/patch/del(url, body?)`. `useResource(url) → { data, error, loading, reload(), save(body, { method = 'patch', to = url }), act(fn) }`.
  - A read's reply is applied only if no newer read or save has started since.
  - `save` applies its reply to `data`, drops any read in flight, and returns the saved data. It throws `ApiError` on failure (a 409 carries `current`).
  - `act(fn)` runs `fn()` (any API call) and then `reload()`; use it for lists.
  - When `url` changes, the data is cleared and replies for the old url are ignored.

- [ ] **Step 1: Write the failing test**

`tests/client/useResource.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useResource } from '../../client/src/lib/useResource.js';

// A fetch whose replies we release by hand, in any order.
function manualFetch() {
  const calls = [];
  const fn = vi.fn((url, opts = {}) => new Promise(resolve => {
    calls.push({ url, method: opts.method ?? 'GET', body: opts.body, reply: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) });
  }));
  return { fn, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('useResource', () => {
  it('loads data', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    expect(result.current.loading).toBe(true);
    await act(async () => f.calls[0].reply({ v: 1 }));
    expect(result.current).toMatchObject({ data: { v: 1 }, loading: false, error: null });
  });

  it('ignores a read that started before a save, even if it lands after', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ name: 'first', version: 1 }));
    act(() => { result.current.reload(); });               // slow read #2 starts
    let saving;
    act(() => { saving = result.current.save({ name: 'saved', version: 1 }); });
    await act(async () => { f.calls[2].reply({ name: 'saved', version: 2 }); await saving; });
    await act(async () => f.calls[1].reply({ name: 'stale', version: 1 }));  // old read lands late
    expect(result.current.data).toEqual({ name: 'saved', version: 2 });
  });

  it('ignores an older read when a newer read finishes first', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    act(() => { result.current.reload(); });
    await act(async () => f.calls[1].reply({ n: 2 }));
    await act(async () => f.calls[0].reply({ n: 1 }));
    expect(result.current.data).toEqual({ n: 2 });
  });

  it('drops replies for an old url', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result, rerender } = renderHook(({ url }) => useResource(url), { initialProps: { url: '/api/a' } });
    rerender({ url: '/api/b' });
    expect(result.current.data).toBeNull();
    await act(async () => f.calls[0].reply({ from: 'a' }));
    expect(result.current.data).toBeNull();
    await act(async () => f.calls[1].reply({ from: 'b' }));
    expect(result.current.data).toEqual({ from: 'b' });
  });

  it('shows a plain error when the server is unreachable, and recovers on reload', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useResource('/api/x'));
    await waitFor(() => expect(result.current.error?.message).toMatch(/Can't reach The Grimoire/));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await act(async () => { await result.current.reload(); });
    expect(result.current).toMatchObject({ data: { ok: 1 }, error: null });
  });

  it('throws a 409 with the current record from save and keeps the old data', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ name: 'A', version: 1 }));
    let err;
    await act(async () => {
      const p = result.current.save({ name: 'B', version: 1 }).catch(e => { err = e; });
      f.calls[1].reply({ error: 'This was changed somewhere else.', current: { name: 'Z', version: 2 } }, 409);
      await p;
    });
    expect(err.status).toBe(409);
    expect(err.current).toEqual({ name: 'Z', version: 2 });
    expect(result.current.data).toEqual({ name: 'A', version: 1 });
  });

  it('reloads after an action', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/list'));
    await act(async () => f.calls[0].reply([1]));
    await act(async () => {
      const done = result.current.act(() => Promise.resolve('did it'));
      await vi.waitFor(() => expect(f.calls).toHaveLength(2));
      f.calls[1].reply([1, 2]);
      expect(await done).toBe('did it');
    });
    expect(result.current.data).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project client tests/client/useResource.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Write api.js**

```js
export class ApiError extends Error {
  constructor(message, status, details, current) {
    super(message);
    this.status = status;
    this.details = details ?? {};
    this.current = current ?? null;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch {
    throw new ApiError("Can't reach The Grimoire. It may be closed for the night; start it and try again.", 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.details, data?.current);
  return data;
}

export const api = {
  get: url => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: url => request('DELETE', url),
};
```

- [ ] **Step 4: Write useResource.js**

```js
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';

let counter = 0;
const nextTicket = () => ++counter;

// All loading and saving goes through here. Each read gets a ticket; its reply is used
// only if it still holds the newest ticket. A save takes a new ticket when it starts and
// again when it finishes, so no read that was in flight can paint over the saved record.
export function useResource(url) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(url) });
  const ticket = useRef(0);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  const reload = useCallback(() => {
    if (!url) {
      ticket.current = nextTicket();
      setState({ data: null, error: null, loading: false });
      return Promise.resolve();
    }
    const mine = nextTicket();
    ticket.current = mine;
    setState(s => ({ ...s, loading: true }));
    const current = () => live.current && ticket.current === mine;
    return api.get(url).then(
      data => { if (current()) setState({ data, error: null, loading: false }); },
      error => { if (current()) setState(s => ({ data: s.data, error, loading: false })); },
    );
  }, [url]);

  useEffect(() => {
    setState({ data: null, error: null, loading: Boolean(url) });
    reload();
  }, [url, reload]);

  const save = useCallback(async (body, { method = 'patch', to = url } = {}) => {
    ticket.current = nextTicket();
    const data = await api[method](to, body);
    if (live.current) {
      ticket.current = nextTicket();
      setState({ data, error: null, loading: false });
    }
    return data;
  }, [url]);

  const act = useCallback(async fn => {
    const out = await fn();
    await reload();
    return out;
  }, [reload]);

  return { ...state, reload, save, act };
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `npx vitest run --project client tests/client/useResource.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add the client data hook that drops out-of-date replies"
```

---

### Task 8: Forms: leave guard, conflicts, shared components

**Files:**
- Create: `client/src/components/Button.jsx`, `Dialog.jsx`, `Field.jsx`, `ConfirmProvider.jsx`, `ToastProvider.jsx`, `LoadState.jsx`, `ConflictDialog.jsx`; `client/src/lib/useLeaveGuard.js`, `client/src/lib/useRecordForm.js`
- Test: `tests/client/useRecordForm.test.jsx`, `tests/client/LoadState.test.jsx`

**Interfaces:**
- Consumes: `ApiError`.
- Produces:
  - `Button`, `Dialog`, `Field` / `TextInput` / `TextArea` / `Select` / `Checkbox`, `ConfirmProvider` + `useConfirm() → confirm({ title, body, confirmLabel, cancelLabel, danger }) → Promise<boolean>`, `ToastProvider` + `useToast().show({ message, action, duration })`. These are copied from The Apothecary.
  - `useLeaveGuard(dirty) → markSaved()` blocks in-app navigation and warns on tab close.
  - `useRecordForm({ initial, submit }) → { values, set(key, value), setAll(values), dirty, errors, formError, saving, conflict, onSubmit(event?), keepMine(), takeTheirs(pick), markSaved }`. `submit(values, { version }) → Promise<savedRecord>`; `version` is `undefined` normally and the server's version when keeping your own copy after a conflict. `takeTheirs(pick)` resets the form to `pick(conflict)`.
  - `LoadState({ loading, error, onRetry, children })` shows a loading line, or the error with **Try again**, or the children.
  - `ConflictDialog({ conflict, onKeepMine, onTakeTheirs })`.

- [ ] **Step 1: Copy the shared components from The Apothecary**

```bash
for f in Button Dialog Field ConfirmProvider ToastProvider; do cp ../the-apothecary/client/src/components/$f.jsx client/src/components/$f.jsx; done
```
In `ConfirmProvider.jsx` change the cancel button text from `Keep it` to `{req.cancelLabel ?? t('common.cancel')}` once Task 9 adds `t()`. Until then use `{req.cancelLabel ?? 'Cancel'}`.

- [ ] **Step 2: Write the failing tests**

`tests/client/useRecordForm.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { useRecordForm } from '../../client/src/lib/useRecordForm.js';
import { ApiError } from '../../client/src/lib/api.js';

function Form({ submit }) {
  const f = useRecordForm({ initial: { name: 'A' }, submit });
  return (
    <form onSubmit={f.onSubmit}>
      <input aria-label="Name" value={f.values.name} onChange={e => f.set('name', e.target.value)} />
      <button type="submit" disabled={f.saving}>Save</button>
      {f.formError && <p role="alert">{f.formError}</p>}
      {f.errors.name && <p>{f.errors.name}</p>}
      {f.conflict && <button type="button" onClick={f.keepMine}>Keep mine</button>}
      {f.conflict && <button type="button" onClick={() => f.takeTheirs(c => ({ name: c.name }))}>Take theirs</button>}
      <span data-testid="dirty">{String(f.dirty)}</span>
      <Link to="/elsewhere">Away</Link>
    </form>
  );
}

const setup = submit => {
  const router = createMemoryRouter([
    { path: '/', element: <ConfirmProvider><Form submit={submit} /></ConfirmProvider> },
    { path: '/elsewhere', element: <p>Elsewhere</p> },
  ]);
  render(<RouterProvider router={router} />);
  return router;
};

describe('useRecordForm', () => {
  it('tracks unsaved changes and clears them after saving', async () => {
    const submit = vi.fn(async v => ({ ...v, version: 2 }));
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
    await userEvent.click(screen.getByText('Save'));
    expect(submit).toHaveBeenCalledWith({ name: 'AB' }, { version: undefined });
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('asks before leaving with unsaved changes', async () => {
    setup(vi.fn());
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Name')).toHaveValue('AB');
  });

  it('lets you leave freely when nothing changed', async () => {
    setup(vi.fn());
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('shows field errors and keeps the values on a 400', async () => {
    setup(vi.fn(async () => { throw new ApiError('Please fix the highlighted fields.', 400, { name: 'Required' }); }));
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('A');
  });

  it('keeps the form filled in when the server is unreachable', async () => {
    setup(vi.fn(async () => { throw new ApiError("Can't reach The Grimoire.", 0); }));
    await userEvent.type(screen.getByLabelText('Name'), 'Z');
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach The Grimoire.");
    expect(screen.getByLabelText('Name')).toHaveValue('AZ');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
  });

  it('on a conflict, Keep mine saves again at the server version', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiError('changed', 409, {}, { name: 'Theirs', version: 5 }))
      .mockResolvedValueOnce({ name: 'AB', version: 6 });
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Keep mine'));
    expect(submit).toHaveBeenLastCalledWith({ name: 'AB' }, { version: 5 });
    expect(screen.queryByText('Keep mine')).not.toBeInTheDocument();
  });

  it('on a conflict, Take theirs loads the server copy', async () => {
    setup(vi.fn().mockRejectedValueOnce(new ApiError('changed', 409, {}, { name: 'Theirs', version: 5 })));
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Take theirs'));
    expect(screen.getByLabelText('Name')).toHaveValue('Theirs');
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('ignores a second submit while saving', async () => {
    let release;
    const submit = vi.fn(() => new Promise(r => { release = r; }));
    setup(submit);
    const form = screen.getByLabelText('Name').closest('form');
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => release({ name: 'A', version: 2 }));
  });
});
```

`tests/client/LoadState.test.jsx`:
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadState } from '../../client/src/components/LoadState.jsx';

describe('LoadState', () => {
  it('shows loading', () => {
    render(<LoadState loading><p>Body</p></LoadState>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
  it('shows the error and Try again', async () => {
    const onRetry = vi.fn();
    render(<LoadState error={new Error("Can't reach The Grimoire.")} onRetry={onRetry}><p>Body</p></LoadState>);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach The Grimoire.");
    await userEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
  it('shows the children once loaded', () => {
    render(<LoadState><p>Body</p></LoadState>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run --project client`
Expected: FAIL.

- [ ] **Step 4: Write useLeaveGuard.js**

```js
import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '../components/ConfirmProvider.jsx';

// Asks before leaving a form with unsaved changes, inside the app and when closing the tab.
// Call markSaved() right before navigating away after a successful save.
export function useLeaveGuard(dirty) {
  const confirm = useConfirm();
  const saved = useRef(false);
  useEffect(() => { if (dirty) saved.current = false; }, [dirty]);
  const blocker = useBlocker(() => dirty && !saved.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    confirm({ title: 'Leave without saving?', body: 'Your changes will be lost.', confirmLabel: 'Leave', danger: true })
      .then(ok => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, confirm]);
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
  return () => { saved.current = true; };
}
```

- [ ] **Step 5: Write useRecordForm.js**

```js
import { useCallback, useRef, useState } from 'react';
import { useLeaveGuard } from './useLeaveGuard.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useRecordForm({ initial, submit }) {
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const busy = useRef(false);
  const dirty = !same(values, baseline);
  const markSaved = useLeaveGuard(dirty);

  const set = useCallback((key, value) => setValues(v => ({ ...v, [key]: value })), []);
  const setAll = useCallback(next => { setValues(next); setBaseline(next); }, []);

  const run = useCallback(async version => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = await submit(values, { version });
      setBaseline(values);
      setConflict(null);
      return saved;
    } catch (err) {
      if (err.status === 409 && err.current) setConflict(err.current);
      else if (err.status === 400 && err.details && Object.keys(err.details).length) setErrors(err.details);
      else setFormError(err.message);
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [submit, values]);

  const onSubmit = useCallback(e => { e?.preventDefault?.(); return run(undefined); }, [run]);
  const keepMine = useCallback(() => run(conflict?.version), [run, conflict]);
  const takeTheirs = useCallback(pick => { setAll(pick(conflict)); setConflict(null); }, [conflict, setAll]);

  return { values, set, setAll, dirty, errors, formError, saving, conflict, onSubmit, keepMine, takeTheirs, markSaved };
}
```

- [ ] **Step 6: Write LoadState.jsx and ConflictDialog.jsx**

`client/src/components/LoadState.jsx`:
```jsx
import { Button } from './Button.jsx';

export function LoadState({ loading = false, error = null, onRetry, children }) {
  if (error) {
    return (
      <div className="load-error" role="alert">
        <p>{error.message}</p>
        {onRetry && <Button onClick={onRetry}>Try again</Button>}
      </div>
    );
  }
  if (loading) return <p className="loading" role="status">Loading…</p>;
  return children;
}
```

`client/src/components/ConflictDialog.jsx`:
```jsx
import { Dialog } from './Dialog.jsx';
import { Button } from './Button.jsx';

export function ConflictDialog({ conflict, onKeepMine, onTakeTheirs }) {
  return (
    <Dialog open={Boolean(conflict)} onClose={onTakeTheirs} title="This was changed somewhere else"
      footer={(
        <>
          <Button variant="ghost" onClick={onTakeTheirs} data-autofocus="">Reload the latest</Button>
          <Button variant="danger" onClick={onKeepMine}>Keep mine and save over it</Button>
        </>
      )}>
      <p>Another window saved this after you opened it. Reload to see the latest, or keep your version and save over it.</p>
    </Dialog>
  );
}
```

- [ ] **Step 7: Run the client tests**

Run: `npx vitest run --project client`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add form guards, conflict handling and load states"
```

---

### Task 9: Translations, themes and the app shell

**Files:**
- Create: `client/index.html`, `client/public/favicon.svg`, `client/public/manifest.webmanifest`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/i18n/en.json`, `client/src/i18n/I18nProvider.jsx`, `client/src/components/SettingsProvider.jsx`, `client/src/components/Layout.jsx`, `client/src/components/Sidebar.jsx`, `client/src/components/Ornaments.jsx`, `client/src/components/PageHeader.jsx`, `client/src/screens/Placeholder.jsx`, `client/src/screens/NotFound.jsx`, `client/src/theme/tokens.css`, `client/src/theme/global.css`
- Modify: `client/src/components/ConfirmProvider.jsx`, `LoadState.jsx`, `ConflictDialog.jsx`, `client/src/lib/useLeaveGuard.js` (use `t()`)
- Test: `tests/client/i18n.test.jsx`, `tests/client/shell.test.jsx`, `tests/client/contrast.test.js`

**Interfaces:**
- Consumes: `useResource`, `/api/settings`, `/api/locales/:code/ui|content`, `/api/health`.
- Produces: `I18nProvider({ language, children })`; `useT() → { t(key, vars?), tc(starterKey, field, fallback), language }`. `t` falls back to English, then to the key itself. `SettingsProvider` + `useSettings() → { settings, reload, save(values) }`; it sets `document.documentElement.dataset.theme` and `lang`. `SECTIONS` (sidebar items). `Placeholder({ titleKey, stage })`. CSS tokens listed in Step 6.

- [ ] **Step 1: Write the failing tests**

`tests/client/i18n.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider, useT } from '../../client/src/i18n/I18nProvider.jsx';

function Show() {
  const { t, tc } = useT();
  return <p>{t('nav.today')} | {t('trash.count', { n: 3 })} | {t('no.such.key')} | {tc('tradition.wiccan', 'name', 'Wiccan')}</p>;
}
afterEach(() => vi.unstubAllGlobals());

describe('translations', () => {
  it('uses English by default and falls back to the key', () => {
    render(<I18nProvider language="en"><Show /></I18nProvider>);
    expect(screen.getByText('Today | 3 items | no.such.key | Wiccan')).toBeInTheDocument();
  });
  it('uses a language pack, falling back to English for missing keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(
      url.endsWith('/ui') ? { _name: 'Español', 'nav.today': 'Hoy' } : { 'tradition.wiccan.name': 'Wicca' },
    ), { status: 200 })));
    render(<I18nProvider language="es"><Show /></I18nProvider>);
    expect(await screen.findByText('Hoy | 3 items | no.such.key | Wicca')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('es');
  });
  it('stays in English if the pack cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    render(<I18nProvider language="es"><Show /></I18nProvider>);
    expect(await screen.findByText('Today | 3 items | no.such.key | Wiccan')).toBeInTheDocument();
  });
});
```

`tests/client/shell.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { App } from '../../client/src/App.jsx';

const SETTINGS = { language: 'en', theme: 'book-folk', hemisphere: 'north', time_zone: 'UTC' };
function stubApi(overrides = {}) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    const body = overrides[url] ?? { '/api/settings': SETTINGS, '/api/health': { ok: true, demo: false } }[url] ?? [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

describe('app shell', () => {
  it('shows the sidebar sections in order', async () => {
    stubApi();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual(
      ['Today', 'Book of Spells', 'Correspondences', 'Calendar', 'Rituals', 'Journal', 'Trash', 'Settings']);
  });
  it('applies the saved theme to the page', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Sections' });
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('book-folk'));
    expect(document.querySelector('.papel-picado')).not.toBeNull();
  });
  it('shows a placeholder for sections built later', async () => {
    stubApi();
    window.history.pushState({}, '', '/rituals');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Rituals' })).toBeInTheDocument();
    expect(screen.getByText(/Stage 5/)).toBeInTheDocument();
  });
  it('shows Not found for unknown pages', async () => {
    stubApi();
    window.history.pushState({}, '', '/nope');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
```

`tests/client/contrast.test.js`:
```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const css = fs.readFileSync(path.resolve('client/src/theme/tokens.css'), 'utf8');
const block = selector => {
  const start = css.indexOf(`${selector} {`);
  return Object.fromEntries([...css.slice(start, css.indexOf('}', start)).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(m => [m[1], m[2]]));
};
const lum = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const PAIRS = [['ink', 'parchment'], ['ink-soft', 'parchment'], ['accent-ink', 'parchment'], ['ink', 'parchment-deep'],
  ['text-on-leather', 'leather-800'], ['text-on-leather', 'leather-900'], ['oxblood', 'parchment']];

describe('theme contrast (WCAG AA, 4.5:1)', () => {
  const base = block(':root');
  const folk = { ...base, ...block("[data-theme='book-folk']") };
  for (const [name, tokens] of [['old-book', base], ['book-folk', folk]]) {
    for (const [fg, bg] of PAIRS) {
      it(`${name}: ${fg} on ${bg}`, () => {
        expect(tokens[fg], `--${fg} missing`).toBeDefined();
        expect(ratio(tokens[fg], tokens[bg])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project client`
Expected: FAIL.

- [ ] **Step 3: Write en.json and I18nProvider.jsx**

`client/src/i18n/en.json`:
```json
{
  "app.name": "The Grimoire",
  "nav.label": "Sections",
  "nav.today": "Today",
  "nav.spells": "Book of Spells",
  "nav.correspondences": "Correspondences",
  "nav.calendar": "Calendar",
  "nav.rituals": "Rituals",
  "nav.journal": "Journal",
  "nav.trash": "Trash",
  "nav.settings": "Settings",
  "nav.open": "Open the menu",
  "nav.close": "Close the menu",
  "nav.skip": "Skip to content",
  "demo.ribbon": "Demo",
  "placeholder.coming": "This part of the book is written in Stage {stage}.",
  "notfound.title": "Page not found",
  "notfound.body": "That page isn't in this book.",
  "notfound.home": "Back to Today",
  "common.save": "Save",
  "common.saving": "Saving…",
  "common.saved": "Saved",
  "common.cancel": "Cancel",
  "common.add": "Add",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.undo": "Undo",
  "common.loading": "Loading…",
  "common.tryAgain": "Try again",
  "common.starter": "Starter",
  "leave.title": "Leave without saving?",
  "leave.body": "Your changes will be lost.",
  "leave.confirm": "Leave",
  "conflict.title": "This was changed somewhere else",
  "conflict.body": "Another window saved this after you opened it. Reload to see the latest, or keep your version and save over it.",
  "conflict.reload": "Reload the latest",
  "conflict.keep": "Keep mine and save over it",
  "settings.title": "Settings",
  "settings.general": "General",
  "settings.language": "Language",
  "settings.theme": "Look",
  "settings.theme.old-book": "Old Book",
  "settings.theme.book-folk": "Book & Folk",
  "settings.hemisphere": "Hemisphere",
  "settings.hemisphere.north": "Northern",
  "settings.hemisphere.south": "Southern",
  "settings.timeZone": "Time zone",
  "settings.dataFolder": "Data folder",
  "settings.openFolder": "Open folder",
  "traditions.title": "Traditions",
  "traditions.add": "Add a tradition",
  "traditions.edit": "Edit tradition",
  "traditions.name": "Name",
  "traditions.description": "Description",
  "traditions.color": "Color",
  "traditions.empty": "No traditions yet.",
  "traditions.deleted": "Moved {name} to the Trash.",
  "backups.title": "Backups",
  "backups.now": "Back up now",
  "backups.made": "Backup made: {name}",
  "backups.restore": "Restore",
  "backups.restoreTitle": "Restore this backup?",
  "backups.restoreBody": "Your data goes back to {name}. A safety copy of what you have now is saved first.",
  "backups.none": "No backups yet.",
  "trash.title": "Trash",
  "trash.empty": "The Trash is empty.",
  "trash.count": "{n} items",
  "trash.restore": "Restore",
  "trash.restored": "Restored {title}.",
  "trash.deleteForever": "Delete forever",
  "trash.deleteForeverTitle": "Delete {title} forever?",
  "trash.deleteForeverBody": "This can't be undone.",
  "trash.emptyAll": "Empty the Trash",
  "trash.emptyAllTitle": "Empty the Trash?",
  "trash.emptyAllBody": "Everything in the Trash is deleted forever. A backup is made first.",
  "trash.type.tradition": "Tradition"
}
```

`client/src/i18n/I18nProvider.jsx`:
```jsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text);
const Ctx = createContext(null);

export function I18nProvider({ language = 'en', children }) {
  const [pack, setPack] = useState({ code: 'en', ui: {}, content: {} });

  useEffect(() => {
    let live = true;
    document.documentElement.lang = language;
    if (language === 'en') { setPack({ code: 'en', ui: {}, content: {} }); return undefined; }
    const get = part => fetch(`/api/locales/${encodeURIComponent(language)}/${part}`).then(r => (r.ok ? r.json() : {}));
    Promise.all([get('ui'), get('content')]).then(
      ([ui, content]) => live && setPack({ code: language, ui, content }),
      () => live && setPack({ code: 'en', ui: {}, content: {} }),
    );
    return () => { live = false; };
  }, [language]);

  const t = useCallback((key, vars) => fill(pack.ui[key] ?? en[key] ?? key, vars), [pack]);
  const tc = useCallback((starterKey, field, fallback) => (starterKey && pack.content[`${starterKey}.${field}`]) || fallback, [pack]);
  const value = useMemo(() => ({ t, tc, language: pack.code }), [t, tc, pack.code]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Works outside a provider too (tests, early errors): plain English.
export function useT() {
  return useContext(Ctx) ?? { t: (k, v) => fill(en[k] ?? k, v), tc: (s, f, fb) => fb, language: 'en' };
}
```

Then switch the hard-coded English in `ConfirmProvider.jsx` (`'Cancel'`), `LoadState.jsx` (`'Loading…'`, `'Try again'`), `ConflictDialog.jsx` (title, body, both buttons) and `useLeaveGuard.js` (title, body, `Leave`) to `t('…')` with the keys above, using `const { t } = useT();`.

- [ ] **Step 4: Write SettingsProvider.jsx**

```jsx
import { createContext, useCallback, useContext, useEffect } from 'react';
import { useResource } from '../lib/useResource.js';
import { I18nProvider } from '../i18n/I18nProvider.jsx';

const Ctx = createContext({ settings: null, reload: () => {}, save: async () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }) {
  const res = useResource('/api/settings');
  const settings = res.data;
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'old-book';
  }, [settings?.theme]);
  const save = useCallback(values => res.save(values, { method: 'put' }), [res]);
  return (
    <Ctx.Provider value={{ settings, reload: res.reload, save, error: res.error }}>
      <I18nProvider language={settings?.language ?? 'en'}>{children}</I18nProvider>
    </Ctx.Provider>
  );
}
```

- [ ] **Step 5: Write Ornaments, Sidebar, Layout, PageHeader, Placeholder, NotFound, App, main, index.html, favicon, manifest**

`client/src/components/Ornaments.jsx` (all drawn for this repo):
```jsx
// Original line ornaments. Colors come from CSS (currentColor).
export function CornerFlourish({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <path d="M4 76 V20 Q4 4 20 4 H76" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 76 V24 Q10 10 24 10 H76" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <path d="M22 22 q10 -2 14 6 q-8 4 -14 -6 z M22 22 q-2 10 6 14 q4 -8 -6 -14 z" fill="currentColor" opacity="0.7" />
      <circle cx="22" cy="22" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function MarigoldCorner({ className = '' }) {
  const petals = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg className={className} viewBox="0 0 80 80" aria-hidden="true" focusable="false">
      <g transform="translate(26 26)">
        {petals.map(a => <ellipse key={a} rx="4" ry="11" transform={`rotate(${a}) translate(0 -10)`} fill="var(--marigold)" opacity="0.85" />)}
        <circle r="6" fill="var(--candle)" />
      </g>
      <path d="M26 40 Q30 60 60 74" fill="none" stroke="var(--leaf)" strokeWidth="2" />
      <path d="M58 64 l4 -12 l4 12 q-4 4 -8 0 z" fill="var(--candle)" />
    </svg>
  );
}

// A band of cut-paper flags along the top of the page (Book & Folk only).
export function PapelPicado() {
  const colors = ['var(--rosa)', 'var(--marigold)', 'var(--turquesa)', 'var(--candle)', 'var(--oxblood)'];
  return (
    <svg className="papel-picado" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d="M0 2 H600" stroke="var(--ink-soft)" strokeWidth="1" />
      {Array.from({ length: 12 }, (_, i) => (
        <g key={i} transform={`translate(${i * 50 + 3} 2)`}>
          <path d="M0 0 H44 V30 L38 36 L32 30 L26 36 L22 30 L16 36 L10 30 L6 36 L0 30 Z" fill={colors[i % colors.length]} opacity="0.85" />
          <circle cx="22" cy="14" r="5" fill="var(--parchment)" />
          <path d="M10 8 l4 4 M34 8 l-4 4 M10 22 l4 -4 M34 22 l-4 -4" stroke="var(--parchment)" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
```

`client/src/components/Sidebar.jsx`:
```jsx
import { NavLink } from 'react-router-dom';
import { Sun, BookOpen, Gem, CalendarDays, Flame, Feather, Trash2, Settings as Cog } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';
import { useResource } from '../lib/useResource.js';

export const SECTIONS = [
  { to: '/', key: 'nav.today', icon: Sun, end: true },
  { to: '/spells', key: 'nav.spells', icon: BookOpen },
  { to: '/correspondences', key: 'nav.correspondences', icon: Gem },
  { to: '/calendar', key: 'nav.calendar', icon: CalendarDays },
  { to: '/rituals', key: 'nav.rituals', icon: Flame },
  { to: '/journal', key: 'nav.journal', icon: Feather },
];
const FOOT = [
  { to: '/trash', key: 'nav.trash', icon: Trash2 },
  { to: '/settings', key: 'nav.settings', icon: Cog },
];

export function Brand() {
  const { t } = useT();
  return <NavLink to="/" className="brand"><span className="brand-name">{t('app.name')}</span><span className="brand-mark" aria-hidden="true">☾ ✦ ☽</span></NavLink>;
}

export function Sidebar({ id, open }) {
  const { t } = useT();
  const { data: health } = useResource('/api/health');
  const link = s => (
    <li key={s.to}>
      <NavLink to={s.to} end={s.end} className="nav-link">
        <s.icon size={18} aria-hidden="true" /><span>{t(s.key)}</span>
      </NavLink>
    </li>
  );
  return (
    <aside id={id} className={`sidebar${open ? ' is-open' : ''}`}>
      {health?.demo && <div className="demo-ribbon" role="note">{t('demo.ribbon')}</div>}
      <Brand />
      <nav aria-label={t('nav.label')}>
        <ul className="nav-main">{SECTIONS.map(link)}</ul>
        <ul className="nav-foot">{FOOT.map(link)}</ul>
      </nav>
    </aside>
  );
}
```

`client/src/components/Layout.jsx`:
```jsx
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Sidebar, Brand } from './Sidebar.jsx';
import { CornerFlourish, MarigoldCorner, PapelPicado } from './Ornaments.jsx';
import { useSettings } from './SettingsProvider.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const { t } = useT();
  const mainRef = useRef(null);
  const lastPath = useRef(pathname);
  const folk = settings?.theme === 'book-folk';

  useEffect(() => {
    setOpen(false);
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const Corner = folk ? MarigoldCorner : CornerFlourish;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">{t('nav.skip')}</a>
      <header className="topbar">
        <Brand />
        <button className="icon-btn" aria-expanded={open} aria-controls="sidebar"
          aria-label={open ? t('nav.close') : t('nav.open')} onClick={() => setOpen(o => !o)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </header>
      <Sidebar id="sidebar" open={open} />
      {open && <div className="scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      <main id="main" className="main" tabIndex={-1} ref={mainRef}>
        <div className="page">
          {folk && <PapelPicado />}
          {['tl', 'tr', 'bl', 'br'].map(c => <Corner key={c} className={`page-corner ${c}`} />)}
          <Outlet />
        </div>
      </main>
    </div>
  );
}
```

`client/src/components/PageHeader.jsx`:
```jsx
export function PageHeader({ title, children }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
```

`client/src/screens/Placeholder.jsx`:
```jsx
import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function Placeholder({ titleKey, stage }) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <p className="muted">{t('placeholder.coming', { stage })}</p>
    </>
  );
}
```

`client/src/screens/NotFound.jsx`:
```jsx
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function NotFound() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('notfound.title')} />
      <p>{t('notfound.body')}</p>
      <p><Link to="/">{t('notfound.home')}</Link></p>
    </>
  );
}
```

`client/src/App.jsx` (Settings and Trash screens arrive in Tasks 10 and 11; until then they use `Placeholder`):
```jsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from './components/ToastProvider.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';
import { SettingsProvider } from './components/SettingsProvider.jsx';
import { Layout } from './components/Layout.jsx';
import { Placeholder } from './screens/Placeholder.jsx';
import { NotFound } from './screens/NotFound.jsx';

function Shell() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Layout />
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}

export const routes = [
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Placeholder titleKey="nav.today" stage={4} /> },
      { path: 'spells', element: <Placeholder titleKey="nav.spells" stage={3} /> },
      { path: 'correspondences', element: <Placeholder titleKey="nav.correspondences" stage={2} /> },
      { path: 'calendar', element: <Placeholder titleKey="nav.calendar" stage={4} /> },
      { path: 'rituals', element: <Placeholder titleKey="nav.rituals" stage={5} /> },
      { path: 'journal', element: <Placeholder titleKey="nav.journal" stage={6} /> },
      { path: 'trash', element: <Placeholder titleKey="nav.trash" stage={1} /> },
      { path: 'settings', element: <Placeholder titleKey="nav.settings" stage={1} /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export function App() {
  return <RouterProvider router={createBrowserRouter(routes)} />;
}
```
Note: `createBrowserRouter` inside `App` makes a new router per render. `App` renders once at the root, so that's fine. Don't put state above it.

`client/src/main.jsx`:
```jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/600.css';
import './theme/tokens.css';
import './theme/global.css';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
```

`client/index.html`:
```html
<!doctype html>
<html lang="en" data-theme="old-book">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#2e1d14" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <title>The Grimoire</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`client/public/favicon.svg` (original: a closed book with a crescent moon):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="10" y="6" width="44" height="52" rx="4" fill="#47301f"/>
  <rect x="14" y="10" width="36" height="44" rx="2" fill="none" stroke="#b08d57" stroke-width="2"/>
  <rect x="8" y="6" width="6" height="52" rx="2" fill="#2e1d14"/>
  <path d="M38 22 a10 10 0 1 0 0 20 a8 8 0 1 1 0 -20 z" fill="#efe3c8"/>
  <circle cx="44" cy="20" r="1.6" fill="#b08d57"/><circle cx="24" cy="46" r="1.4" fill="#b08d57"/>
</svg>
```

`client/public/manifest.webmanifest`:
```json
{ "name": "The Grimoire", "short_name": "Grimoire", "start_url": "/", "display": "standalone",
  "background_color": "#1f130d", "theme_color": "#2e1d14",
  "icons": [{ "src": "/favicon.svg", "sizes": "any", "type": "image/svg+xml" }] }
```

- [ ] **Step 6: Write tokens.css and global.css**

`client/src/theme/tokens.css`:
```css
:root {
  --leather-900: #1f130d;
  --leather-800: #2e1d14;
  --leather-700: #47301f;
  --parchment: #efe3c8;
  --parchment-deep: #e2d1ab;
  --parchment-edge: #b9a074;
  --ink: #2b1a10;
  --ink-soft: #5b4430;
  --text-on-leather: #eadcc0;
  --oxblood: #6e1f24;
  --oxblood-wash: #f1d9d3;
  --gold: #b08d57;
  --accent: #b08d57;
  --accent-ink: #6f521f;
  --leaf: #4a6440;
  --marigold: #e8890c;
  --candle: #f2b33d;
  --rosa: #b0244f;
  --turquesa: #1f7a7a;

  --font-head: 'Cormorant Garamond', Georgia, serif;
  --font-body: 'EB Garamond', Georgia, serif;
  --radius: 4px;
  --sidebar-w: 236px;
  --gutter: clamp(16px, 3vw, 40px);
  --focus: var(--oxblood);
}

/* Book & Folk: the same book with marigold, candle and papel picado accents. */
[data-theme='book-folk'] {
  --accent: #e8890c;
  --accent-ink: #9a3b07;
  --leather-700: #5a2e1a;
  --focus: #9a3b07;
}
```

`client/src/theme/global.css`:
```css
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: var(--font-body); font-size: 18px; line-height: 1.55; color: var(--ink);
  background: radial-gradient(ellipse at center, var(--leather-700), var(--leather-900) 75%) fixed;
}
h1, h2, h3 { font-family: var(--font-head); font-weight: 600; color: var(--oxblood); line-height: 1.2; margin: 0 0 .5em; }
h1 { font-size: 2.2rem; letter-spacing: .02em; }
h2 { font-size: 1.5rem; }
a { color: var(--oxblood); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.muted { color: var(--ink-soft); font-style: italic; }

.skip-link { position: absolute; left: -999px; top: 8px; background: var(--parchment); padding: 8px 12px; z-index: 50; }
.skip-link:focus { left: 8px; }

.app-shell { display: grid; grid-template-columns: var(--sidebar-w) 1fr; min-height: 100vh; }
.topbar { display: none; }

.sidebar {
  background: linear-gradient(90deg, var(--leather-900), var(--leather-800));
  color: var(--text-on-leather); padding: 24px 16px; display: flex; flex-direction: column; gap: 16px;
  border-right: 3px double var(--gold); position: sticky; top: 0; height: 100vh;
}
.brand { display: flex; flex-direction: column; align-items: center; text-decoration: none; color: var(--text-on-leather); }
.brand-name { font-family: var(--font-head); font-size: 1.7rem; font-weight: 600; letter-spacing: .04em; }
.brand-mark { color: var(--gold); letter-spacing: .3em; }
.sidebar nav { display: flex; flex-direction: column; justify-content: space-between; flex: 1; }
.nav-main, .nav-foot { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.nav-foot { border-top: 1px solid var(--gold); padding-top: 12px; }
.nav-link {
  display: flex; gap: 10px; align-items: center; padding: 8px 12px; border-radius: var(--radius);
  color: var(--text-on-leather); text-decoration: none; font-family: var(--font-head); font-size: 1.15rem;
}
.nav-link:hover { background: rgba(176, 141, 87, .15); }
.nav-link.active { background: var(--parchment); color: var(--oxblood); box-shadow: inset 4px 0 0 var(--accent); }
.demo-ribbon { background: var(--oxblood); color: var(--text-on-leather); text-align: center; font-weight: 600; border-radius: var(--radius); }

.main { padding: var(--gutter); outline: none; }
.page {
  position: relative; max-width: 1100px; margin: 0 auto; min-height: calc(100vh - 2 * var(--gutter));
  background: radial-gradient(ellipse at 50% 40%, var(--parchment), var(--parchment-deep));
  border: 1px solid var(--parchment-edge); box-shadow: 0 0 0 6px var(--leather-800), 0 0 0 8px var(--gold), 0 12px 40px rgba(0,0,0,.5);
  padding: 56px clamp(20px, 5vw, 72px);
}
.page-corner { position: absolute; width: 72px; height: 72px; color: var(--gold); pointer-events: none; }
.page-corner.tl { top: 8px; left: 8px; }
.page-corner.tr { top: 8px; right: 8px; transform: scaleX(-1); }
.page-corner.bl { bottom: 8px; left: 8px; transform: scaleY(-1); }
.page-corner.br { bottom: 8px; right: 8px; transform: scale(-1, -1); }
.papel-picado { position: absolute; top: 0; left: 0; width: 100%; height: 40px; }
[data-theme='book-folk'] .page { padding-top: 72px; }
.page-header { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap;
  border-bottom: 3px double var(--parchment-edge); margin-bottom: 24px; }
.page-actions { display: flex; gap: 8px; }

.btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; border-radius: var(--radius); border: 1px solid transparent; cursor: pointer; padding: 6px 14px; }
.btn-sm { padding: 3px 10px; font-size: .9rem; }
.btn-primary { background: var(--oxblood); color: var(--parchment); }
.btn-ghost { background: transparent; color: var(--ink); border-color: var(--parchment-edge); }
.btn-danger { background: var(--oxblood); color: var(--parchment); border-color: var(--ink); }
.btn:disabled { opacity: .6; cursor: default; }
.icon-btn { background: none; border: 0; color: inherit; cursor: pointer; padding: 6px; }

.field { display: grid; gap: 4px; margin-bottom: 14px; }
.field label { font-family: var(--font-head); font-weight: 600; font-size: 1.05rem; }
.input { font: inherit; padding: 6px 10px; border: 1px solid var(--parchment-edge); border-radius: var(--radius); background: #fbf6ea; color: var(--ink); }
.has-error .input { border-color: var(--oxblood); }
.field-error { color: var(--oxblood); }
.field-hint { color: var(--ink-soft); }
.form-error, .load-error { background: var(--oxblood-wash); border-left: 4px solid var(--oxblood); padding: 10px 14px; margin: 12px 0; }
.loading { color: var(--ink-soft); font-style: italic; }

.list { list-style: none; padding: 0; margin: 0; }
.list > li { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--parchment-edge); }
.list .grow { flex: 1; }
.swatch { width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--ink-soft); flex: none; }
.tag { font-size: .8rem; border: 1px solid var(--accent-ink); color: var(--accent-ink); border-radius: 999px; padding: 0 8px; }
section + section { margin-top: 36px; }

.dialog { border: 1px solid var(--parchment-edge); border-radius: var(--radius); padding: 0; background: var(--parchment); color: var(--ink); width: min(560px, 92vw); }
.dialog::backdrop { background: rgba(20, 12, 8, .6); }
.dialog-head { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px 0; }
.dialog-body { padding: 8px 20px; }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 20px 16px; }
.toast-region { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 60; }
.toast { background: var(--leather-800); color: var(--text-on-leather); padding: 10px 16px; border-radius: var(--radius); display: flex; gap: 12px; align-items: center; }
.toast-action { background: none; border: 1px solid var(--gold); color: var(--text-on-leather); border-radius: var(--radius); cursor: pointer; }

@media (max-width: 860px) {
  .app-shell { grid-template-columns: 1fr; }
  .topbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; background: var(--leather-900); color: var(--text-on-leather); }
  .sidebar { position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w); transform: translateX(-100%); transition: transform .2s; z-index: 40; }
  .sidebar.is-open { transform: none; }
  .scrim { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 30; }
  .main { padding: 12px; }
  .page { padding: 48px 16px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
```

- [ ] **Step 7: Run the client tests**

Run: `npx vitest run --project client`
Expected: PASS. If a contrast pair fails, darken the foreground token until it passes. Don't lower the threshold.

- [ ] **Step 8: Build and look at it**

Run: `npm run build && npm start`, open http://localhost:4209, check both themes by running `curl -X PUT -H "Content-Type: application/json" -d "{\"theme\":\"book-folk\"}" http://127.0.0.1:4209/api/settings` and reloading. Stop with `npm run stop`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Add translations, both themes and the app shell"
```

---

### Task 10: Settings screen with Traditions and Backups

**Files:**
- Create: `client/src/screens/Settings.jsx`, `client/src/screens/settings/General.jsx`, `client/src/screens/settings/Traditions.jsx`, `client/src/screens/settings/TraditionDialog.jsx`, `client/src/screens/settings/Backups.jsx`
- Modify: `client/src/App.jsx` (route `settings` → `<Settings />`)
- Test: `tests/client/settings.test.jsx`, `tests/client/traditions.test.jsx`

**Interfaces:**
- Consumes: `useSettings`, `useResource`, `useRecordForm`, `LoadState`, `ConflictDialog`, `useConfirm`, `useToast`, `useT`, `api`, `/api/locales`, `/api/traditions`, `/api/backups`, `/api/data-folder`.
- Produces: `Settings` screen. `General` is a page form (language, theme, hemisphere, time zone) guarded by `useRecordForm`. `Traditions` is the list with Add, Edit (dialog), Delete (moves to Trash, toast with Undo) and a Starter tag. `Backups` lists backups with Back up now and Restore (confirm, then `window.location.reload()`).

- [ ] **Step 1: Write the failing tests**

`tests/client/traditions.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { Traditions } from '../../client/src/screens/settings/Traditions.jsx';

let rows;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function server() {
  rows = [{ id: 1, name: 'Wiccan', description: null, color: '#2f4a3a', version: 1, is_starter: 1, starter_key: 'tradition.wiccan' }];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url === '/api/traditions' && m === 'GET') return json(rows);
    if (url === '/api/traditions' && m === 'POST') { const r = { id: 2, version: 1, is_starter: 0, ...body }; rows.push(r); return json(r, 201); }
    const id = Number(url.split('/')[3]);
    if (m === 'PATCH') {
      const r = rows.find(x => x.id === id);
      if (body.version !== r.version) return json({ error: 'changed', current: r }, 409);
      Object.assign(r, body, { version: r.version + 1, is_starter: 0 });
      return json(r);
    }
    if (m === 'DELETE') { rows = rows.filter(x => x.id !== id); return json({ ok: true }); }
    return json({}, 404);
  }));
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ToastProvider><ConfirmProvider><Traditions /></ConfirmProvider></ToastProvider> }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('Traditions', () => {
  it('lists traditions with the Starter tag', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    expect(within(item).getByText('Starter')).toBeInTheDocument();
  });
  it('adds a tradition', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a tradition'));
    await userEvent.type(screen.getByLabelText('Name'), 'Kitchen witchery');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Kitchen witchery')).toBeInTheDocument();
  });
  it('edits a tradition and sends its version', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    await userEvent.type(screen.getByLabelText('Description'), 'God and Goddess');
    await userEvent.click(screen.getByText('Save'));
    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toMatchObject({ version: 1, description: 'God and Goddess' });
    expect(await screen.findByText('God and Goddess')).toBeInTheDocument();
  });
  it('shows the conflict dialog on a stale save', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    rows[0].version = 2; rows[0].name = 'Wicca';
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('This was changed somewhere else')).toBeInTheDocument();
  });
  it('deletes to the Trash and offers Undo', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    expect(await screen.findByText('Moved Wiccan to the Trash.')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });
});
```

`tests/client/settings.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../client/src/App.jsx';

let saved;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function stub() {
  saved = { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone: 'UTC' };
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (url === '/api/settings' && opts.method === 'PUT') { saved = { ...saved, ...JSON.parse(opts.body) }; return json(saved); }
    if (url === '/api/settings') return json(saved);
    if (url === '/api/locales') return json([{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }]);
    if (url.startsWith('/api/locales/')) return json({});
    if (url === '/api/health') return json({ ok: true, demo: false });
    if (url === '/api/data-folder') return json({ path: 'C:\\Data' });
    return json([]);
  }));
}
afterEach(() => { vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

describe('Settings', () => {
  it('saves the theme and applies it', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Look'), 'book-folk');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('book-folk'));
    expect(saved.theme).toBe('book-folk');
  });
  it('lists the language packs it finds', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(await screen.findByRole('option', { name: 'Español' })).toBeInTheDocument();
  });
  it('asks before leaving with an unsaved change', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Hemisphere'), 'south');
    await userEvent.click(screen.getAllByRole('link', { name: 'Today' })[0]);
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run --project client tests/client/traditions.test.jsx tests/client/settings.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Write General.jsx**

```jsx
import { useCallback } from 'react';
import { Field, Select } from '../../components/Field.jsx';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const ZONES = [...Intl.supportedValuesOf('timeZone'), 'UTC'];
const KEYS = ['language', 'theme', 'hemisphere', 'time_zone'];

function GeneralForm({ settings, save, languages }) {
  const { t } = useT();
  const toast = useToast();
  const submit = useCallback(async values => {
    const out = await save(values);
    toast.show({ message: t('common.saved') });
    return out;
  }, [save, toast, t]);
  const f = useRecordForm({ initial: Object.fromEntries(KEYS.map(k => [k, settings[k]])), submit });
  return (
    <form onSubmit={f.onSubmit}>
      <Field label={t('settings.language')} error={f.errors.language}>
        <Select value={f.values.language} onChange={e => f.set('language', e.target.value)}
          options={languages.map(l => ({ value: l.code, label: l.name }))} />
      </Field>
      <Field label={t('settings.theme')} error={f.errors.theme}>
        <Select value={f.values.theme} onChange={e => f.set('theme', e.target.value)}
          options={['old-book', 'book-folk'].map(v => ({ value: v, label: t(`settings.theme.${v}`) }))} />
      </Field>
      <Field label={t('settings.hemisphere')} error={f.errors.hemisphere}>
        <Select value={f.values.hemisphere} onChange={e => f.set('hemisphere', e.target.value)}
          options={['north', 'south'].map(v => ({ value: v, label: t(`settings.hemisphere.${v}`) }))} />
      </Field>
      <Field label={t('settings.timeZone')} error={f.errors.time_zone}>
        <Select value={f.values.time_zone} onChange={e => f.set('time_zone', e.target.value)} options={ZONES.map(z => ({ value: z, label: z }))} />
      </Field>
      {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
      <Button type="submit" disabled={f.saving || !f.dirty}>{f.saving ? t('common.saving') : t('common.save')}</Button>
    </form>
  );
}

export function General() {
  const { t } = useT();
  const { settings, save, error, reload } = useSettings();
  const langs = useResource('/api/locales');
  return (
    <section>
      <h2>{t('settings.general')}</h2>
      <LoadState loading={!settings || langs.loading} error={error ?? langs.error} onRetry={() => { reload(); langs.reload(); }}>
        {settings && langs.data && <GeneralForm settings={settings} save={save} languages={langs.data} />}
      </LoadState>
    </section>
  );
}
```

- [ ] **Step 4: Write TraditionDialog.jsx and Traditions.jsx**

`TraditionDialog.jsx`:
```jsx
import { useCallback } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Field, TextInput, TextArea } from '../../components/Field.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const pick = r => ({ name: r?.name ?? '', description: r?.description ?? '', color: r?.color ?? '#5b4430' });

// `record` is null for a new tradition. `onSave(values, version)` returns the saved row.
export function TraditionDialog({ record, onSave, onClose }) {
  const { t } = useT();
  const submit = useCallback((values, { version }) => onSave(values, version ?? record?.version), [onSave, record]);
  const f = useRecordForm({ initial: pick(record), submit });
  const save = async e => { const out = await f.onSubmit(e); if (out) { f.markSaved(); onClose(); } };
  const keep = async () => { const out = await f.keepMine(); if (out) { f.markSaved(); onClose(); } };
  return (
    <>
      <Dialog open onClose={onClose} title={record ? t('traditions.edit') : t('traditions.add')}
        footer={(
          <>
            <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
            <Button type="submit" form="tradition-form" disabled={f.saving}>{f.saving ? t('common.saving') : t('common.save')}</Button>
          </>
        )}>
        <form id="tradition-form" onSubmit={save}>
          <Field label={t('traditions.name')} error={f.errors.name}>
            <TextInput value={f.values.name} onChange={e => f.set('name', e.target.value)} maxLength={60} data-autofocus="" />
          </Field>
          <Field label={t('traditions.description')} error={f.errors.description}>
            <TextArea value={f.values.description} onChange={e => f.set('description', e.target.value)} maxLength={600} />
          </Field>
          <Field label={t('traditions.color')} error={f.errors.color}>
            <input type="color" className="input" value={f.values.color} onChange={e => f.set('color', e.target.value)} />
          </Field>
          {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
        </form>
      </Dialog>
      <ConflictDialog conflict={f.conflict} onKeepMine={keep} onTakeTheirs={() => f.takeTheirs(pick)} />
    </>
  );
}
```

`Traditions.jsx`:
```jsx
import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { TraditionDialog } from './TraditionDialog.jsx';

export function Traditions() {
  const { t, tc } = useT();
  const toast = useToast();
  const list = useResource('/api/traditions');
  const [editing, setEditing] = useState(null); // null: closed, 'new', or a row

  const onSave = useCallback((values, version) => list.act(() => (editing === 'new'
    ? api.post('/api/traditions', values)
    : api.patch(`/api/traditions/${editing.id}`, { ...values, version }))), [list, editing]);

  const remove = async row => {
    try {
      await list.act(() => api.del(`/api/traditions/${row.id}`));
      toast.show({
        message: t('traditions.deleted', { name: row.name }),
        action: { label: t('common.undo'), onClick: () => list.act(() => api.post(`/api/traditions/${row.id}/restore`)) },
        duration: 8000,
      });
    } catch (err) {
      toast.show({ message: err.message });
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>{t('traditions.title')}</h2>
        <Button icon={Plus} onClick={() => setEditing('new')}>{t('traditions.add')}</Button>
      </div>
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('traditions.empty')}</p>}
        <ul className="list">
          {list.data?.map(row => (
            <li key={row.id}>
              <span className="swatch" style={{ background: row.color ?? 'transparent' }} aria-hidden="true" />
              <span className="grow">
                <strong>{tc(row.is_starter ? row.starter_key : null, 'name', row.name)}</strong>
                {row.is_starter === 1 && <> <span className="tag">{t('common.starter')}</span></>}
                {row.description && <><br /><span className="muted">{tc(row.is_starter ? row.starter_key : null, 'description', row.description)}</span></>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(row)}>{t('common.delete')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
      {editing && <TraditionDialog key={editing === 'new' ? 'new' : editing.id} record={editing === 'new' ? null : editing} onSave={onSave} onClose={() => setEditing(null)} />}
    </section>
  );
}
```
Starter text shows the language pack's version only while the entry is still a starter (`is_starter = 1`). Once the owner edits it, her words show.

- [ ] **Step 5: Write Backups.jsx and Settings.jsx, and route it**

`Backups.jsx`:
```jsx
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';

export function Backups() {
  const { t } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useResource('/api/backups');
  const folder = useResource('/api/data-folder');

  const backUp = async () => {
    try {
      const b = await list.act(() => api.post('/api/backups'));
      toast.show({ message: t('backups.made', { name: b.name }) });
    } catch (err) { toast.show({ message: err.message }); }
  };
  const restore = async name => {
    if (!await confirm({ title: t('backups.restoreTitle'), body: t('backups.restoreBody', { name }), confirmLabel: t('backups.restore'), danger: true })) return;
    try {
      await api.post('/api/backups/restore', { name });
      window.location.reload(); // every screen reloads from the restored data
    } catch (err) { toast.show({ message: err.message, duration: 10000 }); }
  };

  return (
    <section>
      <div className="page-header">
        <h2>{t('backups.title')}</h2>
        <Button onClick={backUp}>{t('backups.now')}</Button>
      </div>
      {folder.data && (
        <p>{t('settings.dataFolder')}: <code>{folder.data.path}</code>{' '}
          <Button size="sm" variant="ghost" onClick={() => api.post('/api/data-folder/open')}>{t('settings.openFolder')}</Button></p>
      )}
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('backups.none')}</p>}
        <ul className="list">
          {list.data?.map(b => (
            <li key={b.name}>
              <span className="grow">{b.name} <span className="muted">({Math.ceil(b.size / 1024)} KB)</span></span>
              <Button size="sm" variant="ghost" onClick={() => restore(b.name)}>{t('backups.restore')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
    </section>
  );
}
```

`Settings.jsx`:
```jsx
import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';
import { General } from './settings/General.jsx';
import { Traditions } from './settings/Traditions.jsx';
import { Backups } from './settings/Backups.jsx';

export function Settings() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <General />
      <Traditions />
      <Backups />
    </>
  );
}
```

In `App.jsx`, import `Settings` and set `{ path: 'settings', element: <Settings /> }`.

- [ ] **Step 6: Run the client tests**

Run: `npx vitest run --project client`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add the Settings screen with traditions and backups"
```

---

### Task 11: Trash screen

**Files:**
- Create: `client/src/screens/Trash.jsx`
- Modify: `client/src/App.jsx` (route `trash` → `<Trash />`)
- Test: `tests/client/trash.test.jsx`

**Interfaces:**
- Consumes: `/api/trash`, `/api/trash/:type/:id/restore`, `DELETE /api/trash/:type/:id`, `/api/trash/empty`; `useResource`, `useConfirm`, `useToast`, `useT`.
- Produces: `Trash` screen: newest first, each row showing type, title and deleted date, with Restore and Delete forever (confirm), plus Empty the Trash (confirm).

- [ ] **Step 1: Write the failing test**

`tests/client/trash.test.jsx`:
```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { Trash } from '../../client/src/screens/Trash.jsx';

let items;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function stub() {
  items = [
    { type: 'tradition', id: 4, title: 'Old path', deleted_at: '2026-10-14T10:00:00.000Z' },
    { type: 'tradition', id: 5, title: 'Other', deleted_at: '2026-10-13T10:00:00.000Z' },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    if (url === '/api/trash' && m === 'GET') return json(items);
    if (url === '/api/trash/empty') { const n = items.length; items = []; return json({ removed: n, backup: 'pre-empty-x.db' }); }
    const [, , , type, id] = url.split('/');
    items = items.filter(i => !(i.type === type && i.id === Number(id)));
    return json(m === 'DELETE' ? { ok: true } : { id: Number(id) });
  }));
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ToastProvider><ConfirmProvider><Trash /></ConfirmProvider></ToastProvider> }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('Trash', () => {
  it('lists deleted records with their kind', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    expect(within(row).getByText('Tradition')).toBeInTheDocument();
  });
  it('restores one', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    await userEvent.click(within(row).getByText('Restore'));
    expect(await screen.findByText('Restored Old path.')).toBeInTheDocument();
    expect(screen.queryByText('Old path', { selector: 'strong' })).not.toBeInTheDocument();
  });
  it('asks before deleting forever', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    await userEvent.click(within(row).getByText('Delete forever'));
    expect(await screen.findByText('Delete Old path forever?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
  });
  it('empties the Trash after confirming', async () => {
    stub(); mount();
    await userEvent.click(await screen.findByText('Empty the Trash'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Empty the Trash' }));
    expect(await screen.findByText('The Trash is empty.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --project client tests/client/trash.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Write Trash.jsx and route it**

```jsx
import { Button } from '../components/Button.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { LoadState } from '../components/LoadState.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useResource } from '../lib/useResource.js';
import { api } from '../lib/api.js';
import { useT } from '../i18n/I18nProvider.jsx';

export function Trash() {
  const { t, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useResource('/api/trash');
  const fmt = iso => new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  const run = async (fn, message) => {
    try { await list.act(fn); if (message) toast.show({ message }); } catch (err) { toast.show({ message: err.message }); }
  };

  const restore = item => run(() => api.post(`/api/trash/${item.type}/${item.id}/restore`), t('trash.restored', { title: item.title }));
  const forever = async item => {
    if (!await confirm({ title: t('trash.deleteForeverTitle', { title: item.title }), body: t('trash.deleteForeverBody'), confirmLabel: t('trash.deleteForever'), danger: true })) return;
    run(() => api.del(`/api/trash/${item.type}/${item.id}`));
  };
  const emptyAll = async () => {
    if (!await confirm({ title: t('trash.emptyAllTitle'), body: t('trash.emptyAllBody'), confirmLabel: t('trash.emptyAll'), danger: true })) return;
    run(() => api.post('/api/trash/empty'));
  };

  return (
    <>
      <PageHeader title={t('trash.title')}>
        {list.data?.length > 0 && <Button variant="danger" onClick={emptyAll}>{t('trash.emptyAll')}</Button>}
      </PageHeader>
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('trash.empty')}</p>}
        <ul className="list">
          {list.data?.map(item => (
            <li key={`${item.type}-${item.id}`}>
              <span className="tag">{t(`trash.type.${item.type}`)}</span>
              <span className="grow"><strong>{item.title}</strong> <span className="muted">{fmt(item.deleted_at)}</span></span>
              <Button size="sm" variant="ghost" onClick={() => restore(item)}>{t('trash.restore')}</Button>
              <Button size="sm" variant="ghost" onClick={() => forever(item)}>{t('trash.deleteForever')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
    </>
  );
}
```

In `App.jsx`: `{ path: 'trash', element: <Trash /> }`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Add the Trash screen"
```

---

### Task 12: Windows scripts, setup, stop, icon and demo

**Files:**
- Create: `scripts/setup.js`, `scripts/stop.js`, `scripts/make-icon.js`, `windows/start-server.vbs`, `windows/stop-server.vbs`, `windows/Launch The Grimoire.vbs`, `windows/install-windows.ps1`, `windows/uninstall-windows.ps1`, `windows/the-grimoire.ico`, `server/demo/seed.js`
- Modify: `server/index.js` (demo seed)
- Test: `tests/server/stop-script.test.js`, `tests/server/demo.test.js`

**Interfaces:**
- Produces: `resolvePort(root, env) → number` and `stopServer(port, timeoutMs, { settleMs }) → 'stopped' | 'not-running' | 'still-running'` from `scripts/stop.js`; `seedDemo(ctx, { reset })`.

- [ ] **Step 1: Copy and rename the Apothecary scripts**

```bash
cp ../the-apothecary/scripts/setup.js ../the-apothecary/scripts/stop.js ../the-apothecary/scripts/make-icon.js scripts/
cp ../the-apothecary/windows/start-server.vbs ../the-apothecary/windows/stop-server.vbs ../the-apothecary/windows/install-windows.ps1 ../the-apothecary/windows/uninstall-windows.ps1 windows/
cp "../the-apothecary/windows/Launch The Apothecary.vbs" "windows/Launch The Grimoire.vbs"
sed -i \
  -e 's/The Apothecary - Stop 9-30 PM/The Grimoire - Stop 9 PM/g' \
  -e 's/9:30 PM/9 PM/g' -e "s/'9:30PM'/'9:00PM'/g" -e 's#5:30 AM / 9:30 PM#5:30 AM / 9 PM#g' \
  -e 's/Launch The Apothecary/Launch The Grimoire/g' -e 's/the-apothecary\.ico/the-grimoire.ico/g' \
  -e 's/The Apothecary/The Grimoire/g' -e 's/APOTHECARY_PORT/GRIMOIRE_PORT/g' -e 's/4197/4209/g' \
  scripts/setup.js scripts/stop.js scripts/make-icon.js windows/*.vbs windows/*.ps1
grep -rn -i "apothecary\|9:30\|9-30\|4197" scripts windows || echo "clean"
```
Expected: `clean`.

- [ ] **Step 2: Write the failing tests**

`tests/server/stop-script.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolvePort, stopServer } from '../../scripts/stop.js';
import { makeTestContext } from './helpers.js';

let t, server;
afterEach(() => { server?.close(); t?.cleanup(); });

describe('stop script', () => {
  it('defaults to 4209', () => {
    expect(resolvePort(fs.mkdtempSync(path.join(os.tmpdir(), 'grim-stop-')), {})).toBe(4209);
  });
  it('uses GRIMOIRE_PORT, then config.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-stop-'));
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: 4300 }));
    expect(resolvePort(root, {})).toBe(4300);
    expect(resolvePort(root, { GRIMOIRE_PORT: '4400' })).toBe(4400);
  });
  it('says not-running when nothing listens', async () => {
    expect(await stopServer(1, 2000, { settleMs: 10 })).toBe('not-running');
  });
  it('stops a running server', async () => {
    let stopped = false;
    t = makeTestContext({ onShutdown: () => { stopped = true; server.close(); } });
    server = t.app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    expect(await stopServer(server.address().port, 5000, { settleMs: 50 })).toBe('stopped');
    expect(stopped).toBe(true);
  });
});
```

`tests/server/demo.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';
import { seedDemo } from '../../server/demo/seed.js';

let t;
afterEach(() => t?.cleanup());

describe('demo seed', () => {
  it('adds sample data once and resets on request', async () => {
    t = makeTestContext();
    seedDemo(t.ctx);
    seedDemo(t.ctx);
    const names = (await t.http().get('/api/traditions')).body.map(r => r.name);
    expect(names.filter(n => n === 'Kitchen witchery')).toHaveLength(1);
    expect((await t.http().get('/api/trash')).body.map(r => r.title)).toContain('Hedge witchery');
    seedDemo(t.ctx, { reset: true });
    expect((await t.http().get('/api/traditions')).body.filter(r => r.name === 'Kitchen witchery')).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run them to see the demo test fail**

Run: `npx vitest run --project server tests/server/stop-script.test.js tests/server/demo.test.js`
Expected: stop-script PASS (copied code), demo FAIL.

- [ ] **Step 4: Write the demo seed and wire --demo**

`server/demo/seed.js`:
```js
import { repos } from '../db/repos.js';
import { transaction } from '../db/connection.js';
import { seedStarter } from '../services/starter.js';

// Sample data for the demo folder only. Later stages add their own samples here.
export function seedDemo(ctx, { reset = false } = {}) {
  const db = ctx.db;
  transaction(db, () => {
    if (reset) {
      db.exec('DELETE FROM traditions; DELETE FROM starter_removed; DELETE FROM settings;');
    }
    const t = repos(db).traditions;
    const all = db.prepare('SELECT name FROM traditions').all().map(r => r.name);
    if (!all.includes('Kitchen witchery')) t.create({ name: 'Kitchen witchery', description: 'Magic worked at the stove and the table.', color: '#4a6440', sort_order: 4 });
    if (!all.includes('Hedge witchery')) {
      const h = t.create({ name: 'Hedge witchery', description: 'A sample entry waiting in the Trash.', color: '#5b4430', sort_order: 5 });
      t.remove(h.id);
    }
  });
  seedStarter(db);
}
```

In `server/index.js`, after the context is created and before `runMaintenance(ctx)`:
```js
if (demo) {
  const { seedDemo } = await import('./demo/seed.js');
  seedDemo(ctx, { reset: process.argv.includes('--reset') });
}
```

- [ ] **Step 5: Make the icon**

Run: `npm run icon`
Expected: `Wrote windows/the-grimoire.ico`.

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Add Windows start and stop, setup, icon and demo data"
```

---

### Task 13: Browser tests: saving survives a restart

**Files:**
- Create: `playwright.config.js`, `e2e/server.js`, `e2e/global-setup.js`, `e2e/saving.spec.js`, `e2e/guards.spec.js`, `e2e/settings.spec.js`

**Interfaces:**
- Produces: `startServer(dataDir) → ChildProcess` (waits for health), `stopServer(proc)`, `BASE = 'http://127.0.0.1:4213'`, `freshDataDir() → string` (short path in the temp folder, prefix `gr-e2e-`), `removeDataDir(dir)`.

- [ ] **Step 1: Write the config and server helper**

`playwright.config.js`:
```js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  workers: 1, // each spec starts and stops the one test server on 4213
  globalSetup: './e2e/global-setup.js',
  timeout: 60000,
  use: { baseURL: 'http://127.0.0.1:4213', viewport: { width: 1400, height: 900 }, video: 'retain-on-failure' },
});
```

`e2e/global-setup.js`:
```js
import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('npm run build', { stdio: 'inherit' });
}
```

`e2e/server.js`:
```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const PORT = 4213;
export const BASE = `http://127.0.0.1:${PORT}`;

// Keep the folder name short: long Windows paths can break SQLite.
export function freshDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gr-e2e-'));
}

export function removeDataDir(dir) {
  if (path.basename(dir).startsWith('gr-e2e-')) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

async function healthy() {
  try { return (await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

export async function startServer(dataDir) {
  if (await healthy()) throw new Error(`Something is already running on ${PORT}. Stop it first.`);
  const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, GRIMOIRE_DATA_DIR: dataDir, GRIMOIRE_PORT: String(PORT) }, stdio: 'inherit',
  });
  for (let i = 0; i < 80; i++) {
    if (await healthy()) return proc;
    await new Promise(r => setTimeout(r, 250));
  }
  proc.kill();
  throw new Error('The test server did not start.');
}

export async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  const exited = new Promise(r => proc.once('exit', r));
  try { await fetch(`${BASE}/api/shutdown`, { method: 'POST', signal: AbortSignal.timeout(10000) }); } catch {}
  await Promise.race([exited, new Promise(r => setTimeout(r, 10000))]);
  if (proc.exitCode === null) proc.kill();
}
```

- [ ] **Step 2: Write saving.spec.js**

```js
import { test, expect } from '@playwright/test';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

const restart = async () => { await stopServer(proc); proc = await startServer(dir); };

test('a new tradition and an edit survive a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Kitchen witchery');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Kitchen witchery')).toBeVisible();

  const row = page.locator('li', { hasText: 'Kitchen witchery' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Description').fill('Stove and table');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Stove and table')).toBeVisible();

  await restart();
  await page.reload();
  await expect(page.locator('li', { hasText: 'Kitchen witchery' })).toContainText('Stove and table');
});

test('delete, restore from the Trash, and it is still there after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Moved Wiccan to the Trash.')).toBeVisible();
  await page.getByRole('link', { name: 'Trash' }).click();
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
  await restart();
  await page.goto('/settings');
  await expect(page.locator('li', { hasText: 'Wiccan' })).toBeVisible();
});

test('a starter tradition deleted forever stays gone after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('link', { name: 'Trash' }).click();
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete forever' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete forever' }).click();
  await restart();
  await page.goto('/settings');
  await expect(page.getByText('Eclectic')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Wiccan' })).toHaveCount(0);
});

test('back up, change something, restore, and the change is gone', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText(/Backup made/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('After the backup');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('After the backup')).toBeVisible();
  await page.locator('li', { hasText: /^grimoire-/ }).first().getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await page.waitForLoadState('load');
  await expect(page.getByText('Eclectic')).toBeVisible();
  await expect(page.getByText('After the backup')).toHaveCount(0);
});
```

- [ ] **Step 3: Write guards.spec.js**

```js
import { test, expect } from '@playwright/test';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

test('two windows: the second save gets the conflict dialog, and Keep mine wins', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const p of [a, b]) {
    await p.goto('/settings');
    await p.locator('li', { hasText: 'Eclectic' }).getByRole('button', { name: 'Edit' }).click();
  }
  await a.getByLabel('Description').fill('From window A');
  await a.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(a.getByText('From window A')).toBeVisible();

  await b.getByLabel('Description').fill('From window B');
  await b.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(b.getByText('This was changed somewhere else')).toBeVisible();
  await b.getByRole('button', { name: 'Keep mine and save over it' }).click();
  await expect(b.getByText('From window B')).toBeVisible();
  await a.reload();
  await expect(a.getByText('From window B')).toBeVisible();
});

test('an unsaved change asks before leaving', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Hemisphere').selectOption('south');
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Today' }).click();
  await expect(page.getByText('Leave without saving?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel('Hemisphere')).toHaveValue('south');
});

test('a late, out-of-date list reply does not hide a new tradition', async ({ page }) => {
  let first = true;
  await page.route('**/api/traditions', async route => {
    if (route.request().method() === 'GET' && first) {
      first = false;
      const res = await route.fetch();
      await new Promise(r => setTimeout(r, 2500)); // the first load lands after the save
      return route.fulfill({ response: res });
    }
    return route.continue();
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Arrived during a slow load');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Arrived during a slow load')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByText('Arrived during a slow load')).toBeVisible();
});

test('when the server is closed, loads say so and Try again works once it is back', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Eclectic')).toBeVisible();
  await stopServer(proc);
  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByText(/Can't reach The Grimoire/)).toBeVisible();
  proc = await startServer(dir);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
});

test('when the server is closed, a save keeps the form filled in', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Not lost');
  await stopServer(proc);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText("Can't reach The Grimoire");
  await expect(page.getByLabel('Name')).toHaveValue('Not lost');
  proc = await startServer(dir);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('li', { hasText: 'Not lost' })).toBeVisible();
});
```

- [ ] **Step 4: Write settings.spec.js**

```js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => {
  dir = freshDataDir();
  const es = path.join(dir, 'locales', 'es');
  fs.mkdirSync(es, { recursive: true });
  fs.writeFileSync(path.join(es, 'ui.json'), JSON.stringify({ _name: 'Español', 'nav.today': 'Hoy', 'nav.settings': 'Ajustes', 'common.save': 'Guardar', 'settings.language': 'Idioma' }));
  fs.writeFileSync(path.join(es, 'content.json'), JSON.stringify({ 'tradition.wiccan.name': 'Wicca' }));
  proc = await startServer(dir);
});
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

test('switching to Book & Folk and Spanish sticks after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByLabel('Language').selectOption('es');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Hoy' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await expect(page.locator('.papel-picado')).toBeVisible();
  await expect(page.getByText('Wicca', { exact: true })).toBeVisible();

  await stopServer(proc);
  proc = await startServer(dir);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await page.screenshot({ path: 'test-results/book-folk-es.png', fullPage: true });
});

test('Old Book is the default look', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'old-book');
  await expect(page.locator('.papel-picado')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/old-book-en.png', fullPage: true });
});
```

- [ ] **Step 5: Run the browser tests**

Run: `npm run test:e2e`
Expected: all PASS. If one fails, fix the app, not the test, unless the test itself is wrong. Use superpowers:systematic-debugging.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Add browser tests for saving, restarts, conflicts and guards"
```

---

### Task 14: Docs, install, evidence, PR

**Files:**
- Create: `README.md`, `AGENTS.md`, `CLAUDE.md`, `NOTICE.md`
- Modify: the owner's global notes (ports and the active-apps list; outside the repo)

- [ ] **Step 1: Write NOTICE.md**

```markdown
# Third-party notices

- Cormorant Garamond, copyright 2015 The Cormorant Project Authors. SIL Open Font License 1.1. Bundled through @fontsource/cormorant-garamond.
- EB Garamond, copyright 2017 The EB Garamond Project Authors, by Georg Duffner and Octavio Pardo. SIL Open Font License 1.1. Bundled through @fontsource/eb-garamond.
- Lucide icons. ISC License.

The icon, corner flourishes, marigold corners and papel picado band are original to this repository. The starter text is original to this repository.
```

- [ ] **Step 2: Write AGENTS.md and CLAUDE.md**

`AGENTS.md`: copy `../the-apothecary/AGENTS.md`, then:
- Rename The Apothecary → The Grimoire, port 4197 → 4209, task `Stop 9-30 PM` → `Stop 9 PM` and 9:30 PM → 9 PM.
- Data folder contents: `grimoire.db`, `backups\`, `locales\`.
- Remove the photo and label sections.
- Add a section **Add a language**:
  > The app's screens are English. To add another language, make a folder `locales\<code>` inside the data folder (for example `locales\es` for Spanish). Put two files in it: `ui.json`, which holds every key from `client/src/i18n/en.json` translated, plus `"_name"` with the language's own name (like `"Español"`); and `content.json`, which translates starter entries by key, like `"tradition.wiccan.name"` and `"tradition.wiccan.description"` (keys are `<starter_key>.<field>`; starter keys are in `server/content/*.json`). Restart the app, then pick the language in Settings. Packs live in the data folder, so updates never overwrite them.

`CLAUDE.md`:
```markdown
# The Grimoire

Read `AGENTS.md` first. It has install, update, uninstall and language-pack steps, and the golden rules about the data folder.

- Design: `docs/superpowers/specs/2026-10-14-the-grimoire-design.md`
- Plans, one per stage: `docs/superpowers/plans/`
- Saving rules: every editable table has `version`; updates send it; stale saves get 409. Load and save on the client only through `useResource` and `useRecordForm`. Don't fetch directly from screens.
- Keep the owner's personal details out of this public repo.
```

- [ ] **Step 3: Write README.md**

```markdown
# The Grimoire

A personal Book of Shadows that runs on your own computer: your spells and rituals, a correspondences library, a calendar with the Wheel of the Year and Mexican folk feast days, ritual planning and results, and a journal for dreams, tarot pulls and signs.

It keeps everything in one file on your computer. There are no accounts, and nothing is sent over the internet.

> Stage 1 of 6 is done: saving, backups, the Trash, settings, traditions, and both looks. The other sections arrive in later stages.

## Install

You need [Node.js](https://nodejs.org) 24 or newer.

    npm run setup
    npm start

Then open http://localhost:4209. On Windows, `npm run install-windows` adds a Desktop shortcut and starts the app each morning at 5:30, then backs up and stops it at 9 PM.

The easiest way: open this folder in Claude Code or Codex and say "install The Grimoire". `AGENTS.md` tells them exactly what to do.

## Your data

Everything lives in `Documents\The Grimoire Data`. The app backs up once a day, when it shuts down, and before any restore or emptying of the Trash, and keeps the newest 30. Restore from Settings.

## Two languages

The app comes in English. To have it in two languages, ask Claude Code or Codex: "Add a Spanish language pack to The Grimoire" (or any language). They'll write the translation files into your data folder, following `AGENTS.md`, and you switch languages in Settings.

## Two looks

**Old Book** (parchment and gold) is the default. **Book & Folk** adds papel picado, marigolds and candlelight. Switch in Settings.

## License

MIT. See `LICENSE` and `NOTICE.md`.
```

Run `/unslop` on README.md, AGENTS.md and CLAUDE.md, then commit:
```bash
git add -A
git commit -m "Add the README, agent instructions and notices"
```

- [ ] **Step 4: Full verification**

Run: `npm test && npm run test:e2e && npm run build`
Expected: all PASS. Use superpowers:verification-before-completion: paste the real totals into the PR.

- [ ] **Step 5: Install on this laptop**

1. `npm run setup` (writes `config.json`, creates `Documents\The Grimoire Data`).
2. Ask the owner before running `npm run install-windows` (adds two scheduled tasks and a Desktop shortcut). On yes, run it.
3. Check: `Get-ScheduledTask -TaskName 'The Grimoire*'` lists both tasks with the battery settings on; `The Grimoire Dashboard.lnk` is on the Desktop; start the app from the shortcut; `curl http://127.0.0.1:4209/api/health` gives `"ok":true`.
4. In the app: Settings → Look → Book & Folk → Save. (The Spanish pack is written in Stage 2 alongside the starter content.)

- [ ] **Step 6: Evidence**

Use `/evidence-driven-testing`: record adding a tradition, editing it, restarting the server with `npm run stop` and the shortcut, and showing it's still there. Also record the conflict dialog and the unsaved-changes prompt. Use `/before-and-after` with the Old Book and Book & Folk screenshots from `test-results/`.

- [ ] **Step 7: Publish and open the PR**

1. Ask the owner before creating the public repo `HelloSteph1975/the-grimoire`. On yes: `gh repo create HelloSteph1975/the-grimoire --public --source . --remote origin`, then `git push -u origin main` and `git push -u origin <branch>`.
2. Ask her to turn on Greptile for the repo in the Greptile dashboard.
3. Open the PR from the Stage 1 branch into `main`, with the test totals, video and screenshot table. Run `/unslop` on the title and body. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
4. Run `/greploop` until 5/5 with no open comments.

- [ ] **Step 8: Update the global notes**

In the owner's global notes: add The Grimoire to the active apps (code `~\dev\the-grimoire`, data `Documents\The Grimoire Data`, Stage 1 status) and to the port list (The Grimoire 4209, demo 4211, browser tests 4213; next free 4215).
```

# The Grimoire, Stage 2: Correspondences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Correspondences section: categories, entries with traditions, keywords, feast days and two-way links, browsing, filtering and search. Also reorder traditions and categories, translate error messages, load about 100 original starter entries, and give the owner a Spanish pack.

**Architecture:** Builds on Stage 1 without changing its rules. Every new table is versioned, soft-deleted and listed in the Trash. Every write is one transaction. The client loads and saves only through `useResource` and `useRecordForm`. New server logic lives in services (`correspondences.js`, `reorder.js`, `starter.js`), and routes stay thin. Error messages carry stable codes that the client translates.

**Tech Stack:** Same as Stage 1: Node 24, Express 5, `node:sqlite`, React 19, React Router 7, Vite, Vitest, Testing Library, Supertest, Playwright, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md` plus the Stage 2 addendum `docs/superpowers/specs/2026-10-15-stage-2-correspondences.md`. Where they differ, the addendum wins.

## Global Constraints

- Every Stage 1 global constraint still applies (`docs/superpowers/plans/2026-10-14-stage-1-foundation.md`, "Global Constraints").
- New editable tables use `INTEGER PRIMARY KEY AUTOINCREMENT` and the shared `TS` columns (`version`, ISO-8601 UTC stamps, `deleted_at`). Migrations are append-only. Stage 2 adds migration 3 and never edits 1 or 2.
- Updates send `version`. Stale ones get `409` with `current`. A write from a page loaded before a restore gets `409 restored` (Stage 1 epoch guard, unchanged).
- Entry limits: name up to 80 characters, summary up to 200, full text up to 4,000, keywords up to 20 items of up to 30 characters each, feast day `MM-DD` (a real day, `02-29` allowed), links up to 50, traditions up to 20.
- Category icons come from this fixed list only: `gem, palette, calendar-days, orbit, flame, moon, sparkles, cross, sun, leaf, book-open, star`.
- Starter keys: categories `category.<slug>`, entries `corr.<category-slug>.<entry-slug>`, traditions as in Stage 1 (`tradition.eclectic`, `tradition.wiccan`, `tradition.mexican-folk`).
- Starter text is original. No copied or closely paraphrased text, no invented history, no health claims, and no claim that a practice belongs to everyone in a tradition.
- The Spanish pack and the owner's folk-saint entries never enter the repo.
- Every new screen string goes through `t()`. `en.json` holds every key.
- Error responses carry `code` (and `detailCodes` for field errors). The client shows `t('error.<code>', vars)` and falls back to the English `error` text.

## Review Focus

1. **Deleting a category whose entries were already in the Trash.** Expect restoring the category to bring back only the entries deleted with it, not entries that were in the Trash before. Pinned in Task 4.
2. **Two windows editing entries that link to each other.** Expect changing A's links to bump B's version, so B's open form conflicts instead of silently dropping the link. Pinned in Task 5.
3. **A starter entry whose category the owner deleted forever.** Expect the seeder to skip it, never to crash or create an orphan. Pinned in Task 3.
4. **Searching in Spanish for a starter word.** Expect a match on the translated text while the entry is still a starter, and on the owner's own text once she has edited it. Pinned in Task 5.
5. **Reordering while another window added or deleted a row.** Expect a `reorder_conflict` and a reloaded list, not a half-applied order. Pinned in Task 2.

---

## File map

```
server/
  db/migrations.js            + migration 3 (categories, correspondences, links, traditions join, content_version)
  db/repos.js                 + categories, correspondences repos
  validate.js                 + codes for every error, 'strings' and 'ids' and 'monthDay' rule types
  http.js                     HttpError gets `code`; errorHandler sends code/detailCodes
  services/reorder.js         reorder a whole list with version checks
  services/correspondences.js list/search/get/create/update with traditions and links
  services/categories.js      usage counts, cascade delete/restore/purge
  services/starter.js         + categories, correspondences, links, content_version updates
  services/trash.js           + category, correspondence types; grouped entries
  routes/categories.js, routes/correspondences.js, routes/traditions.js (+ reorder, usage)
  content/categories.json, content/correspondences/*.json, content/links.json
scripts/check-pack.js
client/src/
  lib/errors.js               errorText(err, t), fieldErrors(err, t)
  lib/useReorder.js           move up/down and save the order
  components/ReorderButtons.jsx, ChipsInput.jsx, EntryPicker.jsx, CategoryIcon.jsx
  screens/correspondences/Correspondences.jsx, EntryPage.jsx, EntryForm.jsx
  screens/settings/Categories.jsx, CategoryDialog.jsx
  i18n/en.json                + keys
tests/server/*.test.js, tests/client/*.test.jsx, e2e/correspondences.spec.js
```

---

### Task 1: Error codes on the server

**Files:**
- Modify: `server/validate.js`, `server/http.js`, `server/routes/crud.js`, `server/services/trash.js`, `server/services/backup.js` (code on its HttpErrors)
- Test: `tests/server/validate.test.js`, `tests/server/errors.test.js` (new)

**Interfaces:**
- Produces: `validate()` returns `{ errors, codes }` on failure. Here `codes[key]` is `{ code, ...vars }`, and code is one of `required`, `not_text`, `too_long{max}`, `bad_format{hint?}`, `not_number`, `not_whole`, `too_small{min}`, `too_big{max}`, `not_date`, `not_one_of`, `too_many{max}`, `bad_id`.
- `check()` throws `HttpError(400, 'Please fix the highlighted fields.', errors, { code: 'invalid', detailCodes: codes })`.
- `new HttpError(status, message, details, { code, vars, detailCodes } = {})`.
- `errorHandler` responses look like `{ error, code, vars?, details?, detailCodes?, current? }`. The codes are: 409 version → `conflict`; restored → `restored`; 404 → `not_found` unless the thrower set one; 500 → `server_error`; 403 → `forbidden`; plus `unknown_kind`, `not_in_trash`, `missing_version`, `in_use`, `category_in_trash`, `reorder_conflict`, `self_link`.

- [ ] **Step 1: Write failing tests**

`tests/server/errors.test.js`:
```js
import { describe, it, expect, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
afterEach(() => t?.cleanup());

describe('error codes', () => {
  it('sends field codes with a 400', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').send({ name: '', color: 'red' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid');
    expect(res.body.detailCodes).toEqual({ name: { code: 'required' }, color: { code: 'bad_format', hint: 'color' } });
    expect(res.body.details.name).toBe('Required');
  });
  it('sends too_long with its limit', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').send({ name: 'x'.repeat(61) });
    expect(res.body.detailCodes.name).toEqual({ code: 'too_long', max: 60 });
  });
  it('sends not_found, missing_version and conflict', async () => {
    t = makeTestContext();
    expect((await t.http().get('/api/traditions/999')).body.code).toBe('not_found');
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'A' });
    expect((await t.http().patch(`/api/traditions/${a.id}`).send({ name: 'B' })).body.code).toBe('missing_version');
    await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'B' });
    const stale = await t.http().patch(`/api/traditions/${a.id}`).send({ version: 1, name: 'C' });
    expect(stale.body).toMatchObject({ code: 'conflict', current: { name: 'B' } });
  });
  it('sends unknown_kind and not_in_trash', async () => {
    t = makeTestContext();
    expect((await t.http().post('/api/trash/nope/1/restore')).body.code).toBe('unknown_kind');
    const { body: a } = await t.http().post('/api/traditions').send({ name: 'Alive' });
    expect((await t.http().delete(`/api/trash/tradition/${a.id}`)).body.code).toBe('not_in_trash');
  });
  it('sends restored for a write from before a restore', async () => {
    t = makeTestContext();
    const res = await t.http().post('/api/traditions').set('X-Grimoire-Epoch', 'old').send({ name: 'X' });
    expect(res.body).toMatchObject({ code: 'restored', restored: true });
  });
});
```

Add to `tests/server/validate.test.js`:
```js
  it('returns a code for every error', () => {
    const s = { a: 'string!', b: { type: 'string', maxLength: 2 }, c: { type: 'int', min: 1 }, d: 'date', e: ['x', 'y'] };
    const r = validate(s, { b: 'abc', c: 0, d: 'nope', e: 'z' });
    expect(r.codes).toEqual({ a: { code: 'required' }, b: { code: 'too_long', max: 2 }, c: { code: 'too_small', min: 1 }, d: { code: 'not_date' }, e: { code: 'not_one_of' } });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/errors.test.js tests/server/validate.test.js`
Expected: FAIL (no `code` fields).

- [ ] **Step 3: Implement**

In `validate.js`, every branch that sets `errors[key] = '…'` also sets `codes[key]`. Use a helper:
```js
const fail = (errors, codes, key, message, code, vars = {}) => { errors[key] = message; codes[key] = { code, ...vars }; };
```
- Required → `required`
- Must be text → `not_text`
- Too long → `too_long, { max }`
- Pattern → `bad_format`, plus `{ hint: rule.hintKey }` when the rule has `hintKey`. Add `hintKey: 'color'` to the tradition color rule.
- Must be a number → `not_number`
- Must be a whole number → `not_whole`
- At least → `too_small, { min }`
- At most → `too_big, { max }`
- Date → `not_date`
- One of → `not_one_of`

`validate` returns `{ errors, codes }` on failure.

`check()` throws `new HttpError(400, 'Please fix the highlighted fields.', r.errors, { code: 'invalid', detailCodes: r.codes })`.

`http.js`:
```js
export class HttpError extends Error {
  constructor(status, message, details, { code, vars, detailCodes } = {}) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
    this.vars = vars;
    this.detailCodes = detailCodes;
  }
}
export const notFound = (message = 'Not found', code = 'not_found') => new HttpError(404, message, undefined, { code });
const DEFAULT_CODES = { 400: 'invalid', 403: 'forbidden', 404: 'not_found', 409: 'conflict' };
```
In `errorHandler`:
- `VersionConflict` → `{ error, code: 'conflict', current }`.
- Otherwise → `{ error, code: status >= 500 ? 'server_error' : (err.code ?? DEFAULT_CODES[status] ?? 'invalid'), vars: err.vars, details, detailCodes: err.detailCodes }`.

The epoch guard's 409 adds `code: 'restored'`. `deny()` adds `code: 'forbidden'`. `idParam` uses `{ code: 'bad_id' }`.

In crud.js, `versionOf` throws with `{ code: 'missing_version' }`. In trash.js, `typeOf` uses `unknown_kind` and the not-in-Trash errors use `not_in_trash`. In backup.js, give the restore HttpErrors codes: `not_backup`, `backup_missing`, `backup_damaged`, `backup_newer`, `backup_foreign`, `in_use`, `restore_failed`.

- [ ] **Step 4: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS. Update any existing assertion that compared the whole error body.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Send a stable code with every error"
```

---

### Task 2: Error messages on the client, and reordering

**Files:**
- Create: `client/src/lib/errors.js`, `client/src/lib/useReorder.js`, `client/src/components/ReorderButtons.jsx`, `server/services/reorder.js`
- Modify: `client/src/lib/api.js` (keep `code`, `vars`, `detailCodes` on ApiError), `client/src/lib/useRecordForm.js` (translate form and field errors), `client/src/components/LoadState.jsx` (translate), every `toast.show({ message: err.message })` (use `errorText`), `client/src/i18n/en.json`, `server/routes/traditions.js`, `client/src/screens/settings/Traditions.jsx`
- Test: `tests/client/errors.test.jsx`, `tests/server/reorder.test.js`, `tests/client/traditions.test.jsx`

**Interfaces:**
- Produces:
  - `ApiError` has `code`, `vars`, `detailCodes`, keeping `status`, `details`, `current` and `restored`. A network failure has `code: 'unreachable'`.
  - `errorText(err, t) → string`: `t('error.' + code, vars)` when that key exists in en.json, otherwise `err.message`.
  - `fieldErrors(err, t) → { [field]: string }`: each `detailCodes[field]` translated through `t('error.' + code, vars)`. A `hint` uses `t('error.bad_format.' + hint)` when that key exists. Falls back to `details[field]`.
  - `reorder(db, table, items: {id, version}[])`: in one transaction, checks that `items` lists exactly the live rows of `table` with matching versions, otherwise throws `HttpError(409, 'The list changed in another window.', undefined, { code: 'reorder_conflict' })`. It sets `sort_order = (index + 1) * 10` and bumps `version` on rows whose order changed, then returns the new list. It never changes `is_starter`.
  - Route: `POST /api/traditions/reorder` with body `{ items: [{ id, version }] }` returns the list.
  - `useReorder(list, url)` returns `move(index, delta)`. It builds the reordered items, posts to `${url}/reorder` through `list.act`, and on `reorder_conflict` shows the error toast. `list.act` reloads either way.
  - `ReorderButtons({ index, count, onMove, label })` renders up and down icon buttons with aria-labels `t('reorder.up', { name: label })` and `t('reorder.down', …)`. They are disabled at the ends.

- [ ] **Step 1: Write failing tests**

`tests/server/reorder.test.js`:
```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTestContext } from './helpers.js';

let t;
beforeEach(() => { t = makeTestContext(); });
afterEach(() => t.cleanup());
const items = list => list.map(r => ({ id: r.id, version: r.version }));

describe('POST /api/traditions/reorder', () => {
  it('saves a new order and keeps Starter tags', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    const res = await t.http().post('/api/traditions/reorder').send({ items: items([list[2], list[0], list[1]]) });
    expect(res.body.map(r => r.name)).toEqual(['Mexican folk', 'Eclectic', 'Wiccan']);
    expect(res.body.every(r => r.is_starter === 1)).toBe(true);
  });
  it('refuses a stale version', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    await t.http().patch(`/api/traditions/${list[0].id}`).send({ version: list[0].version, description: 'x' });
    const res = await t.http().post('/api/traditions/reorder').send({ items: items(list).reverse() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('reorder_conflict');
    expect((await t.http().get('/api/traditions')).body.map(r => r.name)).toEqual(['Eclectic', 'Wiccan', 'Mexican folk']);
  });
  it('refuses a list that is missing a row or has an extra one', async () => {
    const { body: list } = await t.http().get('/api/traditions');
    expect((await t.http().post('/api/traditions/reorder').send({ items: items(list.slice(1)) })).body.code).toBe('reorder_conflict');
    await t.http().post('/api/traditions').send({ name: 'New' });
    expect((await t.http().post('/api/traditions/reorder').send({ items: items(list) })).body.code).toBe('reorder_conflict');
  });
  it('rejects bad input', async () => {
    expect((await t.http().post('/api/traditions/reorder').send({ items: 'x' })).status).toBe(400);
  });
});
```

`tests/client/errors.test.jsx`:
```jsx
import { describe, it, expect } from 'vitest';
import { errorText, fieldErrors } from '../../client/src/lib/errors.js';
import { ApiError } from '../../client/src/lib/api.js';

const t = (k, v) => ({ 'error.conflict': 'Cambiado en otra ventana', 'error.too_long': `Máximo ${v?.max}`, 'error.required': 'Obligatorio', 'error.bad_format.color': 'Usa un color' }[k] ?? k);

describe('error text', () => {
  it('translates by code and falls back to the message', () => {
    const e = new ApiError('changed', 409); e.code = 'conflict';
    expect(errorText(e, t)).toBe('Cambiado en otra ventana');
    const u = new ApiError('Odd', 500); u.code = 'never_heard_of_it';
    expect(errorText(u, t)).toBe('Odd');
  });
  it('translates field errors with their limits and hints', () => {
    const e = new ApiError('fix', 400, { name: 'Required', note: 'Keep it short', color: 'Use a color' });
    e.detailCodes = { name: { code: 'required' }, note: { code: 'too_long', max: 5 }, color: { code: 'bad_format', hint: 'color' } };
    expect(fieldErrors(e, t)).toEqual({ name: 'Obligatorio', note: 'Máximo 5', color: 'Usa un color' });
  });
});
```

In `tests/client/traditions.test.jsx`, add a test: the stub answers `POST /api/traditions/reorder` with the reordered rows. Clicking "Move Wiccan down" sends the `items` in the new order.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/reorder.test.js` and `npx vitest run --project client tests/client/errors.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

`client/src/lib/errors.js`:
```js
import en from '../i18n/en.json';

const has = key => Object.hasOwn(en, key);

export function errorText(err, t) {
  const key = err?.code ? `error.${err.code}` : null;
  return key && has(key) ? t(key, err.vars) : (err?.message ?? t('error.server_error'));
}

export function fieldErrors(err, t) {
  const out = {};
  const details = err?.details ?? {};
  const codes = err?.detailCodes ?? {};
  for (const field of new Set([...Object.keys(details), ...Object.keys(codes)])) {
    const c = codes[field];
    const hintKey = c?.hint ? `error.bad_format.${c.hint}` : null;
    if (hintKey && has(hintKey)) out[field] = t(hintKey);
    else if (c && has(`error.${c.code}`)) out[field] = t(`error.${c.code}`, c);
    else out[field] = details[field];
  }
  return out;
}
```

`api.js`:
- the ApiError constructor gains a fifth argument `{ code, vars, detailCodes } = {}`;
- an unreachable server throws with `{ code: 'unreachable' }`;
- `!res.ok` throws with `{ code: data?.code, vars: data?.vars, detailCodes: data?.detailCodes }`;
- the restored case sets `code: 'restored'`.

`useRecordForm.js` calls `const { t } = useT();` and wires errors through the helpers:
- a 400 with details → `setErrors(fieldErrors(err, t))`;
- any other error → `setFormError(errorText(err, t))`.

`LoadState` shows `errorText(error, t)`. Replace `toast.show({ message: err.message })` with `errorText(err, t)` in Traditions.jsx, Backups.jsx and Trash.jsx.

`server/services/reorder.js`:
```js
import { HttpError } from '../http.js';
import { transaction } from '../db/connection.js';
import { NOW } from '../db/migrations.js';

const CONFLICT = () => new HttpError(409, 'The list changed in another window.', undefined, { code: 'reorder_conflict' });

export function reorder(db, table, items) {
  return transaction(db, () => {
    const live = db.prepare(`SELECT id, version, sort_order FROM ${table} WHERE deleted_at IS NULL`).all();
    if (live.length !== items.length) throw CONFLICT();
    const byId = new Map(live.map(r => [r.id, r]));
    const seen = new Set();
    for (const it of items) {
      const row = byId.get(it.id);
      if (!row || row.version !== it.version || seen.has(it.id)) throw CONFLICT();
      seen.add(it.id);
    }
    const up = db.prepare(`UPDATE ${table} SET sort_order = ?, version = version + 1, updated_at = ${NOW} WHERE id = ?`);
    items.forEach((it, i) => { const order = (i + 1) * 10; if (byId.get(it.id).sort_order !== order) up.run(order, it.id); });
  });
}
```

Validate the body in the route. `items` must be an array of 1-1000 objects, each with integer `id` ≥ 1 and integer `version` ≥ 1. Otherwise throw 400 `invalid`.

`server/routes/traditions.js` mounts the reorder route on the crud router, before `/:id` routes:
```js
export function traditionsRouter(ctx) {
  const r = Router();
  r.post('/reorder', (req, res) => { reorder(ctx.db, 'traditions', reorderItems(req.body)); res.json(repos(ctx.db).traditions.list()); });
  r.use(crudRouter(ctx, { repo: db => repos(db).traditions, schema: TRADITION_SCHEMA, starter: true }));
  return r;
}
```
Put `reorderItems(body)` in `server/services/reorder.js` and export it, so categories reuse it.

`useReorder.js`:
```js
import { useCallback } from 'react';
import { api } from './api.js';
import { errorText } from './errors.js';
import { useToast } from '../components/ToastProvider.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function useReorder(list, url) {
  const toast = useToast();
  const { t } = useT();
  return useCallback(async (index, delta) => {
    const rows = [...(list.data ?? [])];
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    [rows[index], rows[to]] = [rows[to], rows[index]];
    try {
      await list.act(() => api.post(`${url}/reorder`, { items: rows.map(r => ({ id: r.id, version: r.version })) }));
    } catch (err) {
      toast.show({ message: errorText(err, t) });
      list.reload();
    }
  }, [list, url, toast, t]);
}
```

`ReorderButtons.jsx` renders two `Button`s, `size="sm" variant="ghost"`, with icons `ArrowUp` and `ArrowDown` from lucide-react, aria-labels from `t('reorder.up'|'reorder.down', { name: label })`, disabled at the ends.

In Traditions.jsx, each row gets `<ReorderButtons index={i} count={list.data.length} onMove={move} label={nameOf(row)} />` before Edit.

`en.json` additions (exact):
```json
"reorder.up": "Move {name} up",
"reorder.down": "Move {name} down",
"error.invalid": "Please fix the highlighted fields.",
"error.required": "Required",
"error.not_text": "Must be text",
"error.too_long": "Keep it to {max} characters or fewer",
"error.bad_format": "Not the right format",
"error.bad_format.color": "Use a color like #6e1f24",
"error.bad_format.feast_day": "Use a day like 12-12 (month-day)",
"error.not_number": "Must be a number",
"error.not_whole": "Must be a whole number",
"error.too_small": "Must be at least {min}",
"error.too_big": "Must be at most {max}",
"error.not_date": "Must be a date (YYYY-MM-DD)",
"error.not_one_of": "Pick one of the choices",
"error.too_many": "No more than {max}",
"error.bad_id": "That link is broken. Go back and try again.",
"error.not_found": "That isn't here any more. It may have been deleted.",
"error.missing_version": "Please reload and try again.",
"error.conflict": "This was changed somewhere else.",
"error.restored": "Your data was restored from a backup in another window. Reload the page to continue.",
"error.unreachable": "Can't reach The Grimoire. It may be closed for the night; start it and try again.",
"error.server_error": "Something went wrong on our side.",
"error.forbidden": "Only allowed from this computer.",
"error.unknown_kind": "Unknown kind of record.",
"error.not_in_trash": "That is not in the Trash.",
"error.reorder_conflict": "The list changed in another window, so it was reloaded. Try again.",
"error.category_in_trash": "Its category is in the Trash. Restore the category first.",
"error.self_link": "An entry can't link to itself.",
"error.not_backup": "That is not a Grimoire backup.",
"error.backup_missing": "Backup not found.",
"error.backup_damaged": "That backup file is damaged, so nothing was changed.",
"error.backup_newer": "That backup was made by a newer version of The Grimoire. Update the app first; nothing was changed.",
"error.backup_foreign": "That file isn't a Grimoire backup, so nothing was changed.",
"error.in_use": "Restore stopped: a database file is in use by another program. Nothing was changed.",
"error.restore_failed": "Restore failed; your data was put back from the safety copy."
```

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. Existing tests that asserted English messages still pass because en.json holds the same text.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Translate error messages and reorder traditions"
```

---

### Task 3: Schema, repos and starter loading for categories and entries

**Files:**
- Modify: `server/db/migrations.js` (migration 3), `server/db/repos.js`, `server/services/starter.js`, `server/services/backup.js` (`checkBackupFile` still requires `settings` and `traditions` and `v >= 2`, so no change unless tests show otherwise)
- Create: `server/content/categories.json`, `server/content/correspondences/` (one empty `[]` file per category: `days.json`, `colors.json`, `elements.json`, `planets.json`, `moon-phases.json`, `sabbats-feasts.json`, `crystals.json`, `saints.json`, `deities.json`), `server/content/links.json` (`[]`)
- Test: `tests/server/db.test.js`, `tests/server/starter.test.js`, `tests/server/content.test.js` (new)

**Interfaces:**
- Migration 3:
```sql
ALTER TABLE traditions ADD COLUMN content_version INTEGER NOT NULL DEFAULT 1;
CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'star',
  sort_order INTEGER NOT NULL DEFAULT 0, starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0,
  content_version INTEGER NOT NULL DEFAULT 1, ${TS});
CREATE TABLE correspondences (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES categories(id),
  name TEXT NOT NULL, summary TEXT, body TEXT, keywords TEXT NOT NULL DEFAULT '[]', feast_day TEXT,
  starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, content_version INTEGER NOT NULL DEFAULT 1, ${TS});
CREATE INDEX idx_corr_category ON correspondences(category_id);
CREATE TABLE correspondence_traditions (correspondence_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
  tradition_id INTEGER NOT NULL REFERENCES traditions(id) ON DELETE CASCADE, PRIMARY KEY (correspondence_id, tradition_id));
CREATE TABLE correspondence_links (a_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES correspondences(id) ON DELETE CASCADE, PRIMARY KEY (a_id, b_id), CHECK (a_id < b_id));
```
- `repos(db).categories` has columns `['name','icon','sort_order','starter_key','is_starter','content_version']`, ordered by `sort_order, name COLLATE NOCASE, id`.
- `repos(db).correspondences` has columns `['category_id','name','summary','body','keywords','feast_day','starter_key','is_starter','content_version']`, ordered by `name COLLATE NOCASE, id`.
- `seedStarter(db, { content = CONTENT_DIR } = {})` returns the number of rows added. The `content` option lets tests use a fixture folder. It:
  1. seeds traditions, then categories, then entries (`correspondences/*.json`), then the entry-to-tradition joins and links;
  2. skips any starter key that is in `starter_removed` or already exists;
  3. skips an entry whose category starter key can't be found as a live or trashed row;
  4. adds links only for pairs where at least one entry was inserted in this run;
  5. updates an existing row only if it is still a starter (`is_starter = 1`), not in the Trash, and its `content_version` is lower than the file's. That copies the file's fields, sets `content_version`, and bumps `version`.
- File formats:
  - `categories.json` is a list of `{ starter_key, name, icon, sort_order, content_version? }`.
  - `correspondences/<slug>.json` is a list of `{ starter_key, category, name, summary, body, keywords: [], feast_day?, traditions: [tradition starter keys], content_version? }`.
  - `links.json` is a list of `[starter_key, starter_key]` pairs.

- [ ] **Step 1: Write failing tests**

`tests/server/starter.test.js` adds tests against a fixture folder `tests/server/fixtures/content/`. It has the real `traditions.json` copied, plus:
- `categories.json` with `category.days` and `category.planets`;
- `correspondences/days.json` with `corr.days.monday` (traditions `tradition.eclectic`);
- `correspondences/planets.json` with `corr.planets.moon` and `corr.planets.ghost`. The ghost's category is `category.missing`.
- `links.json`: `[["corr.days.monday","corr.planets.moon"]]`.

The tests:
```js
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
```
`copyFixtureWith(changes)` is a small helper in the test file. It copies the fixture folder to a temp dir and applies the transforms.

`tests/server/content.test.js` checks the real `server/content` files:
- every file is a JSON array;
- `starter_key` values are unique across all files and match `^category\.[a-z0-9-]+$` or `^corr\.[a-z0-9-]+\.[a-z0-9-]+$`;
- every entry's `category` exists in `categories.json`, and every tradition key exists in `traditions.json`;
- field limits: name ≤ 80, summary ≤ 200, body ≤ 4000, keywords ≤ 20 items of ≤ 30 characters, feast_day a real `MM-DD`;
- every icon is in the fixed list;
- every link pair points at two different existing entry keys, and no pair repeats in either order;
- `name`, `summary` and `body` are non-empty, and nothing contains the word "TODO".

`tests/server/db.test.js` checks the new tables exist and `user_version` is 3.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/starter.test.js tests/server/content.test.js tests/server/db.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add migration 3 exactly as above, then the repos.

Write `categories.json` (exact):
```json
[
  { "starter_key": "category.days", "name": "Days of the week", "icon": "calendar-days", "sort_order": 10 },
  { "starter_key": "category.colors", "name": "Colors", "icon": "palette", "sort_order": 20 },
  { "starter_key": "category.elements", "name": "Elements", "icon": "flame", "sort_order": 30 },
  { "starter_key": "category.planets", "name": "Planets", "icon": "orbit", "sort_order": 40 },
  { "starter_key": "category.moon-phases", "name": "Moon phases", "icon": "moon", "sort_order": 50 },
  { "starter_key": "category.sabbats-feasts", "name": "Sabbats and feasts", "icon": "sun", "sort_order": 60 },
  { "starter_key": "category.crystals", "name": "Crystals", "icon": "gem", "sort_order": 70 },
  { "starter_key": "category.saints", "name": "Saints", "icon": "cross", "sort_order": 80 },
  { "starter_key": "category.deities", "name": "Deities and spirits", "icon": "sparkles", "sort_order": 90 }
]
```
Rewrite `starter.js` as a set of small functions (`seedTraditions`, `seedCategories`, `seedEntries`, `seedLinks`, `applyUpdates`) called inside one `transaction`. `seedStarter` takes `{ content }`, and `context.js` keeps calling `seedStarter(db)`. Keywords are stored as `JSON.stringify(list)`. An update writes `name, summary, body, keywords, feast_day, content_version`, bumps `version` and refreshes the tradition joins. It never touches `category_id`.

- [ ] **Step 4: Run all server tests**

Run: `npx vitest run --project server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add categories, entries and links, and load their starter content"
```

---

### Task 4: Categories API, cascade delete and the Trash

**Files:**
- Create: `server/services/categories.js`, `server/routes/categories.js`
- Modify: `server/services/trash.js`, `server/routes/index.js`, `server/routes/traditions.js` (usage route), `server/routes/crud.js` (optional `remove`/`restore` overrides)
- Test: `tests/server/categories.test.js`, `tests/server/trash.test.js`

**Interfaces:**
- `CATEGORY_SCHEMA`: `name` (`string!`, maxLength 60) and `icon` (one of the fixed list).
- Routes:
  - `GET/POST /api/categories`, `GET/PATCH/DELETE /api/categories/:id`, `POST /api/categories/:id/restore` and `POST /api/categories/reorder`.
  - `GET /api/categories/:id/usage` returns `{ entries: n }` (live entries).
  - `GET /api/traditions/:id/usage` returns `{ entries: n }` (live entries using it).
- `deleteCategory(db, id)`: in one transaction, stamps the category and its live entries with the same `deleted_at`.
- `restoreCategory(db, id)`: restores the category and the entries whose `deleted_at` equals the category's stamp.
- The Trash:
  - `TRASH_TYPES` gains `category` (title: name) and `correspondence` (title: name).
  - `listTrash` leaves out an entry whose category is also in the Trash with the same `deleted_at`, and gives each category row `extra: n`, the number of entries it took with it.
  - `restoreFromTrash('category')` uses `restoreCategory`.
  - `restoreFromTrash('correspondence')` refuses when its category is in the Trash: 409 `category_in_trash`.
  - `deleteForever('category')` also purges the entries deleted with it and records every starter key in `starter_removed`.
  - `emptyTrash` purges entries before categories, to respect foreign keys.
- The Trash screen shows the "+N entries" note through the key `trash.withEntries`.

- [ ] **Step 1: Write failing tests**

`tests/server/categories.test.js`:
```js
it('lists the nine starter categories in order', async () => {
  const res = await t.http().get('/api/categories');
  expect(res.body.map(c => c.starter_key)).toEqual(['category.days','category.colors','category.elements','category.planets','category.moon-phases','category.sabbats-feasts','category.crystals','category.saints','category.deities']);
});
it('creates, renames, changes icon, rejects a bad icon', async () => {
  const { body: c } = await t.http().post('/api/categories').send({ name: 'Runes', icon: 'star' });
  expect(c).toMatchObject({ name: 'Runes', icon: 'star', version: 1 });
  expect((await t.http().patch(`/api/categories/${c.id}`).send({ version: 1, icon: 'leaf' })).body.icon).toBe('leaf');
  const bad = await t.http().post('/api/categories').send({ name: 'X', icon: 'skull' });
  expect(bad.body.detailCodes.icon.code).toBe('not_one_of');
});
it('counts usage', async () => {
  const cat = await makeCategoryWithEntries(t, 2);
  expect((await t.http().get(`/api/categories/${cat.id}/usage`)).body).toEqual({ entries: 2 });
});
it('deletes a category with its entries and restores only those', async () => {
  const cat = await makeCategoryWithEntries(t, 2);
  const early = await makeEntry(t, cat.id, 'Already trashed');
  await t.http().delete(`/api/correspondences/${early.id}`);
  await new Promise(r => setTimeout(r, 5)); // distinct stamps
  await t.http().delete(`/api/categories/${cat.id}`);
  const trash = (await t.http().get('/api/trash')).body;
  expect(trash.find(i => i.type === 'category')).toMatchObject({ id: cat.id, extra: 2 });
  expect(trash.filter(i => i.type === 'correspondence').map(i => i.title)).toEqual(['Already trashed']);
  await t.http().post(`/api/trash/category/${cat.id}/restore`);
  const live = (await t.http().get(`/api/correspondences?category=${cat.id}`)).body.map(e => e.name);
  expect(live).toHaveLength(2);
  expect(live).not.toContain('Already trashed');
});
it('refuses to restore an entry whose category is in the Trash', async () => {
  const cat = await makeCategoryWithEntries(t, 1);
  const [entry] = (await t.http().get(`/api/correspondences?category=${cat.id}`)).body;
  await t.http().delete(`/api/categories/${cat.id}`);
  const res = await t.http().post(`/api/trash/correspondence/${entry.id}/restore`);
  expect(res.body.code).toBe('category_in_trash');
});
it('deleting a category forever deletes its entries forever and keeps starters gone', async () => {
  const { body: cats } = await t.http().get('/api/categories');
  const days = cats.find(c => c.starter_key === 'category.days');
  await t.http().delete(`/api/categories/${days.id}`);
  await t.http().delete(`/api/trash/category/${days.id}`);
  expect(seedStarter(t.ctx.db)).toBe(0);
  expect((await t.http().get('/api/categories')).body.map(c => c.starter_key)).not.toContain('category.days');
});
it('reorders categories', async () => { /* same shape as the traditions reorder test */ });
it('counts tradition usage', async () => { /* make an entry using a tradition; GET /api/traditions/:id/usage -> { entries: 1 } */ });
```
`makeCategoryWithEntries(t, n)` and `makeEntry(t, categoryId, name)` live in `tests/server/helpers.js` and use the API. Task 5 adds the correspondences routes, so these tests are written now and pass after Task 5. Mark them `it.todo` here and switch them to `it` in Task 5 Step 1, or do Tasks 4 and 5 as one dispatch. **Ruling for executors: Tasks 4 and 5 are dispatched together as one task**, because each needs the other's routes for its tests.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/categories.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

`server/services/categories.js`:
```js
import { transaction } from '../db/connection.js';
import { HttpError, notFound } from '../http.js';
import { NOW } from '../db/migrations.js';

export function categoryUsage(db, id) {
  return { entries: db.prepare('SELECT count(*) AS n FROM correspondences WHERE category_id = ? AND deleted_at IS NULL').get(id).n };
}

export function deleteCategory(db, id, stamp = new Date().toISOString()) {
  return transaction(db, () => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL').get(id);
    if (!cat) throw notFound();
    db.prepare('UPDATE correspondences SET deleted_at = ?, version = version + 1 WHERE category_id = ? AND deleted_at IS NULL').run(stamp, id);
    db.prepare('UPDATE categories SET deleted_at = ?, version = version + 1 WHERE id = ?').run(stamp, id);
  });
}

export function restoreCategory(db, id) {
  return transaction(db, () => {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ? AND deleted_at IS NOT NULL').get(id);
    if (!cat) throw new HttpError(404, 'That is not in the Trash.', undefined, { code: 'not_in_trash' });
    db.prepare(`UPDATE correspondences SET deleted_at = NULL, version = version + 1, updated_at = ${NOW} WHERE category_id = ? AND deleted_at = ?`).run(id, cat.deleted_at);
    db.prepare(`UPDATE categories SET deleted_at = NULL, version = version + 1, updated_at = ${NOW} WHERE id = ?`).run(id);
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  });
}

// Entries that went to the Trash with their category (same stamp).
export const groupedEntries = (db, cat) => db.prepare('SELECT * FROM correspondences WHERE category_id = ? AND deleted_at = ?').all(cat.id, cat.deleted_at);
```
`crudRouter` gains optional `remove(ctx, id)` and `restore(ctx, id)` overrides. When given, DELETE and restore call them instead of the repo. Categories pass `deleteCategory` and `restoreCategory`. The trash service is updated as described in Interfaces.

- [ ] **Steps 4-5:** Run the server tests (`npx vitest run --project server`), then commit with `git commit -m "Add categories with cascade delete and restore"`.

---

### Task 5: Entries API: filters, search, traditions and links

**Files:**
- Create: `server/services/correspondences.js`, `server/routes/correspondences.js`
- Modify: `server/validate.js` (rule types `strings`, `ids`, `monthDay`), `server/routes/index.js`
- Test: `tests/server/correspondences.test.js`

**Interfaces:**
- `ENTRY_SCHEMA`:
  - `category_id`: `int!` ≥ 1, must be a live category, else 400 with `detailCodes.category_id = { code: 'not_found' }`
  - `name`: `string!`, max 80
  - `summary`: `string`, max 200
  - `body`: `string`, max 4000
  - `keywords`: `strings`, maxItems 20, maxLength 30. Lower-cased, trimmed and de-duplicated.
  - `feast_day`: `monthDay`, `hintKey: 'feast_day'`
  - `traditions`: `ids`, maxItems 20. Each must be a live tradition.
  - `links`: `ids`, maxItems 50. Each must be a live entry and not the entry itself (`self_link`).
- The new validate rule types:
  - `strings`: an array of strings. Error codes `not_text`, `too_many{max}` and `too_long{max}`.
  - `ids`: an array of integers ≥ 1. Error codes `bad_id` and `too_many{max}`.
  - `monthDay`: matches `^\d{2}-\d{2}$` and is a real day in a leap year. Error code `bad_format`.
- `GET /api/correspondences?category=&tradition=&q=` returns `[{ id, category_id, name, summary, feast_day, is_starter, starter_key, version }]`, live entries only, ordered by name.
  - `q`: a case-insensitive match on name, summary, body or keywords.
  - When the saved language isn't `en`, `q` also matches starter rows (`is_starter = 1`) whose translated `name`, `summary`, `body` or `keywords` in that pack's `content.json` contain `q`.
  - Matching ignores accents: compare with `normalize('NFD').replace(/\p{M}/gu, '')`, lower-cased. Filter in JS after an SQL pre-filter on category and tradition.
- `GET /api/correspondences/:id` returns the row plus:
  - `keywords` as an array;
  - `traditions: [ids of live traditions]`;
  - `links: [{ id, name, category_id, is_starter, starter_key }]` for live linked entries only.
- `POST /api/correspondences` returns 201 with the same shape.
- `PATCH /api/correspondences/:id` takes `{ version, ...fields }`, with `traditions` and `links` replaced as whole lists when present. It is one transaction:
  - update the row with the version check;
  - replace the traditions;
  - replace the links: delete pairs that are no longer listed, insert new pairs as `(min, max)`;
  - bump `version` on every other entry whose link to this one was added or removed.
  - A starter row keeps its tag only if nothing changed. Compare fields, and also the traditions and links lists.
- `DELETE` / `POST :id/restore` / Trash: the restore refuses with `category_in_trash`.
- Hidden links: `GET :id` only lists linked entries that are live. Pairs stay stored while either side is in the Trash.

- [ ] **Step 1: Write failing tests**

`tests/server/correspondences.test.js` covers:
- create with traditions, keywords and feast day → GET shows them; keywords are lower-cased and de-duplicated;
- 400 codes:
  - empty name → `required`;
  - 81-character name → `too_long`;
  - 21 keywords → `too_many`;
  - a 31-character keyword → `too_long`;
  - feast day `13-40` → `bad_format` with hint `feast_day`; `02-29` is accepted;
  - unknown tradition id → `not_found` on `traditions`;
  - unknown category → `not_found` on `category_id`;
- links:
  - A links B → B's GET lists A;
  - A's PATCH removing B → B's version went up and B no longer lists A;
  - B's stale PATCH afterwards gets 409 `conflict` (Review Focus 2);
  - linking to itself → 400 `self_link`;
- a linked entry in the Trash is hidden from the other's links, and comes back after restore;
- filters: `?category=` and `?tradition=` work, and are combined with AND;
- search:
  - `q=protec` matches by keyword and by body, and is accent-insensitive (`q=dia` finds "Día de Muertos");
  - search in Spanish: write `<dataDir>/locales/es/ui.json` (`{"_name":"Español"}`) and `content.json` with a translated summary for a starter key; set language `es`; `q` of a word only in the Spanish summary finds it; after the entry is edited (`is_starter = 0`) it no longer matches the Spanish text (Review Focus 4);
- the starter tag: PATCH with the same values keeps `is_starter = 1`; changing the links list clears it;
- the Tasks 4 tests switched from `it.todo` to `it`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/correspondences.test.js tests/server/categories.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement**

Implement `server/services/correspondences.js`, exporting `listEntries(db, dataDir, { category, tradition, q })`, `getEntry(db, id)`, `createEntry(db, data)` and `updateEntry(db, id, data, version)`. The route stays thin.

Link replacement:
```js
function setLinks(db, id, wanted) {
  const current = new Set(db.prepare('SELECT CASE WHEN a_id = ? THEN b_id ELSE a_id END AS other FROM correspondence_links WHERE a_id = ? OR b_id = ?').all(id, id, id).map(r => r.other));
  const next = new Set(wanted);
  const touched = [];
  for (const other of current) if (!next.has(other)) {
    db.prepare('DELETE FROM correspondence_links WHERE a_id = ? AND b_id = ?').run(Math.min(id, other), Math.max(id, other));
    touched.push(other);
  }
  for (const other of next) if (!current.has(other)) {
    db.prepare('INSERT INTO correspondence_links (a_id, b_id) VALUES (?, ?)').run(Math.min(id, other), Math.max(id, other));
    touched.push(other);
  }
  if (touched.length) db.prepare(`UPDATE correspondences SET version = version + 1, updated_at = ${NOW} WHERE id IN (${touched.map(() => '?').join(',')})`).run(...touched);
  return touched.length > 0;
}
```
Read the saved language with `getSettings(db).language`, and the content pack with `readPack(dataDir, language, 'content')` inside a try/catch that falls back to `{}`. Register the Trash types.

- [ ] **Steps 4-5:** Run all server tests (`npx vitest run --project server`), then commit with `git commit -m "Add correspondence entries with traditions, links and search"`.

---

### Task 6: Shared client pieces: CategoryIcon, ChipsInput, EntryPicker

**Files:**
- Create: `client/src/components/CategoryIcon.jsx`, `client/src/components/ChipsInput.jsx`, `client/src/components/EntryPicker.jsx`
- Test: `tests/client/chips.test.jsx`, `tests/client/entryPicker.test.jsx`

**Interfaces:**
- `CategoryIcon({ name, size = 18 })` maps the fixed icon names to lucide components:
  - `gem` → Gem
  - `palette` → Palette
  - `calendar-days` → CalendarDays
  - `orbit` → Orbit
  - `flame` → Flame
  - `moon` → Moon
  - `sparkles` → Sparkles
  - `cross` → Cross
  - `sun` → Sun
  - `leaf` → Leaf
  - `book-open` → BookOpen
  - `star` → Star
  - Unknown names get Star. The icon is `aria-hidden`. Also export `ICONS` (the name list).
- `ChipsInput({ id, value: string[], onChange, max = 20, maxLength = 30, label })`:
  - typing and pressing Enter or comma adds a chip (trimmed, lower-cased, de-duplicated, ignored if empty or too long);
  - each chip has an × button with aria-label `t('chips.remove', { item })`;
  - Backspace in an empty input removes the last chip;
  - shows `t('chips.limit', { max })` and stops adding at `max`.
- `EntryPicker({ value: {id,name}[], onChange, excludeId })`:
  - a text input; after 250 ms of quiet it searches `/api/correspondences?q=…` through `api.get`, ignoring stale replies with a sequence counter;
  - lists up to 10 results (not `excludeId`, not already chosen) as buttons; clicking adds one;
  - chosen links show as chips with × to remove;
  - errors show `errorText`.

- [ ] **Step 1: Write failing tests**

`chips.test.jsx` covers:
- Enter and comma add a chip, lower-cased;
- duplicates are ignored;
- × removes a chip;
- Backspace on an empty input removes the last chip;
- adding stops at `max` and the limit text shows;
- a 31-character word isn't added.

`entryPicker.test.jsx` (fetch stubbed) covers:
- typing "mo" (fake timers, advance 250 ms) → results show;
- clicking adds a chip and calls onChange with `[{id,name}]`;
- excludeId and already-chosen ids aren't offered;
- a slow first reply arriving after a faster second one is ignored.

- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run --project client tests/client/chips.test.jsx tests/client/entryPicker.test.jsx`; expected FAIL.
- [ ] **Step 3: Implement** the three components exactly as specified. Add to en.json: `"chips.remove": "Remove {item}"`, `"chips.limit": "Up to {max}"`, `"picker.search": "Find an entry to link"`, `"picker.none": "No matches"`.
- [ ] **Step 4: Run the client tests.** Run `npx vitest run --project client`; expected PASS.
- [ ] **Step 5: Commit** with `git commit -m "Add icon, keyword chips and entry picker components"`.

---

### Task 7: Correspondences list, entry page and form

**Files:**
- Create: `client/src/screens/correspondences/Correspondences.jsx`, `EntryPage.jsx`, `EntryForm.jsx`
- Modify: `client/src/App.jsx` (routes), `client/src/i18n/en.json`
- Test: `tests/client/correspondences.test.jsx`, `tests/client/entryForm.test.jsx`

**Interfaces:**
- Routes:
  - `correspondences` → the list;
  - `correspondences/new` → the form; `?category=<id>` presets the category;
  - `correspondences/:id` → the entry page, keyed by id;
  - `correspondences/:id/edit` → the form, keyed by id.
- The list:
  - the PageHeader title is `t('nav.correspondences')` and its action is "Add an entry";
  - a tab bar (role `tablist`) has "All" plus one tab per category, in order, each with its CategoryIcon and translated name (`tc(starter_key,'name',name)` for starters);
  - a tradition select ("All traditions" plus the traditions);
  - a search input (`type="search"`, label `t('corr.search')`), queried 250 ms after the last key;
  - the URL query (`?category=&tradition=&q=`) holds the state, so Back works;
  - results show as a list with the category name, the entry name (translated if a starter), the summary (translated if a starter) and a Starter tag; each row links to the entry page;
  - when the list is empty: `t('corr.empty')`, or `t('corr.noMatches')` when filtering.
  - Data comes from `useResource('/api/correspondences?' + qs)` plus `/api/categories` and `/api/traditions`, with `LoadState keepChildren`.
- The entry page shows:
  - the name, category (with icon) and Starter tag;
  - the summary, then the full text (paragraphs split on blank lines);
  - the feast day, formatted with `Intl.DateTimeFormat(language, { month: 'long', day: 'numeric' })` on a leap year;
  - the traditions (names) and keywords (translated for starters through `tc(key,'keywords')`, which is a comma-separated string in the pack);
  - linked entries as links;
  - Edit and Delete. Delete asks first: `t('corr.deleteTitle', { name })` / `t('corr.deleteBody')`. It then goes to the list and shows a toast with Undo (restore).
  - When the entry is gone (404), it shows `errorText` and a link back.
- The form:
  - uses `useRecordForm` with `submit` doing a POST or a PATCH with the version, through the same version-state pattern as TraditionDialog (including `takeTheirs` adopting `conflict.version`);
  - fields:
    - Name
    - Category (Select)
    - Summary (TextInput, maxLength 200, with a character count)
    - Full text (TextArea rows 10, maxLength 4000)
    - Keywords (ChipsInput)
    - Feast day (two Selects, month and day, both optional, with "None")
    - Traditions (Checkbox per tradition)
    - Links (EntryPicker, `excludeId` = this id)
  - the fieldset is disabled while saving;
  - after saving, it navigates to the entry page (`markSaved` happens inside useRecordForm);
  - Cancel navigates back, and the leave guard asks if the form is dirty;
  - `ConflictDialog` gets `onDismiss`;
  - for an existing record, Save is disabled until something changes.

- [ ] **Step 1: Write failing tests**

`correspondences.test.jsx` (fetch stubbed, with categories, traditions and entries fixtures) covers:
- tabs show in order with "All" first;
- clicking the "Colors" tab sets `?category=` and the list request includes `category=`;
- the tradition filter adds `tradition=`;
- typing in search (fake timers) adds `q=`;
- empty results show the no-matches text;
- a starter row with a Spanish pack (stub `/api/locales/es/*` and settings language `es`) shows the translated name.

`entryForm.test.jsx` covers:
- a new entry posts the right body (`keywords` as an array, `traditions` ids, `links` ids, `feast_day` "12-12" from the two selects);
- edit sends the version;
- a 409 shows the conflict dialog, and "Reload the latest" adopts the version and the next save sends it;
- a 400 with `detailCodes` shows the translated field errors;
- leaving with changes prompts (wrap in `LeaveGuardProvider` and `ConfirmProvider`);
- the entry page deletes, then Undo calls restore.

- [ ] **Step 2: Run them and see them fail.** Run `npx vitest run --project client tests/client/correspondences.test.jsx tests/client/entryForm.test.jsx`; expected FAIL.

- [ ] **Step 3: Implement.** Add en.json keys (exact):
```json
"corr.add": "Add an entry",
"corr.all": "All",
"corr.allTraditions": "All traditions",
"corr.search": "Search correspondences",
"corr.empty": "Nothing here yet.",
"corr.noMatches": "No entries match.",
"corr.name": "Name",
"corr.category": "Category",
"corr.summary": "Summary",
"corr.summaryCount": "{n} of 200",
"corr.body": "Full text",
"corr.keywords": "Keywords",
"corr.feastDay": "Feast day",
"corr.month": "Month",
"corr.day": "Day",
"corr.none": "None",
"corr.traditions": "Traditions",
"corr.links": "Linked entries",
"corr.edit": "Edit entry",
"corr.new": "New entry",
"corr.deleteTitle": "Move {name} to the Trash?",
"corr.deleteBody": "You can restore it from the Trash.",
"corr.deleted": "Moved {name} to the Trash.",
"corr.back": "Back to correspondences",
"trash.type.correspondence": "Entry",
"trash.type.category": "Category",
"trash.withEntries": "and {n} entries"
```
Replace the Placeholder routes in `App.jsx`. Make Trash.jsx show `trash.withEntries` when `item.extra > 0`.

- [ ] **Steps 4-5:** Run `npm test`, then commit with `git commit -m "Add the Correspondences screens"`.

---

### Task 8: Categories in Settings, and tradition delete warnings

**Files:**
- Create: `client/src/screens/settings/Categories.jsx`, `client/src/screens/settings/CategoryDialog.jsx`
- Modify: `client/src/screens/Settings.jsx` (put Categories after Traditions), `client/src/screens/settings/Traditions.jsx` (usage-aware delete confirm), `client/src/i18n/en.json`
- Test: `tests/client/categories.test.jsx`, `tests/client/traditions.test.jsx`

**Interfaces:**
- Categories works the same way as Traditions:
  - list rows show the icon, the name (translated for starters), the Starter tag, ReorderButtons, Edit and Delete;
  - "Add a category" opens CategoryDialog with Name and Icon. The icon field is a radio group of the 12 icons, each with an aria-label of its name.
  - CategoryDialog copies TraditionDialog's guards: dirty-close confirm, version state, ConflictDialog `onDismiss`, Save disabled until something changes, and the fieldset disabled while saving.
- Delete fetches `/api/categories/:id/usage` first. With `entries > 0` the confirm says `t('categories.deleteWithEntries', { name, n })`, otherwise `t('categories.deleteTitle', { name })`. After deleting, a toast with Undo (restore) shows.
- Traditions delete now also confirms. It fetches `/api/traditions/:id/usage` and shows `t('traditions.deleteInUse', { name, n })` when it is used, otherwise `t('traditions.deleteTitle', { name })`.
- en.json additions:
```json
"categories.title": "Categories",
"categories.add": "Add a category",
"categories.edit": "Edit category",
"categories.name": "Name",
"categories.icon": "Icon",
"categories.empty": "No categories yet.",
"categories.deleteTitle": "Move {name} to the Trash?",
"categories.deleteWithEntries": "Move {name} and its {n} entries to the Trash?",
"categories.deleted": "Moved {name} to the Trash.",
"traditions.deleteTitle": "Move {name} to the Trash?",
"traditions.deleteInUse": "{n} entries use {name}. Move it to the Trash anyway? They keep it if you restore it.",
"icon.gem": "Gem", "icon.palette": "Palette", "icon.calendar-days": "Calendar", "icon.orbit": "Orbit",
"icon.flame": "Flame", "icon.moon": "Moon", "icon.sparkles": "Sparkles", "icon.cross": "Cross",
"icon.sun": "Sun", "icon.leaf": "Leaf", "icon.book-open": "Book", "icon.star": "Star"
```

- [ ] **Step 1: Write failing tests**

Cover:
- list order;
- reorder sends items;
- add with an icon;
- edit sends the version;
- delete with usage 3 shows the "and its 3 entries" text; canceling sends nothing;
- tradition delete in use shows the usage text.

- [ ] **Steps 2-5:** See the tests fail, implement, run `npm test`, then commit with `git commit -m "Manage categories in Settings and warn before deleting what's in use"`.

---

### Task 9: Language-pack check script

**Files:**
- Create: `scripts/check-pack.js`
- Modify: `package.json` (`"check-pack": "node scripts/check-pack.js"`), `AGENTS.md` (one line in "Add a language")
- Test: `tests/server/check-pack.test.js`

**Interfaces:**
- `checkPack({ dataDir, code, root }) → { missingUi: string[], missingContent: string[], extra: string[] }`.
  - `missingUi`: keys in `client/src/i18n/en.json` that are missing from `ui.json` (ignoring `_name`).
  - `missingContent`: for every starter row in the content files, the `<starter_key>.name` key, plus `.summary`, `.body` and `.keywords` for entries and `.description` for traditions, when `content.json` lacks it.
  - `extra`: keys in either file that match nothing.
- CLI: `npm run check-pack -- es` reads `config.json` / `GRIMOIRE_DATA_DIR` for the data folder (reusing `loadConfig`), prints three short sections, and exits 0 when nothing is missing, 1 otherwise.

- [ ] **Step 1: Write a failing test** with a temp data folder holding a partial pack. Check the exact missing keys reported.
- [ ] **Steps 2-5:** See it fail, implement, run `npx vitest run --project server`, then commit with `git commit -m "Add a check for missing language-pack keys"`.

---

### Task 10: Browser tests for Stage 2

**Files:**
- Create: `e2e/correspondences.spec.js`
- Modify: `e2e/server.js` only if a helper is needed (for example seeding through the API)

Tests (each starts a fresh server and data folder like Stage 1):
1. **Add, link, restart:**
   - add an entry in "Colors" with keywords, a feast day and a tradition;
   - link it to the starter "Monday" entry if present; otherwise create a second entry and link to that;
   - restart the server and reload;
   - the entry page shows everything, and the other entry lists it back.
2. **Search:** search a keyword → the result shows; open it; Back keeps the query in the box.
3. **Category cascade:**
   - make a category with 2 entries, then delete the category: the confirm mentions 2 entries;
   - the Trash shows the category "and 2 entries";
   - restore it, restart → the category and both entries are back.
4. **Reorder:** move a tradition and a category up in Settings, restart, and check the order held.
5. **Conflict on links:**
   - entries X and Y are linked; window A opens Y's edit form;
   - window B edits X, removes the link to Y, and saves;
   - window A changes Y's summary and saves: it gets "This was changed somewhere else", because B's change bumped Y's version.
6. **Error translation:**
   - write a Spanish pack (ui with `error.required` and the `corr.*` keys) and switch to Spanish;
   - save a new entry with an empty name;
   - the field shows the Spanish text.

Run `npm run test:e2e` twice and `npm test`, then commit with `git commit -m "Add browser tests for correspondences"`.

---

### Task 11: Starter content (controller, with the owner)

This task is **done by the controller in the session, not a subagent**. It needs the owner's review.

For each batch, in this order:

| Batch | Category | Count |
| --- | --- | --- |
| 1 | days | 7 |
| 2 | colors | 12 |
| 3 | elements | 5 (earth, air, fire, water, spirit) |
| 4 | planets | 7 classical |
| 5 | moon phases | 8 |
| 6 | sabbats | 8, in `sabbats-feasts.json` |
| 7 | Mexican feast days | 8, in `sabbats-feasts.json` |
| 8 | crystals | 20 |
| 9 | saints | 12: Catholic saints and the Virgin of Guadalupe |
| 10 | deities and spirits | 16, mixing Wiccan, classical and Mexica figures |

- [ ] **Step 1:** Write the batch into its `server/content/correspondences/<slug>.json`.
  - Original text, following the content rules.
  - Fill in the `traditions` keys and `feast_day` where one applies.
  - Add the obvious links to `links.json` (day and planet, planet and color, and so on).
- [ ] **Step 2:** Run `npx vitest run --project server tests/server/content.test.js`. Expect PASS.
- [ ] **Step 3:** Show the owner 3 sample entries, in English and Spanish, in chat. Wait for "OK" or her changes. Apply any changes to the whole batch where they generalize.
- [ ] **Step 4:** Write the batch's Spanish into the owner's pack at `Documents\The Grimoire Data\locales\es\content.json`. Merge it, keeping existing keys. This file is never committed.
- [ ] **Step 5:** Commit the batch with `git commit -m "Add starter <category> entries"`.

After batch 10:
1. Write the full Spanish `ui.json` (every en.json key, plus `_name: "Español"`), including the starter category and tradition names.
2. Run `npm run check-pack -- es` against the owner's data folder. Expect no missing keys.

---

### Task 12: Docs, install, owner-only entries, PR

- [ ] **Step 1:** Update the README. Stage 2 of 6 is done; mention Correspondences and the starter library. Update the AGENTS.md data-folder notes if anything changed. Run `/unslop`. Commit.
- [ ] **Step 2:** Final verification: `npm test`, `npm run test:e2e` (twice), `npm run build`.
- [ ] **Step 3:** Whole-branch review (Opus), then one fix wave and a scoped re-review, as in Stage 1.
- [ ] **Step 4:** Push the branch to `origin`. Open the PR with screenshots of the list, an entry page and the Spanish view. Run `/greploop` until 5/5.
- [ ] **Step 5:** After the owner says yes:
  1. merge (squash);
  2. on the laptop: `npm run stop`, then `npm install && npm run build`, then start the scheduled task. The database upgrades to migration 3 on start, and the starter entries load.
  3. Then switch her copy to Español in Settings.
- [ ] **Step 6:** Owner-only entries.
  - Show her the folk-saint entries in chat (Santa Muerte, Jesús Malverde, plus any others she names), in English and Spanish.
  - After her OK, add them to her running app through `POST /api/correspondences` (category: Saints; traditions: Mexican folk). They are her own entries, not starters.
  - Never commit them.
- [ ] **Step 7:** Update the owner's global notes: Stage 2 merged, next is Stage 3.

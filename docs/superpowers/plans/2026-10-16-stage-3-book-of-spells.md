# The Grimoire, Stage 3: Book of Spells Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Book of Spells (spells with ingredient lines, steps, timing and traditions; spell kinds in Settings), a "Used in spells" list on correspondence entries, and the three Stage 2 carry-over fixes.

**Architecture:** Builds on Stages 1 and 2 without changing their rules. New tables are versioned, soft-deleted and listed in the Trash. A spell and everything it holds (lines, steps, timing, traditions, feasts) is saved in one request and one transaction, covered by the spell's version. Anything that changes what a spell shows (a linked entry, tradition or kind going to the Trash or coming back) raises that spell's version. The client loads and saves only through `useResource` and `useRecordForm`.

**Tech Stack:** Same as Stage 2: Node 24, Express 5, `node:sqlite`, React 19, React Router 7, Vite, Vitest, Testing Library, Supertest, Playwright, lucide-react. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md` plus the Stage 3 addendum `docs/superpowers/specs/2026-10-16-stage-3-book-of-spells.md`. Where they differ, the addendum wins.

## Global Constraints

- Every Stage 1 and Stage 2 global constraint still applies (see their plans).
- The app folder `<app folder>` stays on `main`. All work happens in this worktree.
- Migrations are append-only. Stage 3 adds migration 4 and never edits 1 to 3.
- New editable tables use `INTEGER PRIMARY KEY AUTOINCREMENT` and the shared `TS` columns.
- Spell limits: title required, up to 200 characters; purpose up to 200; notes up to 4,000; source up to 200; up to 50 ingredient lines (name required, up to 200; amount up to 50); up to 50 steps (text required, up to 1,000); traditions up to 20; feasts up to 20.
- Timing codes, exactly: moon `new, waxing-crescent, first-quarter, waxing-gibbous, full, waning-gibbous, last-quarter, waning-crescent`; day `mon, tue, wed, thu, fri, sat, sun`; planet `sun, moon, mercury, venus, mars, jupiter, saturn`.
- Starter kinds, in order: `spell-kind.spell` "Spell", `spell-kind.ritual` "Ritual", `spell-kind.blessing` "Blessing", `spell-kind.cleansing` "Cleansing", `spell-kind.other` "Other". No starter spells.
- The eight sabbat starter keys are `corr.sabbats-feasts.{samhain,yule,imbolc,ostara,beltane,litha,lughnasadh,mabon}`.
- Every new screen string goes through `t()`, `en.json` holds every key, and errors carry `code`/`detailCodes`.
- The Spanish pack never enters the repo. Text is plain and warm, with no em dashes.
- Tests never touch the real data folder or port 4209.

## Review Focus

1. **A form open while a linked entry goes to the Trash.** Expect the spell's version to go up so the open form gets a conflict instead of saving without the hidden link. Pinned in Task 4.
2. **Saving a spell whose kind, tradition or feast is in the Trash.** Expect the hidden link to survive the save and come back when the record is restored. Pinned in Task 3.
3. **Reordering lines while an amount or link is half-typed.** Expect each line's name, amount and link to move together, with keyboard focus following the moved line. Pinned in Task 6.
4. **Spanish sorting.** Expect "Ámbar" between "Agua" and "Cobre", and starter rows sorted by their Spanish names. Pinned in Task 1.
5. **Deleting forever an entry or kind that spells use.** Expect the ingredient line to stay without its link, the kind to clear, and open forms to get a conflict rather than a 400. Pinned in Tasks 2 and 4.

---

## File map

```
server/
  db/migrations.js            + migration 4 (spell_kinds, spells, spell_traditions, spell_ingredients, spell_steps, spell_timing, spell_feasts)
  db/repos.js                 + spellKinds, spells repos
  services/spellLinks.js      bumpSpellsUsing(db, { entries, traditions, kinds })
  services/spellKinds.js      usage, delete, restore, purge
  services/spells.js          list/search/get/create/update, nested checks
  services/timing.js          MOON_PHASES, DAYS, PLANETS, SABBAT_KEYS
  services/starter.js         + spell kinds seed and updates
  services/trash.js           + spell, kind types; starter_key on items
  services/correspondences.js + bumps on trash/restore/purge, usedInSpells, feasts filter
  services/categories.js, services/traditions.js  + spell bumps
  routes/spells.js, routes/spellKinds.js, routes/correspondences.js (+ /:id/spells, ?feasts=1), routes/index.js
  content/spell-kinds.json; tests/fixtures/base-content/spell-kinds.json
  demo/seed.js                + sample spells; reset clears spell tables
scripts/check-pack.js         + spell-kinds.json names
client/src/
  lib/collate.js              sortByName(rows, nameOf, language)
  lib/timing.js               same codes as the server
  components/ListEditor.jsx   rows with add, remove, up/down, drag
  components/ToggleGroup.jsx  pressed buttons for timing codes
  components/EntryPicker.jsx  + `query` prop
  screens/spells/Spells.jsx, SpellPage.jsx, SpellForm.jsx
  screens/settings/SpellKinds.jsx, SpellKindDialog.jsx
  screens/correspondences/EntryPage.jsx (+ Used in spells), Correspondences.jsx (sort), screens/Trash.jsx (titles)
  theme/global.css            list rows wrap on phone; spell styles
  i18n/en.json                + keys
e2e/spells.spec.js, e2e/settings.spec.js (+ phone row)
docs/evidence/stage-3/*.png
```

---

### Task 1: Stage 2 carry-overs: display-name sorting, Trash titles, phone rows

**Files:**
- Create: `client/src/lib/collate.js`
- Modify: `client/src/screens/correspondences/Correspondences.jsx`, `client/src/screens/correspondences/EntryPage.jsx`, `client/src/components/EntryPicker.jsx`, `client/src/screens/Trash.jsx`, `server/services/trash.js`, `client/src/theme/global.css`
- Test: `tests/client/collate.test.js` (new), `tests/client/correspondences.test.jsx`, `tests/client/trash.test.jsx`, `tests/server/trash.test.js`

**Interfaces:**
- Produces: `sortByName(rows: T[], nameOf: (row: T) => string, language: string) => T[]` (a new array, `Intl.Collator(language, { sensitivity: 'base', numeric: true })`, ties by `id`).
- Produces: each `GET /api/trash` item gains `starter_key` (string or null), set only when the row still has `is_starter = 1`.

- [ ] **Step 1: Write failing tests**
  - `collate.test.js`: `sortByName([{id:1,n:'Cobre'},{id:2,n:'Ámbar'},{id:3,n:'Agua'}], r => r.n, 'es')` gives ids `[3, 2, 1]`; equal names keep id order; input array is unchanged.
  - `correspondences.test.jsx`: with a mocked Spanish pack where `corr.colors.white.name` is "Blanco" and `corr.colors.red.name` is "Rojo", and the server returning Red before White, the list shows Blanco before Rojo. Add the same check for an entry page's linked entries and for picker results.
  - `trash.test.js` (server): a trashed starter tradition's item has `starter_key: 'tradition.wiccan'`; after editing it (is_starter 0) and trashing, `starter_key` is null.
  - `trash.test.jsx` (client): with a pack giving `tradition.wiccan.name` "Wicca", the Trash row title reads "Wicca", and the restore toast uses it too.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/collate.test.js tests/client/correspondences.test.jsx tests/client/trash.test.jsx tests/server/trash.test.js`
Expected: FAIL (no `collate.js`, English order, English titles, no `starter_key`).

- [ ] **Step 3: Implement**
  - `collate.js` as in Interfaces.
  - Sort with `sortByName` and the displayed name (`starterText(tc, row, 'name', row.name)`): the Correspondences list rows, the entry page's `links`, and the picker's results before `.slice(0, 10)`. Lists with a sort order (traditions, categories, category tabs) are not re-sorted.
  - `listTrash`: add `starter_key: row.is_starter ? row.starter_key ?? null : null` to each item.
  - `Trash.jsx`: `const title = item => tc(item.starter_key, 'name', item.title)`, used in the row, the confirm title and the restore toast.
  - CSS: under `@media (max-width: 560px)`, `.list > li` gets `flex-wrap: wrap`; `.list .grow` gets `flex-basis: 100%` so the name and description take the first line and the swatch, reorder, Edit and Delete buttons sit on the next line. Desktop is unchanged.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Sort by the shown name, translate Trash titles, wrap Settings rows on phones"
```

---

### Task 2: Spell kinds on the server (migration 4, starter kinds, routes, Trash)

**Files:**
- Modify: `server/db/migrations.js`, `server/db/repos.js`, `server/services/starter.js`, `server/services/trash.js`, `server/routes/index.js`, `scripts/check-pack.js`
- Create: `server/services/timing.js`, `server/services/spellLinks.js`, `server/services/spellKinds.js`, `server/routes/spellKinds.js`, `server/content/spell-kinds.json`, `tests/fixtures/base-content/spell-kinds.json` (same five kinds)
- Test: `tests/server/spellKinds.test.js` (new), `tests/server/starter.test.js`, `tests/server/db.test.js`, `tests/server/check-pack.test.js`, `tests/server/content.test.js`

**Interfaces:**
- Migration 4, exactly these tables (all `TS` columns where listed):
  - `spell_kinds (id, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0, starter_key TEXT UNIQUE, is_starter INTEGER NOT NULL DEFAULT 0, content_version INTEGER NOT NULL DEFAULT 1, TS)`
  - `spells (id, title TEXT NOT NULL, purpose TEXT, kind_id INTEGER REFERENCES spell_kinds(id) ON DELETE SET NULL, notes TEXT, source TEXT, TS)`
  - `spell_traditions (spell_id → spells ON DELETE CASCADE, tradition_id → traditions ON DELETE CASCADE, PK both)`
  - `spell_ingredients (spell_id → spells ON DELETE CASCADE, position INTEGER NOT NULL, name TEXT NOT NULL, amount TEXT, correspondence_id INTEGER REFERENCES correspondences(id) ON DELETE SET NULL, PK (spell_id, position))`
  - `spell_steps (spell_id → spells ON DELETE CASCADE, position INTEGER NOT NULL, text TEXT NOT NULL, PK (spell_id, position))`
  - `spell_timing (spell_id → spells ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('moon','day','planet')), code TEXT NOT NULL, PK (spell_id, kind, code))`
  - `spell_feasts (spell_id → spells ON DELETE CASCADE, correspondence_id → correspondences ON DELETE CASCADE, PK both)`
  - indexes on `spells(kind_id)`, `spell_ingredients(correspondence_id)`, `spell_feasts(correspondence_id)`, `spell_traditions(tradition_id)`.
- `repos(db).spellKinds` (columns `name, sort_order, starter_key, is_starter, content_version`, order `sort_order, name COLLATE NOCASE, id`); `repos(db).spells` (columns `title, purpose, kind_id, notes, source`, order `title COLLATE NOCASE, id`).
- `services/timing.js`: `MOON_PHASES`, `DAYS`, `PLANETS` (arrays of the codes in Global Constraints), `TIMING = { moon: MOON_PHASES, day: DAYS, planet: PLANETS }`, `SABBAT_KEYS` (the eight keys).
- `services/spellLinks.js`: `bumpSpellsUsing(db, { entries = [], traditions = [], kinds = [] })` raises `version` and `updated_at` of each live spell that has an ingredient or feast pointing at any of `entries`, a join to any of `traditions`, or `kind_id` in `kinds`. Each spell is bumped once.
- `services/spellKinds.js`: `kindUsage(db, id) => { spells: number }` (live spells, 404 if the kind isn't live), `deleteKind(db, id)`, `restoreKind(db, id)` (each one transaction, bumping spells with `kinds: [id]`), `purgeKind(db, row)` (bumps, records `starter_removed`, deletes the row; the FK clears `kind_id`).
- Routes `/api/spell-kinds`: `crudRouter` with schema `{ name: { type: 'string!', maxLength: 60 }, sort_order: { type: 'int', min: 0, max: 10000 } }`, `starter: true`, `remove: deleteKind`, `restore: restoreKind`; plus `POST /reorder` and `GET /:id/usage`, as for traditions.
- Starter: `seedStarter` seeds `spell-kinds.json` with `seedSimple(db, 'spell_kinds', ['name', 'sort_order'], …)` and `applyUpdates` updates `name` on untouched kinds. `seedStarter`'s return count includes kinds.
- Trash: `TRASH_TYPES.kind = { repo: spellKinds, title: row => row.name, restore: restoreKind, purge: purgeKind }`, placed after `category`.
- `check-pack.js`: `expectedContentKeys` adds `spell-kinds.json` with fields `['name']`.

- [ ] **Step 1: Write failing tests** in `spellKinds.test.js`:
  - a fresh context lists the five kinds in order with `is_starter: 1`;
  - add, rename (drops Starter), reorder (and a stale reorder gets `reorder_conflict`), version conflict on a stale rename;
  - `GET /:id/usage` is `{ spells: 0 }` (Task 3 adds a spell-using case);
  - delete puts it in the Trash with type `kind`; restore brings it back; delete forever of a starter kind records `starter_removed` and a re-seed doesn't bring it back.
  - `db.test.js`: `user_version` is 4 and the seven tables exist.
  - `check-pack.test.js`: a pack without `spell-kind.spell.name` lists it as missing.
  - `content.test.js`: `spell-kinds.json` has unique `spell-kind.*` keys, a name each, and the fixture file matches it.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/spellKinds.test.js tests/server/db.test.js tests/server/check-pack.test.js tests/server/content.test.js`
Expected: FAIL (404 on `/api/spell-kinds`, `user_version` 3).

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add spell kinds: tables, starter kinds, routes and Trash"
```

---

### Task 3: Spells on the server

**Files:**
- Create: `server/services/spells.js`, `server/routes/spells.js`
- Modify: `server/routes/index.js`, `server/services/trash.js`
- Test: `tests/server/spells.test.js` (new), `tests/server/spellKinds.test.js` (usage with a spell)

**Interfaces:**
- Request body for `POST /api/spells` and `PATCH /api/spells/:id` (PATCH also needs `version`; any omitted field is left as stored):
  ```
  { title, purpose, kind_id, notes, source,
    traditions: [id], feasts: [id],
    ingredients: [{ name, amount, correspondence_id }],
    steps: [string],
    timing: { moon: [code], day: [code], planet: [code] } }
  ```
- Response (`GET /api/spells/:id`, and every write):
  ```
  { id, title, purpose, kind_id, notes, source, version, created_at, updated_at,
    traditions: [id],                       // live only
    feasts: [{ id, name, starter_key, is_starter, feast_day }],   // live only
    ingredients: [{ name, amount, correspondence_id,              // stored id, even if hidden
                    link: { id, name, starter_key, is_starter } | null }],  // null when not live
    steps: [string],
    timing: { moon: [], day: [], planet: [] } }   // codes in the fixed list order
  ```
  `kind_id` is null in the response when the kind is in the Trash.
- `GET /api/spells?kind=&tradition=&q=` returns live spells `{ id, title, purpose, kind_id, version }` ordered by title. `q` matches title, purpose, ingredient names, steps, notes and source, folded with `fold` from `correspondences.js` (case and accents ignored). `kind`/`tradition` use the `queryId` rule from the correspondences route (move `queryId` to `server/http.js` and import it in both).
- `services/spells.js`: `listSpells(db, filters)`, `getSpell(db, id)`, `createSpell(db, body)`, `updateSpell(db, id, body, version)`. Create and update are one transaction each: check, version check (a stale version gets `VersionConflict` with the shaped current spell before any reference check, as `updateEntry` does), write the row, then replace lines, steps and timing, and set traditions and feasts.
- Checks, all `400 invalid` with field codes from Stage 2's set:
  - row fields through `check()` with `{ title: 'string!' max 200, purpose max 200, kind_id: 'int' min 1, notes max 4000, source max 200, traditions: 'ids' max 20, feasts: 'ids' max 20 }`;
  - `kind_id` must be a live kind (`not_found`), except that `kind_id: null` while the stored kind is in the Trash keeps the stored kind;
  - traditions must be live; feasts must be live entries that have a feast day or one of `SABBAT_KEYS` (`not_found` otherwise). Traditions and feasts are replaced among live rows only; joins to rows in the Trash are kept (the Stage 2 `setTraditions` rule);
  - `ingredients` must be an array of up to 50 objects (`too_many`); per line, errors go under `ingredients.<index>.name` (`required`, `too_long{max:200}`), `ingredients.<index>.amount` (`too_long{max:50}`), and `ingredients.<index>.correspondence_id` (`bad_id`, or `not_found` when no such row exists at all; a row in the Trash is accepted);
  - `steps` must be an array of up to 50 strings; blank steps are dropped after trimming; errors under `steps.<index>` (`not_text`, `too_long{max:1000}`);
  - `timing` keys other than `moon`, `day`, `planet` are ignored; each list is deduplicated, and an unknown code gives `timing.<key>` `not_one_of`.
- Delete and restore are the plain `crudRouter`-style soft delete and restore (children stay in place). `TRASH_TYPES.spell = { repo: spells, title: row => row.title }`, placed first so Empty Trash purges spells before kinds and entries; the FKs cascade the children.

- [ ] **Step 1: Write failing tests** in `spells.test.js`:
  - create with every field returns the response shape above, `version: 1`; `GET` returns the same;
  - PATCH replaces lines, steps and timing in order (send three lines, then two in a new order, and read back exactly two in the new order); version goes up by one;
  - a stale PATCH gets `409 conflict` with the current spell, and nothing changes (lines included);
  - a PATCH whose step 2 is too long saves nothing (row and lines unchanged) and gets `detailCodes['steps.1']` `{ code: 'too_long', max: 1000 }`;
  - field codes: title required and `too_long{max:200}`, 51 lines `too_many{max:50}`, `ingredients.0.name` required, `ingredients.0.amount` `too_long{max:50}`, `ingredients.0.correspondence_id` 9999 `not_found`, `timing.moon` `['blue']` `not_one_of`, a feast pointing at an entry without a feast day `not_found`; an entry with a `feast_day` is accepted, and so is a row given `starter_key 'corr.sabbats-feasts.yule'` (no feast day) directly through `t.ctx.db`, since fixture content has no entries;
  - search: matches an ingredient name and "dia" matches a step "Día de Muertos"; `kind` and `tradition` filters;
  - hidden links kept (Review Focus 2): trash the spell's kind, its tradition and its feast entry; GET shows `kind_id: null`, no tradition, no feast; PATCH the title with the GET's values; restore all three; GET shows all three again;
  - delete, the Trash lists it as `spell` with its title; restore; delete forever removes its lines (count rows in `spell_ingredients`);
  - `spellKinds.test.js`: usage counts one live spell; deleting a kind used by a spell bumps that spell's version; delete forever leaves `kind_id` null and bumps the version (Review Focus 5).

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/spells.test.js tests/server/spellKinds.test.js`
Expected: FAIL (404 on `/api/spells`).

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add spells on the server: lines, steps, timing and search"
```

---

### Task 4: Spells and correspondences together

**Files:**
- Modify: `server/services/correspondences.js`, `server/services/categories.js`, `server/services/traditions.js`, `server/routes/correspondences.js`
- Test: `tests/server/spells.test.js`, `tests/server/correspondences.test.js`

**Interfaces:**
- Consumes: `bumpSpellsUsing` (Task 2).
- `deleteEntry`, `restoreEntry`, `deleteCategory`, `restoreCategory` call `bumpSpellsUsing(db, { entries: ids })` with the same ids they pass to `bumpLinked`. `purgeEntry` calls it before deleting the row. `deleteTradition`/`restoreTradition` call it with `{ traditions: [id] }`.
- `usedInSpells(db, id) => [{ id, title }]`: live spells that use the live entry as an ingredient or a feast, each once (404 if the entry isn't live). Route `GET /api/correspondences/:id/spells`.
- `GET /api/correspondences?feasts=1` limits the list to entries that have a feast day or one of `SABBAT_KEYS` (combines with `q`).

- [ ] **Step 1: Write failing tests**
  - Review Focus 1: a spell links entry E as an ingredient; read the spell (version v); trash E; the spell is at v+1; a PATCH at v gets `409`; restore E bumps it again. Same for a feast, for E's category going to the Trash, and for a tradition.
  - Delete E forever from the Trash: the line is still there with `correspondence_id: null`, `link: null`, and the spell's version went up.
  - `GET /api/correspondences/:id/spells` lists a spell once even when it uses the entry as two lines and a feast; a spell in the Trash is left out.
  - `?feasts=1` returns the entry with a feast day and the Yule row, not a plain entry.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/spells.test.js tests/server/correspondences.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Keep spells in step with the Trash, and list where an entry is used"
```

---

### Task 5: Spell kinds in Settings and the Trash

**Files:**
- Create: `client/src/screens/settings/SpellKinds.jsx`, `client/src/screens/settings/SpellKindDialog.jsx`
- Modify: `client/src/screens/Settings.jsx` (after Categories), `client/src/i18n/en.json`
- Test: `tests/client/spellKinds.test.jsx` (new), `tests/client/trash.test.jsx`

**Interfaces:**
- Follows `Traditions.jsx` and `TraditionDialog.jsx` exactly (list through `useResource('/api/spell-kinds')`, `useReorder`, usage check before delete, undo toast, dialog through `useRecordForm` with the conflict dialog). The dialog has one field, Name (max 60). Starter names show through `tc(starter_key, 'name', name)` and prefill the dialog in the screen language.
- New keys (English): `kinds.title` "Spell kinds", `kinds.add` "Add a kind", `kinds.empty` "No kinds yet.", `kinds.new` "New kind", `kinds.edit` "Edit kind", `kinds.name` "Name", `kinds.deleteTitle` "Delete {name}?", `kinds.deleteInUse` "Delete {name}? {n} spells use it." with `.one` "Delete {name}? 1 spell uses it.", `kinds.deleted` "{name} is in the Trash.", `trash.type.spell` "Spell", `trash.type.kind` "Spell kind".

- [ ] **Step 1: Write failing tests**: renders the five kinds in order; Edit opens the dialog prefilled; save calls PATCH with the version; reorder down sends `/api/spell-kinds/reorder` with ids in the new order; delete of a kind in use shows the count in the confirm; Spanish pack names show. Trash shows "Spell kind" for a `kind` item.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/spellKinds.test.jsx tests/client/trash.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Manage spell kinds in Settings"
```

---

### Task 6: List editor and toggle group components

**Files:**
- Create: `client/src/components/ListEditor.jsx`, `client/src/components/ToggleGroup.jsx`, `client/src/lib/timing.js`
- Modify: `client/src/theme/global.css`, `client/src/i18n/en.json`
- Test: `tests/client/listEditor.test.jsx`, `tests/client/toggleGroup.test.jsx`, `tests/server/timing.test.js` (client and server code lists match)

**Interfaces:**
- `<ListEditor items={T[]} onChange={(items: T[]) => void} blank={() => T} renderItem={(item, index, update: (patch) => void) => ReactNode} itemLabel={(item, index) => string} addLabel={string} max={number} />`
  - Each row: a drag handle (`draggable`, `aria-hidden`), the rendered fields, `ReorderButtons`, and a remove button labeled `t('list.remove', { item })`.
  - Moving keeps each item whole (all its fields go together) and returns focus to the same button on the moved row (Review Focus 3).
  - Dragging a row's handle onto another row moves it there (HTML5 drag events on the `<li>`; tested in Playwright, Task 9).
  - "Add" appends `blank()` and focuses the new row's first input; it's disabled at `max`.
  - Each item carries a client-only `key` (from a counter) used as the React key, so typing in a row survives reorders. Callers strip `key` before saving.
- `<ToggleGroup label={string} options={[{ value, label }]} value={string[]} onChange={(next: string[]) => void} />`: a `role="group"` with `aria-label`, one `<button type="button" aria-pressed>` per option; `onChange` returns values in option order.
- `client/src/lib/timing.js`: `MOON_PHASES`, `DAYS`, `PLANETS`, `TIMING` identical to the server's `services/timing.js`.
- New keys: `list.add` "Add", `list.remove` "Remove {item}", `list.drag` "Drag to move", and timing labels `timing.moon.<code>` ("New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"), `timing.day.<code>` ("Monday" … "Sunday"), `timing.planet.<code>` ("Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn").

- [ ] **Step 1: Write failing tests**
  - ListEditor: three rows with name and amount; click "Move B down"; `onChange` gets `[A, C, B]` with B's amount still with B. B is now last, so its "Move down" is disabled and focus goes to B's "Move up". Keyboard: tab to "Move A down", press Enter; same result for A. Remove focuses the next row's first input (or Add when it was the last). Add is disabled at `max`.
  - ToggleGroup: pressing "Full moon" then "New moon" gives `['new', 'full']`; pressing again removes.
  - `timing.test.js`: client and server lists are deep-equal.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/listEditor.test.jsx tests/client/toggleGroup.test.jsx tests/server/timing.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add a reorderable list editor and a toggle group"
```

---

### Task 7: Book of Spells list, spell page and "Used in spells"

**Files:**
- Create: `client/src/screens/spells/Spells.jsx`, `client/src/screens/spells/SpellPage.jsx`
- Modify: `client/src/App.jsx` (routes `spells`, `spells/:id`), `client/src/screens/correspondences/EntryPage.jsx`, `client/src/theme/global.css`, `client/src/i18n/en.json`
- Test: `tests/client/spells.test.jsx` (new), `tests/client/correspondences.test.jsx`

**Interfaces:**
- Consumes: `sortByName` (Task 1), `TIMING` (Task 6), the spell response shape (Task 3), `GET /api/correspondences/:id/spells` (Task 4).
- `Spells.jsx`: same pattern as `Correspondences.jsx` (filters in the URL: `kind`, `tradition`, `q`; 250 ms search debounce; a kind not in the list means All). Rows show title, kind name and purpose, sorted with `sortByName` by title. Empty book: `spells.empty` and an "Add a spell" button; no matches: `spells.noMatches`.
- `SpellPage.jsx`: title, kind, traditions, purpose, ingredient lines (`amount name`, a live link opens `/correspondences/:id`, otherwise plain text), numbered steps, timing (labels from `timing.*`, plus feast names with their day via `formatFeastDay`), notes split into paragraphs, source; Edit and Delete with confirm and undo toast as on the entry page.
- EntryPage: a "Used in spells" section (`corr.usedIn`), loaded with its own `useResource`, sorted with `sortByName`, hidden when empty, with its own Try again on failure.
- New keys: `spells.add` "Add a spell", `spells.empty` "Your Book of Spells is empty. Write your first spell.", `spells.noMatches` "No spells match.", `spells.search` "Search spells", `spells.allKinds` "All kinds", `spells.allTraditions` "All traditions", `spells.kind` "Kind", `spells.title` "Title", `spells.purpose` "Purpose", `spells.traditions` "Traditions", `spells.ingredients` "Ingredients and tools", `spells.steps` "Steps", `spells.timing` "Timing", `spells.moon` "Moon phases", `spells.days` "Days", `spells.planets` "Planets", `spells.feasts` "Sabbats and feasts", `spells.notes` "Notes", `spells.source` "Source", `spells.back` "Back to the Book of Spells", `spells.deleteTitle` "Delete {name}?", `spells.deleteBody` "It goes to the Trash. You can bring it back from there.", `spells.deleted` "{name} is in the Trash.", `corr.usedIn` "Used in spells".

- [ ] **Step 1: Write failing tests**: list sorts "Ámbar ward" between "Agua" and "Cobre" titles in Spanish; kind filter writes `?kind=` and reloads; empty book shows the note and button; spell page shows a linked line as a link and a hidden one (`link: null`) as plain text, steps numbered in order, "Full moon" and "Friday" in English and their Spanish pack labels; delete moves to the list with an undo toast; entry page shows "Used in spells" with two spells sorted, and nothing when the list is empty.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/spells.test.jsx tests/client/correspondences.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the Book of Spells list and spell page"
```

---

### Task 8: Spell form

**Files:**
- Create: `client/src/screens/spells/SpellForm.jsx`
- Modify: `client/src/App.jsx` (routes `spells/new`, `spells/:id/edit`), `client/src/components/EntryPicker.jsx`, `client/src/theme/global.css`, `client/src/i18n/en.json`
- Test: `tests/client/spellForm.test.jsx` (new), `tests/client/entryPicker.test.jsx`

**Interfaces:**
- Consumes: `ListEditor`, `ToggleGroup`, `TIMING` (Task 6); `EntryPicker`; `useRecordForm`, `ConflictDialog`; the request and response shapes (Task 3).
- `EntryPicker` gains `query` (string, default `''`) appended to its search URL (`&feasts=1` for feasts) and `single` (boolean): in single mode it holds at most one entry and hides the input once one is chosen.
- Structure follows `EntryForm.jsx`: a `SpellFormRoute` keyed by id, a loader waiting for the spell, kinds, traditions, settings and the language pack, then the form. Same `target` handling for a new spell saved twice, same leave guard, same conflict dialog (`takeTheirs` re-picks from the conflict's spell).
- Form values: `title, purpose, kind_id (string), notes, source, traditions: [id], feasts: [{ id, name }], ingredients: [{ key, name, amount, link: { id, name } | null, correspondence_id }], steps: [{ key, text }], timing: { moon, day, planet }`. Each line starts with the stored `correspondence_id` (kept even when `link` is null because the entry is in the Trash). Picking a link sets both `link` and `correspondence_id`; removing it sets both to null. `toBody` strips `key` and `link` and sends `correspondence_id`.
- Field errors for `ingredients.<i>.name` etc. show under the matching row input (`f.errors[key]`).
- Fields: Title (required, Save disabled until it has text), Purpose, Kind (select with "No kind"), Traditions (checkboxes in their sort order), Ingredients and tools (ListEditor; per row: Name, Amount, and a single-entry picker labeled "Link to a correspondence"), Steps (ListEditor; per row a textarea labeled "Step {n}"), Timing (three ToggleGroups and a feasts picker with `query="&feasts=1"`), Notes, Source.
- New keys: `spells.new` "New spell", `spells.edit` "Edit spell", `spells.noKind` "No kind", `spells.ingredientName` "Name", `spells.amount` "Amount", `spells.link` "Link to a correspondence", `spells.addIngredient` "Add an ingredient or tool", `spells.addStep` "Add a step", `spells.step` "Step {n}", `spells.sourceHint` "For example, my own, or the book or person it came from".

- [ ] **Step 1: Write failing tests**
  - New spell: fill title, two lines (one linked through the picker), two steps, Full moon and Friday, a feast; Save posts the exact body (no `key`, `correspondence_id` from the link) and navigates to the spell page.
  - Edit: a line with `link: null` and `correspondence_id: 7` saves `correspondence_id: 7` when untouched, and `null` after the owner removes the link from that row.
  - Moving step 2 up and saving sends the steps in the new order.
  - A 400 with `detailCodes['ingredients.1.name']` shows the message under row 2's Name.
  - A 409 opens the conflict dialog; "Reload the latest" fills the form from the conflict's spell.
  - The leave guard asks when leaving with changes.
  - `EntryPicker` with `query="&feasts=1"` requests `/api/correspondences?q=…&feasts=1`; `single` hides the input after one pick.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/spellForm.test.jsx tests/client/entryPicker.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the spell form"
```

---

### Task 9: Demo samples, browser tests and screenshots

**Files:**
- Modify: `server/demo/seed.js`, `e2e/settings.spec.js`
- Create: `e2e/spells.spec.js`, `docs/evidence/stage-3/*.png`
- Test: `tests/server/demo.test.js`

**Interfaces:**
- Demo: two original sample spells ("A candle for a calm home", a kind of Blessing, three lines, three steps, Monday and Full moon; "Doorway sweep", a kind of Cleansing, two lines, two steps), added once (matched by title); `--reset` also clears the seven spell tables (children first). Demo only, never the real data folder.

- [ ] **Step 1: Write the browser tests** (port 4213, throwaway folder, as in `e2e/correspondences.spec.js`):
  - add a spell with two lines (one linked to a made-up entry), two steps, Full moon, Friday and a feast entry; reorder the steps by dragging and a line with the down button; save; restart the server; reload; everything is there in the new order; the linked entry's page lists the spell under "Used in spells";
  - edit, change a step, leave without saving and confirm the prompt; save; a second window's stale save gets the conflict dialog;
  - delete the spell, find it in the Trash, restore it, and it's back with its lines;
  - add, rename, reorder and delete a spell kind in Settings, restart, and the order holds;
  - screenshots (tagged as evidence): the list, a spell page and the form at desktop and phone width (390 px) in Old Book, the spell page in Book & Folk, and the Settings traditions, categories and kinds rows at phone width before (from `main`, taken first) and after.
  - `demo.test.js`: the demo has the two spells after seeding twice, none after `--reset` and a re-seed without samples.

- [ ] **Step 2: Run them**

Run: `npm run build && npm run test:e2e && npm test`
Expected: all pass; screenshots written to `docs/evidence/stage-3/`. Look at each screenshot and fix anything cramped or overlapping before committing.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add demo spells, browser tests and Stage 3 screenshots"
```

---

### Task 10: Spanish pack (controller, not a subagent)

**Files (outside the repo):**
- `.superpowers\content\es-ui.json` in the app folder (working copy)
- `<data folder>\locales\es\ui.json` and `content.json` (installed only after the owner says yes to merging)

- [ ] **Step 1:** Add Spanish for every new `en.json` key to the working copy, including `.one` forms, in plain warm Spanish without em dashes. Add `spell-kind.{spell,ritual,blessing,cleansing,other}.name` ("Hechizo", "Ritual", "Bendición", "Limpia", "Otro") to a working copy of `content.json`.
- [ ] **Step 2:** Run `check-pack` against a throwaway data folder holding the working copies: `GRIMOIRE_DATA_DIR=<tmp> npm run check-pack -- es`. Expected: 0 missing, 0 extra, 0 bad.
- [ ] **Step 3:** Show the owner a sample of the new Spanish strings before installing.

---

## After the tasks

1. Whole-branch code review (subagent), then one fix wave.
2. Push, open the PR with the screenshots and test results, run `/greploop` to 5/5 with no open comments.
3. Ask the owner before merging. After her yes: merge, check that a recent backup exists, `npm run stop` in the app folder, `git pull` on `main`, `npm run setup`, copy the Spanish pack files into her data folder, start the task, check `/api/health` and that the five kinds and Spanish screens show.

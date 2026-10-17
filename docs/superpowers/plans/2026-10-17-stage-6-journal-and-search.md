# The Grimoire, Stage 6: Journal and Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A journal of dreams, tarot pulls and signs, each with the sky saved at its moment, journal kinds in Settings, a journal section on Today, and one search box that finds a word anywhere in the book.

**Architecture:** Journal kinds and entries are new versioned, soft-deleted record types with the Stage 1 saving rules. An entry's tags and cards are saved with it in one transaction, like ritual supplies. The sky snapshot uses `skyAt` from `server/services/sky.js`, exactly as rituals do. Journal kinds share one kind service and one Settings component with spell kinds instead of copying them. The global search calls each list's own search function so matching never drifts. The client loads and saves only through `useResource` and `useRecordForm`.

**Tech Stack:** As in Stage 5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md` plus the Stage 6 addendum `docs/superpowers/specs/2026-10-17-stage-6-journal-and-search.md`. Where they differ, the addendum wins.

## Global Constraints

- Every Stage 1 to 5 global constraint still applies. The app folder stays on `main`; work happens in this worktree.
- Migrations are append-only. Stage 6 adds migration 7 and never edits 1 to 6.
- Journal kind: name required, up to 60; sort order 0 to 10000 (the spell kind schema).
- Journal entry limits:
  - date `YYYY-MM-DD`, years 1900 to 2100, required; time `HH:MM` (00:00 to 23:59) or empty;
  - title up to 200; text up to 20,000;
  - tags up to 20, each up to 50 after trimming; blank tags dropped; duplicates dropped by `fold` (case and accents), first spelling kept, order kept;
  - cards up to 20 lines: name required, up to 100; position up to 100; reversed boolean. A line with no name and no position is dropped;
  - at least one of title, text or a card, else 400 with `title` code `empty`.
- All dates and times are in Settings `time_zone`. "Today" uses `ctx.now()` in that zone.
- Search: case and accent insensitive through the existing `fold`; the query is trimmed; fewer than 2 characters after trimming gets 400 `too_short` on `q` from `/api/search`.
- Hidden-link rule as in Stage 3: a journal kind in the Trash shows as no kind on entries and is kept on save; its going to the Trash, coming back or being deleted forever raises the entries' versions.
- Every new screen string goes through `t()`. Plain warm text, no em dashes, `.one` forms for counts, no strings joined in code where a template belongs. Tests never touch the real data folder or ports 4209/4211. No personal details in committed files or screenshots. All sample text is original, with no health claims.

## Review Focus

1. **An entry with only cards, or only text.** Expect it to save; an entry with nothing gets the `empty` message on Title, and the form shows it there.
2. **Tags typed as "Luna", "luna " and "Lúna".** Expect one tag, "Luna", and the tag filter to find the entry whichever spelling is used in the URL.
3. **Changing only the title of an old entry.** Expect the saved sky to stay; changing the date or time recomputes it.
4. **A journal kind deleted while an entry form is open.** Expect the entry's version to rise, so the open form conflicts instead of silently dropping the kind.
5. **The global search typed fast in the side bar, then Enter pressed twice.** Expect one search page with the newest words, no duplicate history entries, and results that match what each section's own list shows for the same words.

---

## File map

```
server/
  content/journal-kinds.json      starter kinds (Dream, Tarot, Sign, Other)
  db/migrations.js                + migration 7 (journal_kinds, journal_entries, journal_entry_tags, journal_cards)
  db/repos.js                     + journalKinds, journalEntries repos
  services/kinds.js               shared kind usage/delete/restore/purge for spell and journal kinds
  services/spellKinds.js          becomes a thin use of kinds.js
  services/journal.js             entry CRUD, tags, cards, sky, list and filters, tags in use, entries of a day
  services/search.js              searchAll(db, dataDir, q)
  services/rituals.js             + searchRituals(db, needle)
  services/ownDates.js            + searchOwnDates(db, needle)
  services/starter.js, trash.js, today.js, demo/seed.js
  routes/journal.js, routes/journalKinds.js, routes/search.js, routes/index.js
client/src/
  screens/journal/Journal.jsx, EntryForm.jsx, EntryPage.jsx, CardRow.jsx
  screens/settings/KindList.jsx (from SpellKinds.jsx), KindDialog.jsx (from SpellKindDialog.jsx), Settings.jsx
  screens/search/Search.jsx, components/SearchBox.jsx, components/Sidebar.jsx
  screens/today/Today.jsx, screens/Trash.jsx, App.jsx, i18n/en.json, theme/global.css
tests/fixtures/base-content/journal-kinds.json
e2e/journal.spec.js, docs/evidence/stage-6/*.png
```

---

### Task 1: Journal kinds and journal entries on the server

**Files:**
- Create: `server/content/journal-kinds.json`, `tests/fixtures/base-content/journal-kinds.json` (same four), `server/services/kinds.js`, `server/services/journal.js`, `server/routes/journal.js`, `server/routes/journalKinds.js`
- Modify: `server/db/migrations.js`, `server/db/repos.js`, `server/services/spellKinds.js`, `server/routes/spellKinds.js` (schema moves to a shared place), `server/services/starter.js`, `server/services/trash.js`, `server/routes/index.js`, `server/demo/seed.js` (reset list only)
- Test: `tests/server/journal.test.js`, `tests/server/journalKinds.test.js`, `tests/server/db.test.js`, `tests/server/starter.test.js`, `tests/server/spellKinds.test.js` (must still pass unchanged)

**Interfaces:**
- Migration 7:
  - `journal_kinds` with the same columns as `spell_kinds`;
  - `journal_entries (id, date TEXT NOT NULL, time TEXT, kind_id INTEGER REFERENCES journal_kinds(id) ON DELETE SET NULL, title TEXT, text TEXT, sky TEXT, TS)`, indexes on `date` and `kind_id`;
  - `journal_entry_tags (entry_id → journal_entries CASCADE, position, tag TEXT NOT NULL, PK (entry_id, position))`, index on `tag`;
  - `journal_cards (entry_id → journal_entries CASCADE, position, name TEXT NOT NULL, position_label TEXT, reversed INTEGER NOT NULL DEFAULT 0, PK (entry_id, position))`.
- `server/content/journal-kinds.json`: `journal-kind.dream` "Dream" 1, `journal-kind.tarot` "Tarot" 2, `journal-kind.sign` "Sign" 3, `journal-kind.other` "Other" 4. Seeded and updated by `starter.js` exactly like `spell-kinds.json`.
- `services/kinds.js`: `kindService({ table, ownerTable, ownerColumn, bump })` returning `{ usage(db, id) => { n }, remove(db, id), restore(db, id) => row, purge(db, row) }`. `spellKinds.js` keeps its exported names (`kindUsage` returns `{ spells: n }`) on top of it. `journalKinds.js` usage returns `{ entries: n }`; `bump` raises the version of live entries using the kind.
- `/api/journal-kinds`: the same routes as `/api/spell-kinds` (list, create, patch, delete, restore, `/reorder`, `/:id/usage`).
- `/api/journal`:
  - `GET /?q=&kind=&tag=&from=&to=` lists live entries `{ id, date, time, kind_id, title, excerpt, moon, version }`, newest first (date, time, id descending; an entry with no time sorts before timed entries of the same day). `excerpt` is the first 80 characters of the text, or `null`. `moon` is the saved phase code. `kind_id` is null when the kind is in the Trash. `tag` matches by `fold`. `q` matches title, text, tags, card names and card positions by `fold`.
  - `GET /tags` returns the tags in use on live entries, one spelling per folded tag (the most used, then the first by `localeCompare`), sorted with `localeCompare`.
  - `GET /:id` returns the entry with `kind_id` (stored), `kind: { id } | null` (null while the kind is in the Trash), `tags: [string]`, `cards: [{ name, position, reversed }]`, `sky` (parsed).
  - `POST`, `PATCH /:id` (version), `DELETE /:id`, `POST /:id/restore`. `tags` and `cards` replace their lists when sent. Field errors use detailCodes, including `tags` `too_many`, `tags.<i>` `too_long`, `cards` `too_many`, `cards.<i>.name` `required`/`too_long`, and `title` `empty`. The `empty` check uses the stored values for fields a PATCH leaves out.
  - `kind_id` must be a live kind, except that `null` or the same id is kept while the stored kind is in the Trash (the Stage 3 rule); an id deleted forever is dropped to null.
  - The sky is set on create and recomputed only when `date` or `time` changes.
- Exported for later tasks: `listJournal(db, query)`, `journalOnDay(db, day) => [{ id, time, title, excerpt, kind_id }]` (by time, untimed first), `matchJournal(db, needle) => rows` (the same matching as `q`, already folded needle).
- Trash: `TRASH_TYPES.journal` (title: title, else the first 60 characters of text, else the date) and `TRASH_TYPES.journalKind` (title: name, restore and purge from the kind service).

- [ ] **Step 1: Write failing tests** in `tests/server/journal.test.js` and `tests/server/journalKinds.test.js`:
  - CRUD, restore and 409 conflict for entries and kinds.
  - Every field limit and code above, including `title` `empty` on POST with only a date, and on a PATCH that blanks the only text.
  - Review Focus 1: an entry with only one card saves; one with only text saves.
  - Review Focus 2: tags `["Luna", "luna ", "Lúna", ""]` save as `["Luna"]`; `GET /?tag=luna` and `?tag=LÚNA` both find it; `GET /tags` returns `["Luna"]`.
  - Cards are replaced in one transaction; a PATCH with a bad card line saves nothing (tags unchanged too).
  - Review Focus 3: the sky is set on create (2026-10-25 in America/Chicago gives `full`); a title-only PATCH leaves `sky` byte-for-byte equal; a date PATCH changes it; a time PATCH changes `lit`.
  - List order with three entries on two days (one untimed), and each filter alone and combined, `q` matching a card position.
  - Review Focus 4: deleting a kind raises the entry's version and `kind` becomes null with `kind_id` kept; a PATCH sending the GET's values keeps `kind_id`; restoring shows it again; deleting it forever leaves `kind_id` null.
  - Kind usage counts live entries only.
  - The Trash lists `journal` and `journalKind` rows with the titles above; Empty Trash purges entries and kinds.
  - Starter: the four kinds seed once; one the owner deleted forever is not re-added.
  - `db.test.js` checks version 7.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/journal.test.js tests/server/journalKinds.test.js tests/server/db.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above. Model the entry service on `services/rituals.js` (`checkRitual`, `checkRefs`, `writeChildren`, `shape`) and reuse `fields.js` helpers and `fold`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass, including the untouched spell kind tests.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add journal kinds and journal entries on the server"
```

---

### Task 2: Global search and Today's journal on the server

**Files:**
- Create: `server/services/search.js`, `server/routes/search.js`
- Modify: `server/services/rituals.js`, `server/services/ownDates.js`, `server/services/today.js`, `server/routes/index.js`
- Test: `tests/server/search.test.js`, `tests/server/today.test.js`

**Interfaces:**
- Consumes: `listSpells(db, { q })`, `listEntries(db, dataDir, { q })`, `matchJournal(db, needle)`.
- `searchRituals(db, needle)`: live rituals whose title, plan notes, changes, outcome, supply names or live follow-up texts contain the folded needle; returns `{ id, title, date, status }`, newest date first.
- `searchOwnDates(db, needle)`: live own dates whose title or notes match; `{ id, title, date, yearly }`, by date.
- `searchAll(db, dataDir, q) => { q, groups: { spells, correspondences, rituals, journal, dates } }`, each group `{ total, items }`. Caps: spells, correspondences and journal 20 items; rituals and dates 50. Items:
  - spell `{ id, title, purpose }`;
  - correspondence `{ id, name, summary, category_id, is_starter, starter_key }`;
  - ritual `{ id, title, date, status }`;
  - journal `{ id, date, time, title, excerpt, kind_id }`;
  - date `{ id, title, date, yearly }`.
- `GET /api/search?q=` returns `searchAll`. 400 `too_short` on `q` under 2 characters after trimming, 400 `too_long` over 200.
- Today adds `journal: journalOnDay(db, day)`.

- [ ] **Step 1: Write failing tests**:
  - One word that appears in a spell's steps, a correspondence body, a ritual follow-up, a journal card position and an own date's notes comes back in all five groups.
  - Review Focus 5 (server half): for the same `q`, the spells and correspondences groups hold the same ids, in the same order, as `/api/spells?q=` and `/api/correspondences?q=`.
  - Accents: `q=cafe` finds "Café".
  - In Spanish with a content pack in the test data folder, a translated starter correspondence is found by its Spanish word.
  - Caps and totals with 25 matching journal entries: `total` 25, 20 items.
  - Records in the Trash are never returned; a follow-up of a ritual in the Trash doesn't match.
  - `too_short` and `too_long`.
  - Today's `journal` lists only today's live entries in her zone at a fixed `now` near midnight.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project server tests/server/search.test.js tests/server/today.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the full search and today's journal entries on the server"
```

---

### Task 3: Journal list, entry form and entry page

**Files:**
- Create: `client/src/screens/journal/Journal.jsx`, `EntryForm.jsx`, `EntryPage.jsx`, `CardRow.jsx`
- Modify: `client/src/App.jsx` (routes `journal`, `journal/new`, `journal/:id`, `journal/:id/edit`; drop the Placeholder route), `client/src/i18n/en.json`, `client/src/theme/global.css`
- Test: `tests/client/journal.test.jsx`, `tests/client/journalForm.test.jsx`

**Interfaces:**
- `Journal.jsx`: follows `Spells.jsx` (filters in the URL, debounced search that writes `q`). Filters: search, kind (select of live kinds with "All kinds"), tag (select from `/api/journal/tags` with "All tags"), From, To. Rows link to `/journal/:id` and show the date (and time) in the screen language with `lib/days.js`, the kind name (`tc` for starters), a small `MoonIcon` for `moon`, and the title or the excerpt. "Write an entry" links to `/journal/new`. Empty states: `journal.empty` with no filters, `journal.noMatch` with any.
- `EntryForm.jsx`: follows `RitualForm.jsx` (loader, leave guard, conflict dialog, `takeTheirs`). A new entry's date and time are now in Settings `time_zone` (from `Intl.DateTimeFormat` with that zone); `?date=` sets the date and leaves time empty. Kind starts on the first live kind. Fields: Date, Time, Kind, Title, Text (textarea, 12 rows), Tags (`ChipsInput`), Cards (`ListEditor` with `CardRow`: Card (input with a `datalist` from `t('journal.cardNames').split('|')`), Position, Reversed checkbox). Saves `{ date, time, kind_id, title, text, tags, cards, version }`.
- `EntryPage.jsx`: follows `RitualPage.jsx`. Heading is the title, or the date when there's none. Shows date and time, kind, the sky line (reuse the ritual page's sky line; move it into a small shared component `components/SkyLine.jsx` if it isn't one), tags as links to `/journal?tag=<tag>`, cards with "Reversed" marked, and the text split into paragraphs on blank lines. Edit; Delete with confirm and undo toast, then back to `/journal`.
- New keys (English):

| Key | Text |
| --- | --- |
| `journal.title` | "Journal" |
| `journal.add` | "Write an entry" |
| `journal.empty` | "The journal is empty. Write down a dream, a pull or a sign." |
| `journal.noMatch` | "No entries match." |
| `journal.search` | "Search the journal" |
| `journal.kind` | "Kind" |
| `journal.allKinds` | "All kinds" |
| `journal.noKind` | "No kind" |
| `journal.tag` | "Tag" |
| `journal.allTags` | "All tags" |
| `journal.from` | "From" |
| `journal.to` | "To" |
| `journal.new` | "New entry" |
| `journal.edit` | "Edit entry" |
| `journal.date` | "Date" |
| `journal.time` | "Time" |
| `journal.titleField` | "Title" |
| `journal.text` | "Entry" |
| `journal.tags` | "Tags" |
| `journal.cards` | "Cards drawn" |
| `journal.addCard` | "Add a card" |
| `journal.cardName` | "Card" |
| `journal.cardPosition` | "Position" |
| `journal.reversed` | "Reversed" |
| `journal.cardNames` | the 78 standard card names in English, separated by `|`: the 22 major arcana from "The Fool" to "The World", then Ace to Ten, Page, Knight, Queen and King of Wands, Cups, Swords and Pentacles |
| `journal.sky` | "The sky" |
| `journal.deleteTitle` | "Move this entry to the Trash?" |
| `journal.deleteBody` | "Its tags and cards go with it. You can bring it back from the Trash." |
| `journal.deleted` | "The entry is in the Trash." |
| `journal.back` | "Back to the Journal" |
| `errors.empty` | "Add a title, some words or a card." (only if `errors.js` has no matching code text yet) |

- [ ] **Step 1: Write failing tests**:
  - The list fetches with the URL filters, writes `q`, `kind`, `tag`, `from`, `to` to the URL, shows both empty states, and shows the excerpt when there's no title.
  - The form: a new entry starts on today's date in the Settings zone and the first kind; `?date=` presets the date; the save posts the exact body with tags and cards; Review Focus 1 (client half): an empty save shows the `empty` text on Title; the 409 dialog with Keep mine; the leave guard.
  - The page: sky line, tag links, a reversed card marked, paragraphs, delete with undo.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project client tests/client/journal.test.jsx tests/client/journalForm.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the journal list, the entry form and the entry page"
```

---

### Task 4: Journal kinds in Settings, Today's journal and the Trash

**Files:**
- Create: `client/src/screens/settings/KindList.jsx`, `client/src/screens/settings/KindDialog.jsx`
- Modify: `client/src/screens/settings/SpellKinds.jsx` and `SpellKindDialog.jsx` (become thin uses of the shared ones, or are replaced by them), `client/src/screens/Settings.jsx`, `client/src/screens/today/Today.jsx`, `client/src/screens/Trash.jsx` (if types need labels), `client/src/i18n/en.json`
- Test: `tests/client/spellKinds.test.jsx` (unchanged, still passes), `tests/client/journalKinds.test.jsx`, `tests/client/today.test.jsx`, `tests/client/trash.test.jsx`

**Interfaces:**
- `KindList({ endpoint, keys, usageCount })`: the current `SpellKinds` body with the endpoint and text keys passed in. `usageCount(usage) => n` reads `spells` or `entries`. Spell kinds keep their `kinds.*` keys; journal kinds use `journalKinds.*`.
- Settings shows "Journal kinds" after "Spell kinds".
- Today: the `today.laterJournal` note is replaced by a "Journal" section with a "Write in the journal" link (`/journal/new`) and today's entries (time, then title or excerpt, linking to the entry). The section is always shown; the list only when not empty.
- New keys (English):

| Key | Text |
| --- | --- |
| `journalKinds.title` | "Journal kinds" |
| `journalKinds.add` | "Add a kind" |
| `journalKinds.empty` | "No journal kinds yet." |
| `journalKinds.deleteTitle` | "Move {name} to the Trash?" |
| `journalKinds.deleteInUse` | "Move {name} to the Trash? {n} entries use it." |
| `journalKinds.deleteInUse.one` | "Move {name} to the Trash? 1 entry uses it." |
| `journalKinds.deleted` | "{name} is in the Trash." |
| `journalKinds.new` | "New journal kind" |
| `journalKinds.editTitle` | "Edit journal kind" |
| `today.journal` | "Journal" |
| `today.writeJournal` | "Write in the journal" |
| `trash.type.journal` | "Journal entry" |
| `trash.type.journalKind` | "Journal kind" |

  Add any other key the shared dialog needs under `journalKinds.*`, matching the `kinds.*` key it replaces. Remove `today.laterJournal`.

- [ ] **Step 1: Write failing tests**: journal kinds add, rename, reorder and delete with the in-use count and undo; spell kind tests unchanged; Today shows the link always and today's entries when present; the Trash labels both new types.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project client tests/client/journalKinds.test.jsx tests/client/today.test.jsx tests/client/trash.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add journal kinds to Settings and the journal to Today"
```

---

### Task 5: The side bar search box and the search page

**Files:**
- Create: `client/src/components/SearchBox.jsx`, `client/src/screens/search/Search.jsx`
- Modify: `client/src/components/Sidebar.jsx`, `client/src/App.jsx` (route `search`), `client/src/i18n/en.json`, `client/src/theme/global.css`
- Test: `tests/client/search.test.jsx`, `tests/client/shell.test.jsx`

**Interfaces:**
- `SearchBox`: a `role="search"` form with a labelled input and a submit button (lucide `Search` icon with an accessible name). Submitting trims the words and navigates to `/search?q=<words>`; when already on `/search` with the same `q` it does nothing, and from `/search` it replaces the history entry instead of pushing (Review Focus 5). On `/search` it shows the page's `q`. It sits under the brand in the side bar, so it is in the phone menu too.
- `Search.jsx`: reads `q` from the URL. Under 2 characters: `search.tooShort` and no request. Otherwise loads `/api/search?q=` through `useResource` and shows the groups in order, leaving out empty ones. Each group has a heading with its count (`search.count`), up to its items, and, for spells, correspondences and journal when `total > items.length`, a "See all" link to `/spells?q=`, `/correspondences?q=`, `/journal?q=`. Item lines: spell purpose; correspondence category name and summary (`tc` for starters); ritual date and status (`rituals.status.*`); journal date and kind; own date's date. Links: `/spells/:id`, `/correspondences/:id`, `/rituals/:id`, `/journal/:id`, `/calendar/dates/:id`. No results at all: `search.none`.
- New keys (English):

| Key | Text |
| --- | --- |
| `search.label` | "Search the book" |
| `search.button` | "Search" |
| `search.title` | "Search" |
| `search.tooShort` | "Type at least two letters to search." |
| `search.none` | "Nothing in the book matches \"{q}\"." |
| `search.results` | "Results for \"{q}\"" |
| `search.count` | "{n} found" |
| `search.count.one` | "1 found" |
| `search.seeAll` | "See all {n}" |
| `search.group.spells` | "Spells" |
| `search.group.correspondences` | "Correspondences" |
| `search.group.rituals` | "Rituals" |
| `search.group.journal` | "Journal" |
| `search.group.dates` | "Dates" |

- [ ] **Step 1: Write failing tests**:
  - The box navigates to `/search?q=` with trimmed words; pressing Enter twice from `/search` leaves one history entry; it shows the current `q` on the search page.
  - The page: the too-short note without a request; groups in order with counts; empty groups left out; "See all" only when there are more and only for the three groups; the none text.
  - The shell test finds the search box in the side bar.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run --project client tests/client/search.test.jsx tests/client/shell.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the side bar search and the search page"
```

---

### Task 6: Demo entries, browser tests and screenshots

**Files:**
- Modify: `server/demo/seed.js`
- Create: `e2e/journal.spec.js`, `docs/evidence/stage-6/*.png`
- Test: `tests/server/demo.test.js`

**Interfaces:**
- Demo data, added once by title:
  - a dream entry from two days ago with tags `water` and `house`;
  - a tarot entry from yesterday, "Three cards for the week", with three cards (one reversed) and positions;
  - a sign entry today.
  The reset clears `journal_cards`, `journal_entry_tags`, `journal_entries` and `journal_kinds`, children first. All text is original, plain and warm, with no health claims.

- [ ] **Step 1: Write the browser tests** (port 4213, throwaway folder):
  - Write a tarot entry with two cards (one reversed) and two tags. Restart and reload; check every field and the sky line.
  - Find it from the side bar search by a card position; open it from the Journal group.
  - Filter the Journal by one of its tags.
  - Edit the title only and check the sky is unchanged.
  - Delete it, restore it from the Trash, and check its cards came back.
  - Add a journal kind in Settings and use it on a new entry.
  - Today shows "Write in the journal" and today's entry.
  - Evidence screenshots, only with `EVIDENCE=1` and clipped to the page: the Journal list, the entry form with cards, an entry page, the search page, and Today. Each in Book & Folk at desktop and 390 px, with no overflow. Look at each one.
  - `demo.test.js`: the samples appear once.

- [ ] **Step 2: Run them**

Run: `npm run build && npm run test:e2e && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add demo journal entries, browser tests and Stage 6 screenshots"
```

---

### Task 7: Spanish pack (controller, not a subagent)

- [ ] **Step 1:** Write Spanish for every new key in `.superpowers/content/es-stage6.json` (the 78 card names in their usual Spanish names), the starter kind names for her content pack (`journal-kind.<code>.name`), and list the keys to remove (`today.laterJournal`).
- [ ] **Step 2:** Merge it into a throwaway copy of the owner's pack and run `check-pack es`. Expected: 0 missing, 0 extra, 0 bad.
- [ ] **Step 3:** Install only after her yes to merging.

---

## After the tasks

1. Run the whole-branch review (most capable model), then one fix wave and one scoped re-review.
2. Push the full history to `private`. Open the public PR from one clean commit, then run `/greploop` until 5/5.
3. Ask the owner before merging. Then install the same way as Stage 5: stop, pull, setup, update the pack, start, and check.

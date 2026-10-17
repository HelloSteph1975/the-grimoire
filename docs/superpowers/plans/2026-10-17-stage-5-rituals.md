# The Grimoire, Stage 5: Rituals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan rituals from spells with suggested dates, keep a supplies checklist and reminders, log how they went with a sky snapshot, add follow-ups, and show rituals on Today, the calendar and spell pages.

**Architecture:** Rituals and follow-ups are new versioned, soft-deleted record types with the Stage 1 saving rules. A ritual's supplies are saved with it in one transaction, like spell lines. All sky work goes through `server/services/sky.js`. Suggestions reuse `moonPhaseOnDay` and the calendar's feast and sabbat day rules. The client loads and saves only through `useResource` and `useRecordForm`.

**Tech Stack:** As in Stage 4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md` plus the Stage 5 addendum `docs/superpowers/specs/2026-10-17-stage-5-rituals.md`. Where they differ, the addendum wins.

## Global Constraints

- Every Stage 1 to 4 global constraint still applies. The app folder stays on `main`; work happens in this worktree.
- Migrations are append-only. Stage 5 adds migration 6 and never edits 1 to 5.
- Ritual limits:
  - title required, up to 200;
  - date `YYYY-MM-DD`, years 1900 to 2100; time `HH:MM` (00:00 to 23:59) or empty;
  - reminder empty or a whole number 0 to 30;
  - plan notes, "what was different" and "how it went" each up to 4,000;
  - rating empty or 1 to 5;
  - status `planned`, `done` or `skipped`;
  - traditions up to 20;
  - supplies up to 50 lines (name required, up to 200; amount up to 50; checked boolean).
  Follow-up: date `YYYY-MM-DD`, text required, up to 2,000.
- All dates and times are in Settings `time_zone`. "Today", "past" and "due" use the server's `ctx.now()` in that zone.
- The weekday planet map is fixed: sun sun, mon moon, tue mars, wed mercury, thu jupiter, fri venus, sat saturn.
- Suggestions: up to 10 days in the next 90 days from `from` (default tomorrow), ranked by groups met, then date. Moon matching uses `moonPhaseOnDay`.
- Hidden-link rule as in Stage 3: a spell or tradition in the Trash is hidden on rituals and kept on save; its going to the Trash or coming back raises the rituals' versions.
- Every new screen string goes through `t()`. Plain warm text, no em dashes, `.one` forms for counts, and no strings joined in code where a template belongs. Tests never touch the real data folder or ports 4209/4211. No personal details in committed files or screenshots.

## Review Focus

1. **Editing a ritual while a follow-up is added in another window.** Expect both to save: follow-ups are separate records.
2. **Changing a ritual's date.** Expect the sky snapshot to update. Saving other fields leaves it alone.
3. **A spell going to the Trash while a ritual form is open.** Expect the ritual's version to rise, so the open form conflicts instead of dropping the hidden spell link.
4. **A ritual planned for today with a time later today.** Expect it in Planned, not To log, until the day has passed in her zone. Its reminder shows on Today.
5. **Ticking supplies quickly on the ritual page.** Expect each tick to save with the current version and none to be lost. A conflict reloads with a message.

---

## File map

```
server/
  db/migrations.js            + migration 6 (rituals, ritual_traditions, ritual_supplies, ritual_followups)
  db/repos.js                 + rituals, followups repos
  services/sky.js             + WEEKDAY_PLANET, skyAt(day, time, zone)
  services/rituals.js         CRUD, supplies, log fields, sky snapshot, list by tab and filters
  services/followups.js       CRUD, Trash rules
  services/suggestions.js     suggestDays(db, spellId, from, settings)
  services/calendar.js        + kind 'ritual'
  services/today.js           + week, reminders
  services/spells.js, spellLinks.js, traditions.js, trash.js
  routes/rituals.js, routes/followups.js, routes/spells.js (+ /:id/suggestions, /:id/rituals, /:id/usage)
client/src/
  screens/rituals/Rituals.jsx, RitualForm.jsx, RitualPage.jsx, LogForm.jsx, FollowUps.jsx
  screens/spells/SpellPage.jsx (+ Rituals section, delete confirm count)
  screens/today/Today.jsx (+ this week, reminders), screens/calendar/* (+ ritual mark)
  App.jsx, i18n/en.json, theme/global.css
e2e/rituals.spec.js, docs/evidence/stage-5/*.png
```

---

### Task 1: Rituals and follow-ups on the server

**Files:**
- Modify: `server/db/migrations.js`, `server/db/repos.js`, `server/services/sky.js`, `server/services/spells.js` (or `spellLinks.js`), `server/services/traditions.js`, `server/services/trash.js`, `server/routes/index.js`, `server/routes/spells.js`, `server/demo/seed.js` (reset list)
- Create: `server/services/rituals.js`, `server/services/followups.js`, `server/routes/rituals.js`, `server/routes/followups.js`
- Test: `tests/server/rituals.test.js`, `tests/server/followups.test.js`, `tests/server/sky.test.js`, `tests/server/db.test.js`

**Interfaces:**
- Migration 6:
  - `rituals (id, title TEXT NOT NULL, spell_id INTEGER REFERENCES spells(id) ON DELETE SET NULL, date TEXT NOT NULL, time TEXT, reminder_days INTEGER, plan_notes TEXT, status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','skipped')), changes TEXT, outcome TEXT, rating INTEGER, sky TEXT, TS)`, indexes on `date`, `spell_id`;
  - `ritual_traditions (ritual_id → rituals CASCADE, tradition_id → traditions CASCADE, PK)`;
  - `ritual_supplies (ritual_id → rituals CASCADE, position, name TEXT NOT NULL, amount TEXT, checked INTEGER NOT NULL DEFAULT 0, PK (ritual_id, position))`;
  - `ritual_followups (id, ritual_id INTEGER NOT NULL REFERENCES rituals(id) ON DELETE CASCADE, date TEXT NOT NULL, text TEXT NOT NULL, TS)`, index on `ritual_id`.
- `sky.js`: `WEEKDAY_PLANET` (the fixed map) and `skyAt(day, time, zone) => { moon: code, lit: 0..1, weekday: 'mon'..'sun', planet }`. It uses `moonPhaseOnDay(day, zone)` for the code and the lit fraction at `time` (or noon) in the zone.
- `/api/rituals`:
  - `GET /?tab=planned|tolog|log&spell=&tradition=&rating=&from=&to=` lists rituals `{ id, title, spell_id, date, time, status, rating, version }`.
    - `planned`: status planned and date ≥ today, ascending by date and time.
    - `tolog`: status planned and date < today, ascending.
    - `log`: done or skipped, descending.
    - `rating` means at least that rating. `from`/`to` bound the date.
  - `GET /:id` returns the ritual plus `traditions` (live), `supplies: [{ name, amount, checked }]`, `sky` (parsed), and `spell: { id, title } | null` (null when the spell is in the Trash; `spell_id` stays).
  - `POST`, `PATCH /:id` (version), `DELETE`, `POST /:id/restore`.
  - The body takes any of the fields; `supplies` replaces the list. Field errors use detailCodes, including `supplies.<i>.name` and `rating` `too_big`/`too_small`.
  - `spell_id` must be a live spell, except that `null` or the same id is kept while the stored spell is in the Trash (the Stage 3 rule). An id that was deleted forever is dropped to null (the Stage 3 Greptile rule).
  - Traditions use `setLiveJoins`.
  - The sky is recomputed on create and when `date` or `time` changes.
- `/api/followups`: `GET ?ritual=<id>` (live follow-ups of a live ritual, by date then id), `POST { ritual_id, date, text }`, `PATCH /:id`, `DELETE /:id`, `POST /:id/restore`. Restore gets `409 ritual_in_trash` while the ritual is in the Trash. A follow-up of a ritual in the Trash isn't listed and can't be edited (404).
- Trash: `TRASH_TYPES.ritual` (title from `title`) and `TRASH_TYPES.followup` (title: the first 60 characters of the text). Empty Trash purges follow-ups before rituals.
- Spell links: sending a spell to the Trash, restoring it, or deleting it forever raises the version of live rituals that use it (add `rituals` to the spell delete, restore and purge paths). Tradition delete and restore raise the version of rituals joined to the tradition.
- `GET /api/spells/:id/rituals` → `{ planned: [...], past: [...] }` (live rituals of that spell). `GET /api/spells/:id/usage` → `{ rituals: n }` (live rituals).

- [ ] **Step 1: Write failing tests**:
  - Full CRUD and conflict, plus every field code above.
  - Supplies are replaced in one transaction; a PATCH with a bad line saves nothing.
  - Review Focus 2: the sky is set on create (check a known full-moon day in America/Chicago gives `full`); it changes when the date changes; a title-only PATCH leaves it alone.
  - Tab membership with a fixed `now` (Review Focus 4: today with a later time is planned).
  - Filters.
  - Review Focus 3: a spell in the Trash bumps the ritual and hides `spell`; a PATCH with the GET's values keeps `spell_id`; after restore `spell` shows again.
  - The spell deleted forever leaves `spell_id` null.
  - Follow-ups: CRUD, conflict, hidden while the ritual is in the Trash, `ritual_in_trash` on restore.
  - Review Focus 1: editing a follow-up doesn't change the ritual's version.
  - Trash listing and Empty Trash.
  - `db.test.js` checks version 6.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/rituals.test.js tests/server/followups.test.js tests/server/sky.test.js tests/server/db.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add rituals and follow-ups on the server"
```

---

### Task 2: Suggestions, calendar rituals and Today additions on the server

**Files:**
- Create: `server/services/suggestions.js`
- Modify: `server/routes/spells.js`, `server/services/calendar.js`, `server/services/today.js`
- Test: `tests/server/suggestions.test.js`, `tests/server/calendar.test.js`, `tests/server/today.test.js`

**Interfaces:**
- `suggestDays(db, spellId, fromDay, settings) => [{ day, met: { moon: [], days: [], planets: [], feasts: [id] } }]`. It follows the addendum's "Suggested timing": groups are only those the spell has, the score is the count of groups met, days with a score of 0 are left out, results are sorted by score descending then day, and at most 10 come back from `fromDay` to `fromDay + 89`. Feast days come from the calendar's rules. Factor a shared `feastDaysFor(db, entryIds, range, settings)` out of `calendar.js` instead of copying, and include hidden feasts here.
- `GET /api/spells/:id/suggestions?from=` returns `{ suggestions }`. `from` defaults to tomorrow in the zone. A spell that's not live gets 404. A bad `from` gets 400 `bad_format`.
- Calendar: kind `ritual` items `{ day, kind: 'ritual', ritual: { id, title, status, time } }` for live rituals in range. Kind order becomes moon, sabbat, feast, saint, ritual, own. `coming` on Today leaves rituals out, since they have their own section.
- Today adds two lists:
  - `week: [{ id, title, date, time, spell_id }]`: planned rituals from today to today + 6, by date and time;
  - `reminders: [{ id, title, date, days_away }]`: planned rituals with `reminder_days` set, where `date - reminder_days ≤ today ≤ date`.

- [ ] **Step 1: Write failing tests**:
  - Suggestions, with a fixed `from` and Chicago:
    - a spell with moon `full` gets the full-moon day of 2026-10-25 first;
    - a spell with `full` plus `fri` ranks a day meeting both above days meeting one;
    - a spell with planet `venus` returns only Fridays;
    - a spell with a feast entry `10-31` gets 2026-10-31 with `met.feasts`;
    - a spell with no timing returns `[]`;
    - there are at most 10 results, all within 90 days;
    - a trashed spell gets 404.
  - The calendar shows a planned ritual on its day with the new kind order.
  - Today's `week` and `reminders` at fixed `now` values cover the edges: the reminder start day, the ritual day, and the day after.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/suggestions.test.js tests/server/calendar.test.js tests/server/today.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add ritual date suggestions and rituals on the calendar and Today"
```

---

### Task 3: Rituals list and the plan form

**Files:**
- Create: `client/src/screens/rituals/Rituals.jsx`, `client/src/screens/rituals/RitualForm.jsx`
- Modify: `client/src/App.jsx` (routes `rituals`, `rituals/new`, `rituals/:id/edit`; `rituals/new?spell=<id>&date=<day>` presets), `client/src/i18n/en.json`, `client/src/theme/global.css`
- Test: `tests/client/rituals.test.jsx`, `tests/client/ritualForm.test.jsx`

**Interfaces:**
- `Rituals.jsx`: three tabs (Planned, To log, Log) as pressed buttons, kept in the URL as `?tab=`. The Log tab adds filters for spell (select), tradition (select), rating (at least), from and to, all kept in the URL. Each row shows the date and time in the screen language (UTC-safe day formatting from `lib/days.js`), the title, the spell name, and a rating as stars for logged rituals. To log rows get a "Log it" link (`/rituals/:id/log`). There's an "Add a ritual" link. Empty states have their own text per tab.
- `RitualForm.jsx` follows the SpellForm pattern (loader, `target`, leave guard, conflict dialog, `takeTheirs` re-picks). Fields:
  - Title;
  - Spell (a select of live spells, sorted by title, with "No spell"). Choosing a spell copies its traditions, and copies its ingredients into supplies only if supplies are still empty. It also fills the title if empty and loads `/api/spells/:id/suggestions`;
  - Suggestions: buttons showing the date and what each met (phase, day and planet labels from `timing.*`, feast names through `starterText`). Pressing one sets the date and moves focus to the time field;
  - Date and Time;
  - Reminder (a select of None, then 0 to 7, 14 and 30 days before);
  - Traditions (checkboxes);
  - Supplies (`ListEditor` with Name, Amount and a Checked checkbox);
  - Plan notes.
- New keys (English):

| Key | Text |
| --- | --- |
| `rituals.title` | "Rituals" |
| `rituals.tab.planned` | "Planned" |
| `rituals.tab.tolog` | "To log" |
| `rituals.tab.log` | "Log" |
| `rituals.add` | "Add a ritual" |
| `rituals.empty.planned` | "Nothing planned yet." |
| `rituals.empty.tolog` | "Nothing waiting to be logged." |
| `rituals.empty.log` | "Nothing logged yet." |
| `rituals.logIt` | "Log it" |
| `rituals.filter.spell` | "Spell" |
| `rituals.filter.tradition` | "Tradition" |
| `rituals.filter.rating` | "Rating at least" |
| `rituals.filter.from` | "From" |
| `rituals.filter.to` | "To" |
| `rituals.allSpells` | "All spells" |
| `rituals.allTraditions` | "All traditions" |
| `rituals.anyRating` | "Any rating" |
| `rituals.new` | "Plan a ritual" |
| `rituals.edit` | "Edit ritual" |
| `rituals.titleField` | "Title" |
| `rituals.spell` | "Spell" |
| `rituals.noSpell` | "No spell" |
| `rituals.suggestions` | "Suggested days" |
| `rituals.noSuggestions` | "This spell has no timing, so there are no suggestions. Pick any day." |
| `rituals.met` | "Matches: {list}" |
| `rituals.date` | "Date" |
| `rituals.time` | "Time" |
| `rituals.reminder` | "Reminder" |
| `rituals.reminderNone` | "None" |
| `rituals.reminderDays` | "{n} days before" |
| `rituals.reminderDays.one` | "1 day before" |
| `rituals.reminderSameDay` | "On the day" |
| `rituals.traditions` | "Traditions" |
| `rituals.supplies` | "Supplies" |
| `rituals.addSupply` | "Add a supply" |
| `rituals.supplyName` | "Name" |
| `rituals.supplyAmount` | "Amount" |
| `rituals.supplyChecked` | "Ready" |
| `rituals.planNotes` | "Plan notes" |
| `rituals.rating` | "{n} of 5" |

- [ ] **Step 1: Write failing tests**:
  - Tabs fetch `?tab=`; filters write the URL; empty states.
  - The form: choosing a spell copies traditions and ingredients, and loads suggestions; pressing a suggestion sets the date; save posts the exact body; the 409 dialog with Keep mine; the leave guard; the `?spell=` and `?date=` presets.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/rituals.test.jsx tests/client/ritualForm.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the rituals list and the plan form"
```

---

### Task 4: Ritual page, log form and follow-ups

**Files:**
- Create: `client/src/screens/rituals/RitualPage.jsx`, `client/src/screens/rituals/LogForm.jsx`, `client/src/screens/rituals/FollowUps.jsx`
- Modify: `client/src/App.jsx` (routes `rituals/:id`, `rituals/:id/log`), `client/src/i18n/en.json`, `client/src/theme/global.css`
- Test: `tests/client/ritualPage.test.jsx`

**Interfaces:**
- **RitualPage**:
  - title, spell link (or nothing when `spell` is null), date and time, a status tag;
  - the sky snapshot: a `MoonIcon` with phase and percent, and the weekday and its planet label;
  - traditions;
  - supplies as checkboxes. Each tick PATCHes `{ supplies, version }` through the ritual's `useResource` `save` and is ignored while a save is in flight (a ref guard, as with the Stage 4 switch). A failure shows a toast; a 409 shows the conflict text and reloads;
  - plan notes, and the log section when done or skipped;
  - `FollowUps`, then Edit, Log it (`/rituals/:id/log`), Plan again (`/rituals/new?spell=<id>` plus `copy=<id>`, which copies title, traditions, supplies unchecked and plan notes), and Delete (confirm, undo toast).
- **LogForm** (`useRecordForm` with leave guard and conflict dialog): Done or Skipped (radio), what was different, how it went, and a rating (five star toggle buttons plus "No rating"). It PATCHes `{ status, changes, outcome, rating, version }`.
- **FollowUps**: loads `/api/followups?ritual=<id>` and lists date and text. "Add a follow-up" opens an inline form (date defaults to today from `/api/today`, plus text). Each item has Edit inline and Delete with an undo toast. The forms use `useRecordForm` with versions. A follow-up save never touches the ritual.
- New keys (English):

| Key | Text |
| --- | --- |
| `rituals.status.planned` | "Planned" |
| `rituals.status.done` | "Done" |
| `rituals.status.skipped` | "Skipped" |
| `rituals.sky` | "The sky" |
| `rituals.skyLine` | "{phase}, {n}% lit. {weekday}, the day of {planet}." |
| `rituals.planAgain` | "Plan again" |
| `rituals.log` | "Log" |
| `rituals.logTitle` | "How did it go?" |
| `rituals.done` | "Done" |
| `rituals.skipped` | "Skipped" |
| `rituals.changes` | "What was different" |
| `rituals.outcome` | "How it went" |
| `rituals.ratingField` | "Rating" |
| `rituals.noRating` | "No rating" |
| `rituals.star` | "{n} stars" |
| `rituals.star.one` | "1 star" |
| `rituals.followups` | "Follow-ups" |
| `rituals.addFollowup` | "Add a follow-up" |
| `rituals.followupDate` | "Date" |
| `rituals.followupText` | "Note" |
| `rituals.followupsEmpty` | "No follow-ups yet." |
| `rituals.deleteTitle` | "Move {name} to the Trash?" |
| `rituals.deleteBody` | "Its supplies and follow-ups go with it. You can bring it back from the Trash." |
| `rituals.deleted` | "{name} is in the Trash." |
| `rituals.followupDeleted` | "The follow-up is in the Trash." |
| `rituals.back` | "Back to Rituals" |
| `trash.type.ritual` | "Ritual" |
| `trash.type.followup` | "Follow-up" |
| `planets.<code>` | Not added. Planet labels reuse `timing.planet.<code>`. |

- [ ] **Step 1: Write failing tests**:
  - The page shows the sky line and supplies; a tick PATCHes with the version.
  - Review Focus 5: two quick ticks send two PATCHes in order, each with the newest version, and no tick is lost; a 409 on a tick reloads and shows the message.
  - The log form saves status, texts and rating, and asks before leaving with changes.
  - Follow-ups add, edit and delete with undo, and adding one doesn't reload or PATCH the ritual.
  - Plan again opens the form with copied values.
  - The spell link is absent when `spell` is null.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/ritualPage.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the ritual page, the log form and follow-ups"
```

---

### Task 5: Rituals on the spell page, Today and the calendar

**Files:**
- Modify: `client/src/screens/spells/SpellPage.jsx`, `client/src/screens/today/Today.jsx`, `client/src/screens/calendar/*` (ritual kind mark and link), `client/src/i18n/en.json`, `client/src/theme/global.css`
- Test: `tests/client/spells.test.jsx`, `tests/client/today.test.jsx`, `tests/client/calendar.test.jsx`

**Interfaces:**
- **Spell page**: a Rituals section loading `/api/spells/:id/rituals` with its own LoadState. It lists Planned and Past, with a "Plan a ritual" link to `/rituals/new?spell=<id>`. Delete first loads `/api/spells/:id/usage`; when rituals use the spell, the confirm title reads `spells.deleteInUse`.
- **Today**: a "Rituals this week" list (date, time, title link), and a "Reminders" list (`today.reminderLine` "{title}, {when}", where `when` is `today.inDays`). Each is left out when empty. The note changes to `today.laterJournal`.
- **Calendar**: a `ritual` mark with a candle icon from lucide (`Flame`), in `--leaf` for planned and `--oxblood` for done or skipped. The day panel links to `/rituals/:id` and shows the time.
- New keys (English):

| Key | Text |
| --- | --- |
| `spells.rituals` | "Rituals" |
| `spells.ritualsPlanned` | "Planned" |
| `spells.ritualsPast` | "Past" |
| `spells.planRitual` | "Plan a ritual" |
| `spells.deleteInUse` | "Move {name} to the Trash? {n} rituals use it." |
| `spells.deleteInUse.one` | "Move {name} to the Trash? 1 ritual uses it." |
| `today.week` | "Rituals this week" |
| `today.reminders` | "Reminders" |
| `today.reminderLine` | "{title}, {when}" |
| `today.today` | "today" |
| `today.laterJournal` | "Today's journal page joins this page in a later stage." |
| `calendar.kind.ritual` | "Ritual" |

  Remove `today.later`.

- [ ] **Step 1: Write failing tests**: the spell page's Rituals section and the delete count; Today's week and reminders lists, including left-out empty lists; the calendar ritual mark and its panel link.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/spells.test.jsx tests/client/today.test.jsx tests/client/calendar.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Show rituals on spell pages, Today and the calendar"
```

---

### Task 6: Demo rituals, browser tests and screenshots

**Files:**
- Modify: `server/demo/seed.js`
- Create: `e2e/rituals.spec.js`, `docs/evidence/stage-5/*.png`
- Test: `tests/server/demo.test.js`

**Interfaces:**
- Demo data, added once by title:
  - one planned ritual from the demo spell "A candle for a calm home", on the next suggested day;
  - one done ritual from last week with a rating of 4 and a follow-up.
  The reset clears `ritual_followups`, `ritual_supplies`, `ritual_traditions` and `rituals`, children first. All text is original, plain and warm, with no health claims.

- [ ] **Step 1: Write the browser tests** (port 4213, throwaway folder):
  - Plan a ritual from a spell with timing by pressing a suggestion. Tick two supplies, restart and reload, and check the ticks held. Log it as done with a rating, add a follow-up, restart, and check the log and follow-up are there.
  - The ritual shows on its spell page, on the calendar day and on Today's week list. A reminder shows on Today.
  - Delete the ritual, restore it from the Trash, and check its follow-up came back.
  - Evidence screenshots, only with `EVIDENCE=1` and clipped to the page: the Planned tab, the plan form with suggestions, a logged ritual page with follow-ups, and Today. Each in Book & Folk at desktop and 390 px, with no overflow. Look at each one.
  - `demo.test.js`: the samples appear once.

- [ ] **Step 2: Run them**

Run: `npm run build && npm run test:e2e && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add demo rituals, browser tests and Stage 5 screenshots"
```

---

### Task 7: Spanish pack (controller, not a subagent)

- [ ] **Step 1:** Write Spanish for every new key in `.superpowers/content/es-stage5.json`, and list the keys to remove (`today.later`).
- [ ] **Step 2:** Merge it into a throwaway copy of the owner's pack and run `check-pack es`. Expected: 0 missing, 0 extra, 0 bad.
- [ ] **Step 3:** Install only after her yes to merging.

---

## After the tasks

1. Run the whole-branch review (most capable model), then one fix wave and one scoped re-review.
2. Push the full history to `private`. Open the public PR from one clean commit, then run `/greploop` until 5/5.
3. Ask the owner before merging. Then install the same way as Stage 4: stop, pull, setup, update the pack, start, and check.

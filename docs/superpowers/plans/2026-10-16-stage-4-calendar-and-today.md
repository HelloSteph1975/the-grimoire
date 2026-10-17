# The Grimoire, Stage 4: Calendar and Today Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Today page and the Calendar (month and list views) with moon phases, sabbats, feast days and the owner's own dates, plus a "Show on the calendar" switch on feast entries.

**Architecture:** One server sky module (`server/services/sky.js`, on `astronomy-engine`) owns every moon and season calculation and every "which day in her time zone" question; Stage 5 will reuse it. A calendar service turns entries, sabbats, moon quarters and own dates into dated items for a range, and a today service builds the Today page from the same pieces. Own dates are a new versioned, soft-deleted record type with the Stage 1 saving rules. The client loads and saves only through `useResource` and `useRecordForm`.

**Tech Stack:** As before (Node 24, Express 5, `node:sqlite`, React 19, React Router 7, Vite, Vitest, Testing Library, Supertest, Playwright), plus `astronomy-engine@2.1.19` (MIT).

**Spec:** `docs/superpowers/specs/2026-10-14-the-grimoire-design.md` plus the Stage 4 addendum `docs/superpowers/specs/2026-10-16-stage-4-calendar-and-today.md` (including its "Calls made by the controller"). Where they differ, the addendum wins.

## Global Constraints

- Every Stage 1 to 3 global constraint still applies. The app folder stays on `main`; work happens in this worktree.
- Migrations are append-only. Stage 4 adds migration 5 and never edits 1 to 4.
- All "which day" answers use Settings `time_zone`, never the machine zone. Sky data is computed locally; no network calls.
- Moon phase codes are the spell-timing codes (`server/services/timing.js` `MOON_PHASES`). A day takes the name of a main phase (new, first quarter, full, last quarter) only if that phase falls on it in her time zone. Any other day is named by the moon at local noon: below 90° waxing crescent, below 180° waxing gibbous, below 270° waning gibbous, then waning crescent.
- Sabbats are the eight `SABBAT_KEYS`. Ostara, Litha, Mabon, Yule always take the computed equinox or solstice day. Southern Hemisphere swaps: Yule/Litha, Ostara/Mabon, Imbolc/Lughnasadh, Beltane/Samhain; fixed ones take the opposite entry's `feast_day`, or its default (`imbolc 02-01`, `beltane 05-01`, `lughnasadh 08-01`, `samhain 10-31`).
- Own date limits: title required, up to 120 characters; date `YYYY-MM-DD`, a real day, years 1900 to 2100; notes up to 2,000; traditions up to 20. A yearly February 29 date falls on February 28 in other years.
- Calendar range requests: `from` and `to` are `YYYY-MM-DD`, `to` not before `from`, at most 62 days apart, years 1900 to 2100.
- Weeks start on Monday. Month and weekday names come from `Intl.DateTimeFormat` in the screen language.
- Both screens use the app's theme tokens and fonts (Old Book and Book & Folk), with WCAG AA text contrast. Moon marks are drawn SVG moons, not emoji.
- Every new screen string goes through `t()`; `en.json` holds every key; plain warm text, no em dashes. The Spanish pack stays out of the repo.
- Tests never touch the real data folder or ports 4209/4211. No personal details (user names, home paths) in committed files or screenshots.

## Review Focus

1. **A moon phase near midnight.** The March 2024 equinox (03:06 UTC on 2024-03-20) is March 19 in `America/Chicago`; the full moon of 2024-06-22 01:08 UTC is June 21 there. Expect the day in her zone, not UTC. Pinned in Task 1.
2. **Today when the Days entry was edited or deleted.** Expect the planet and color from the entry with starter key `corr.days.<weekday>` even after edits, and just the weekday when it's gone. Pinned in Task 3.
3. **A yearly own date on February 29.** Expect February 28 in non-leap years, February 29 in leap years. Pinned in Task 3.
4. **Hiding a feast and saving the entry from an older form.** Expect the switch to raise the entry's version, so an older form gets a conflict instead of switching it back. Pinned in Task 2.
5. **Month view at phone width with a crowded day** (Nov 1 and 2 hold several feasts). Expect a readable day with no overflow, and the full list when the day is opened. Pinned in Task 7.

---

## File map

```
server/
  services/sky.js            dayInZone, moonPhaseOnDay, moonNow, moonQuarters, seasonDays
  services/calendar.js       calendarItems(db, range, settings), sabbatDays
  services/today.js          todayPage(db, now, dataDir)
  services/ownDates.js       own date CRUD with traditions, Trash support
  db/migrations.js           + migration 5 (own_dates, own_date_traditions, correspondences.show_on_calendar)
  db/repos.js                + ownDates repo
  routes/calendar.js         GET /api/calendar, GET /api/today
  routes/ownDates.js         /api/own-dates CRUD
  services/correspondences.js, services/traditions.js, services/trash.js, context.js (now())
client/src/
  components/MoonIcon.jsx    drawn moon for a lit fraction and side
  screens/today/Today.jsx
  screens/calendar/Calendar.jsx, MonthGrid.jsx, DayPanel.jsx, CalendarList.jsx
  screens/calendar/OwnDatePage.jsx, OwnDateForm.jsx
  screens/correspondences/EntryPage.jsx, EntryForm.jsx (+ Show on the calendar)
  screens/Trash.jsx (date type), App.jsx (routes), theme/global.css, i18n/en.json
e2e/calendar.spec.js, docs/evidence/stage-4/*.png
```

---

### Task 1: Sky module

**Files:**
- Modify: `package.json` (add `astronomy-engine` `2.1.19`, exact), `server/context.js`
- Create: `server/services/sky.js`
- Test: `tests/server/sky.test.js`

**Interfaces:**
- `dayInZone(date: Date, zone: string) => 'YYYY-MM-DD'` (through `Intl.DateTimeFormat('en-CA', { timeZone })`).
- `moonPhaseOnDay(day: 'YYYY-MM-DD', zone: string) => code`: the quarter code if `moonQuarters(day, day, zone)` has one, otherwise by the phase angle at local noon (below 90 `waxing-crescent`, below 180 `waxing-gibbous`, below 270 `waning-gibbous`, else `waning-crescent`). `moonNow(...).code` is `moonPhaseOnDay(dayInZone(now, zone), zone)`.
- `moonNow(now: Date, zone: string) => { code, angle, lit: number (0..1, two decimals), waxing: boolean, next: [{ quarter: 'new'|'first-quarter'|'full'|'last-quarter', at: ISO string, day: 'YYYY-MM-DD' }] }`. `next` has the next four quarters after `now`, in time order.
- `moonQuarters(fromDay: string, toDay: string, zone: string) => [{ quarter, at, day }]`: every quarter whose `day` in `zone` is within the range, inclusive.
- `seasonDays(year: number, zone: string) => { 'march-equinox', 'june-solstice', 'september-equinox', 'december-solstice' }`, each `'YYYY-MM-DD'` in `zone`.
- `createContext` gains `now: config.now ?? (() => new Date())` on `ctx`, so tests can fix the clock.

- [ ] **Step 1: Write failing tests** (`sky.test.js`), with these known instants:
  - `seasonDays(2024, 'UTC')['march-equinox']` is `'2024-03-20'`; in `'America/Chicago'` it is `'2024-03-19'`.
  - `seasonDays(2024, 'UTC')`: `june-solstice` `'2024-06-20'`, `september-equinox` `'2024-09-22'`, `december-solstice` `'2024-12-21'`.
  - `moonQuarters('2024-06-01', '2024-06-30', 'UTC')` contains `{ quarter: 'full', day: '2024-06-22' }`; with `'America/Chicago'` the full moon is `'2024-06-21'`.
  - `moonQuarters('2024-01-01', '2024-01-31', 'UTC')` contains `new` on `'2024-01-11'` and `full` on `'2024-01-25'`.
  - `moonPhaseOnDay` in `America/Chicago`: 2026-10-16 `waxing-crescent`, 2026-10-18 `first-quarter`, 2026-10-19 `waxing-gibbous`, 2024-06-21 `full`, 2024-06-22 `waning-gibbous`; 2024-06-21 in `UTC` is `waxing-gibbous`.
  - `moonNow(new Date('2024-01-25T17:54:00Z'), 'UTC')`: `code` `full`, `lit` at least 0.99, `next[0].quarter` `last-quarter`; at `2024-01-18T00:00:00Z`, `waxing` true.
  - `dayInZone(new Date('2024-03-20T03:00:00Z'), 'America/Chicago')` is `'2024-03-19'`.
  If astronomy-engine disagrees with a listed day by one, stop and report it (don't change the expected value).

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/sky.test.js`
Expected: FAIL (no `sky.js`).

- [ ] **Step 3: Install and implement**

Run: `npm install astronomy-engine@2.1.19 --save-exact`. Implement with `MoonPhase`, `Illumination(Body.Moon, …)`, `SearchMoonQuarter`/`NextMoonQuarter` and `Seasons`.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the sky module: moon phases, quarters and seasons in the owner's time zone"
```

---

### Task 2: Own dates and the show-on-calendar switch on the server

**Files:**
- Modify: `server/db/migrations.js`, `server/db/repos.js`, `server/services/correspondences.js`, `server/services/traditions.js`, `server/services/trash.js`, `server/routes/index.js`, `server/demo/seed.js` (reset list)
- Create: `server/services/ownDates.js`, `server/routes/ownDates.js`
- Test: `tests/server/ownDates.test.js`, `tests/server/correspondences.test.js`, `tests/server/db.test.js`

**Interfaces:**
- Migration 5:
  - `own_dates (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, date TEXT NOT NULL, yearly INTEGER NOT NULL DEFAULT 0, notes TEXT, TS)`, index on `date`;
  - `own_date_traditions (own_date_id → own_dates ON DELETE CASCADE, tradition_id → traditions ON DELETE CASCADE, PK both)`;
  - `ALTER TABLE correspondences ADD COLUMN show_on_calendar INTEGER NOT NULL DEFAULT 1`.
- `repos(db).ownDates` (columns `title, date, yearly, notes`, ordered `date, title COLLATE NOCASE, id`).
- `/api/own-dates`: `GET /` (live, with `traditions`), `GET /:id`, `POST /`, `PATCH /:id` (with `version`), `DELETE /:id`, `POST /:id/restore`. Body `{ title, date, yearly, notes, traditions: [id] }`. Response the row plus `traditions: [id]` (live only). Schema: `title 'string!' max 120`, `date 'date'` required with a year 1900 to 2100 (code `bad_format` with `hint: 'date'` otherwise), `yearly 'bool'`, `notes max 2000`, `traditions 'ids' max 20`. Traditions must be live; joins to traditions in the Trash are kept (the Stage 2 `setTraditions` rule; reuse it, don't copy it: lift the helper into a small shared module if needed).
- `deleteTradition`/`restoreTradition` also bump live own dates joined to the tradition.
- Trash: `TRASH_TYPES.date = { repo: ownDates, title: row => row.title }`.
- Correspondences: `show_on_calendar` joins `ENTRY_SCHEMA` as `{ type: 'bool' }` and `FIELDS`, is returned by `GET /:id` and the list, and is left out of the Starter-tag change check (changing only it keeps `is_starter`). Starter seeding and updates never set it.

- [ ] **Step 1: Write failing tests**
  - Own dates: create, read, update (version + 1), stale PATCH → 409 with current, delete → Trash type `date` with its title, restore, delete forever. Field codes: title required and `too_long{max:120}`, date `'2024-02-30'` and `'1899-12-31'` → `bad_format`, notes `too_long{max:2000}`, traditions `[9999]` → `not_found`.
  - A tradition sent to the Trash raises the own date's version and hides it from `traditions`; a PATCH with the GET's values keeps the join; restore shows it again.
  - Review Focus 4: `PATCH /api/correspondences/:id { show_on_calendar: false, version }` on a starter entry → `show_on_calendar: 0`, version + 1, `is_starter` still 1; a PATCH from the older version → 409.
  - `db.test.js`: `user_version` 5, the new tables, and the column default 1 on existing rows.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/ownDates.test.js tests/server/correspondences.test.js tests/server/db.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add own dates and the show-on-calendar switch on the server"
```

---

### Task 3: Calendar and Today on the server

**Files:**
- Create: `server/services/calendar.js`, `server/services/today.js`, `server/routes/calendar.js`
- Modify: `server/routes/index.js`
- Test: `tests/server/calendar.test.js`, `tests/server/today.test.js`

**Interfaces:**
- `calendarItems(db, { from, to }, { time_zone, hemisphere }) => item[]`, sorted by `day`, then kind order `moon, sabbat, feast, saint, own`, then id. Item shapes:
  - `{ day, kind: 'moon', quarter, at }`
  - `{ day, kind: 'sabbat' | 'feast' | 'saint', entry: { id, name, starter_key, is_starter, category_id } }`. `saint` is for entries in the categories with starter keys `category.saints` and `category.deities`; `sabbat` for the eight `SABBAT_KEYS`; everything else `feast`.
  - `{ day, kind: 'own', date: { id, title, yearly } }`
  Feasts come from live entries with `show_on_calendar = 1` and a `feast_day` (any year in range), plus the eight sabbats (by starter key, live, shown) on their computed or swapped days. Own dates: one-time ones on their date; yearly ones on each year's month and day in range (Feb 29 → Feb 28 in non-leap years).
- `GET /api/calendar?from=&to=` → `{ items }` (validation per Global Constraints; `400 invalid` with `detailCodes.from`/`to` `bad_format`, or `range` `too_long{max:62}`).
- `todayPage(db, now, settings) => { day, weekday: 'mon'..'sun', moon: moonNow(...), planets: [entry], colors: [entry], coming: [{ ...item, days_away }] }`. Planets and colors are the live linked entries of the entry with starter key `corr.days.<weekday>` (live, edited or not) that sit in the categories with starter keys `category.planets` and `category.colors`; empty when that entry is gone. `coming`: the next three non-moon items from tomorrow, searching up to 366 days ahead.
- `GET /api/today` → `todayPage(ctx.db, ctx.now(), getSettings(ctx.db))`.

- [ ] **Step 1: Write failing tests** (with `makeTestContext` and a fixed `now`; insert sabbat rows by SQL with their starter keys and categories where fixture content lacks them):
  - An entry with `feast_day '10-28'` appears on `2026-10-28` as `feast`; in a saints category as `saint`; with `show_on_calendar 0` it doesn't appear.
  - Yule shows on the December solstice day in the zone; Samhain on `10-31` (north) and on Beltane's `05-01` (south); Southern Yule on the June solstice day.
  - Moon items for June 2024 in `America/Chicago` include `full` on `2024-06-21`.
  - Review Focus 3: a yearly own date `2024-02-29` appears on `2025-02-28` and `2028-02-29`; a one-time date appears only in its year.
  - Range errors: `to` before `from`, 63 days, `'2024-13-01'`.
  - Today, Review Focus 2: with `now` a Friday, `planets` and `colors` come from the Friday entry's links (make the entries and links through the API, setting `starter_key` by SQL); after renaming the Friday entry they still come; after it's in the Trash, both are empty and `weekday` is `fri`.
  - `coming` wraps into next year at the end of December, skips hidden feasts, and lists two items on one day as two.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/server/calendar.test.js tests/server/today.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add calendar items and the Today page on the server"
```

---

### Task 4: Moon icon and the Today screen

**Files:**
- Create: `client/src/components/MoonIcon.jsx`, `client/src/screens/today/Today.jsx`
- Modify: `client/src/App.jsx` (route `/`), `client/src/theme/global.css`, `client/src/i18n/en.json`
- Test: `tests/client/moonIcon.test.jsx`, `tests/client/today.test.jsx`

**Interfaces:**
- `<MoonIcon lit={0..1} waxing={bool} size={number} title={string?} />`: an SVG disc where the lit part matches `lit` and sits on the right when waxing, left when waning (Northern view); `aria-hidden` unless `title` is given.
- `Today.jsx` loads `/api/today` through `useResource` and shows: heading with the long date in the screen language; the moon (MoonIcon, `t('timing.moon.<code>')`, `t('today.lit', { n })` percent, the next quarters with short dates); "The day" line: `t('today.dayPlanets', { weekday, planets })` and `t('today.dayColors', { colors, n })` (`.one` for a single color), each sentence left out when its list is empty, with names through `starterText`, each a link to its entry (just the weekday when both are empty); "Coming up" list with names (feast entry link or own date link) and `t('today.inDays', { n })` with a `.one` form ("tomorrow"); a quiet note `today.later`. Loading and Try again through `LoadState`.
- Look: a book page per the addendum's "Look": double gold rule under the heading, serif headings, dotted rules between "Coming up" rows, ornaments from the existing `Ornaments.jsx` in Book & Folk.
- New keys: `today.title` "Today", `today.lit` "{n}% lit", `today.next` "Next phases", `today.day` "The day", `today.dayLine` "{weekday} belongs to {planets}. Its color is {colors}.", `today.dayOnly` "{weekday}", `today.coming` "Coming up", `today.inDays` "in {n} days" / `.one` "tomorrow", `today.nothingComing` "Nothing on the calendar in the next year.", `today.later` "Planned rituals and today's journal page join this page in later stages."

- [ ] **Step 1: Write failing tests**: MoonIcon renders a lit path for 0.28 waxing on the right and for 0.28 waning on the left, a full disc at 1, none at 0. Today renders the phase name, "28% lit", the day line with two planet links, "Coming up" with "tomorrow" and "in 12 days", the plain weekday when planets and colors are empty, Spanish names from a pack, and Try again on a failed load.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/moonIcon.test.jsx tests/client/today.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the Today page"
```

---

### Task 5: Calendar month, list and day panel

**Files:**
- Create: `client/src/screens/calendar/Calendar.jsx`, `MonthGrid.jsx`, `CalendarList.jsx`, `DayPanel.jsx`
- Modify: `client/src/App.jsx` (route `calendar`), `client/src/theme/global.css`, `client/src/i18n/en.json`
- Test: `tests/client/calendar.test.jsx`

**Interfaces:**
- URL state: `/calendar?month=YYYY-MM&view=month|list&day=YYYY-MM-DD`. No `month` means the month of the server's today (from `/api/today`'s `day`). A `month` outside 1900-01 to 2100-12, or malformed, means today's month; the previous arrow is disabled at 1900-01 and the next at 2100-12. Prev and next month links, a Today button, Month and List toggles (`aria-pressed`), and an "Add a date" link to `/calendar/dates/new` (with `?date=` when a day is open).
- Data: one `useResource('/api/calendar?from=<first Monday shown>&to=<last Sunday shown>')` for the grid (at most 42 days).
- `MonthGrid`: 7 columns starting Monday, weekday headers from `Intl.DateTimeFormat(language, { weekday: 'short' })`, each day a button (`aria-label` with the full date and item count) showing the day number, a small MoonIcon for a quarter, and item marks with short names (sorted by shown name). Days outside the month dimmed. Today outlined. Selecting a day sets `day` in the URL.
- `DayPanel`: the open day's full list: moon quarter with its time in the owner's zone (format `at` with `timeZone` from settings), feasts linking to `/correspondences/:id`, own dates linking to `/calendar/dates/:id`.
- `CalendarList`: the month's items in date order with weekday and date.
- Mark colors use tokens: saint `--oxblood`, sabbat/feast `--accent-ink`, own `--leaf`.
- New keys: `calendar.title` "Calendar", `calendar.month` "Month", `calendar.list` "List", `calendar.today` "Today", `calendar.prev` "Previous month", `calendar.next` "Next month", `calendar.addDate` "Add a date", `calendar.empty` "Nothing on this day.", `calendar.monthEmpty` "Nothing this month.", `calendar.dayLabel` "{date}, {n} items" / `.one` "{date}, 1 item", `calendar.at` "at {time}", `calendar.kind.sabbat` "Sabbat", `calendar.kind.feast` "Feast", `calendar.kind.saint` "Saint or deity", `calendar.kind.own` "Your date".

- [ ] **Step 1: Write failing tests**: October 2026 renders 35 day cells starting Monday Sep 28; Oct 31 shows Samhain; a full moon cell shows a moon; clicking Oct 28 opens the panel with San Judas Tadeo linking to its entry; the list view orders items by date; the next arrow sets `month=2026-11`; Spanish weekday headers and translated names; Try again on a failed load.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/calendar.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add the calendar month, list and day views"
```

---

### Task 6: Own date page and form, and the show-on-calendar switch

**Files:**
- Create: `client/src/screens/calendar/OwnDatePage.jsx`, `client/src/screens/calendar/OwnDateForm.jsx`
- Modify: `client/src/App.jsx` (routes `calendar/dates/new`, `calendar/dates/:id`, `calendar/dates/:id/edit`), `client/src/screens/correspondences/EntryPage.jsx`, `client/src/screens/correspondences/EntryForm.jsx`, `client/src/screens/Trash.jsx` (nothing if `trash.type.date` is enough), `client/src/i18n/en.json`
- Test: `tests/client/ownDate.test.jsx`, `tests/client/entryForm.test.jsx`

**Interfaces:**
- `OwnDateForm` follows `EntryForm.jsx`'s pattern (loader waiting for data, settings and pack; `target`; leave guard; conflict dialog; `takeTheirs` re-picks). Fields: Title, Date (`<input type="date">`, prefilled from `?date=`), Repeats every year (checkbox), Traditions (checkboxes in sort order, starter names translated), Notes. Saves to `/api/own-dates`, then opens the date's page.
- `OwnDatePage`: title, the date in the screen language, "Every year" when yearly, traditions, notes split into paragraphs, Edit and Delete (confirm, undo toast), back link to the calendar month of the date.
- Entry page: for entries with a feast day or a sabbat starter key, a "Show on the calendar" switch (`role="switch"`, `aria-checked`) that PATCHes `{ show_on_calendar, version }` through the entry's `useResource` `save`, shows a toast on failure and reloads on 409 with the conflict message. Entry form: the same field as a checkbox, shown under the same condition.
- New keys: `dates.new` "New date", `dates.edit` "Edit date", `dates.title` "Title", `dates.date` "Date", `dates.yearly` "Repeats every year", `dates.everyYear` "Every year", `dates.traditions` "Traditions", `dates.notes` "Notes", `dates.back` "Back to the calendar", `dates.deleteTitle` "Move {name} to the Trash?", `dates.deleteBody` "You can bring it back from the Trash.", `dates.deleted` "{name} is in the Trash.", `corr.showOnCalendar` "Show on the calendar", `trash.type.date` "Date".

- [ ] **Step 1: Write failing tests**: new date posts the exact body (with `?date=` prefill) and opens its page; a 409 opens the conflict dialog and Keep mine sends the conflict's version; the leave guard asks; the page shows "Every year" and Spanish traditions; delete then undo; the entry switch PATCHes `show_on_calendar: false` with the version and updates `aria-checked`; a 409 on the switch shows the message and reloads; the switch is absent on an entry with no feast day; the entry form sends `show_on_calendar`.

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run tests/client/ownDate.test.jsx tests/client/entryForm.test.jsx`
Expected: FAIL.

- [ ] **Step 3: Implement** the Interfaces above.

- [ ] **Step 4: Run the tests and see them pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Add own dates on screen and the show-on-calendar switch"
```

---

### Task 7: Demo dates, browser tests and screenshots

**Files:**
- Modify: `server/demo/seed.js`
- Create: `e2e/calendar.spec.js`, `docs/evidence/stage-4/*.png`
- Test: `tests/server/demo.test.js`

**Interfaces:**
- Demo: one yearly sample date ("Light a candle for the ancestors", Nov 2, yearly) and one one-time date in the next month, added once by title; `--reset` clears `own_date_traditions` and `own_dates`.

- [ ] **Step 1: Write the browser tests** (port 4213, throwaway folder):
  - add a yearly own date from a calendar day, edit its title, restart, reload, see it on the month and on Today's "Coming up" when it's within the next items;
  - hide a feast from its entry page; it leaves the month and Today; show it again; restart; the choice holds;
  - delete the own date, restore it from the Trash;
  - Review Focus 5: the November month view at 390 px has no horizontal overflow, and opening Nov 2 lists every item;
  - evidence screenshots (only with `EVIDENCE=1`, clipped to the page so no folder paths show): Today and the month at desktop and 390 px in Book & Folk, the month in Old Book, the day panel, and the own-date form at 390 px. Look at each and fix anything cramped or overlapping.
  - `demo.test.js`: the two sample dates appear once after seeding twice.

- [ ] **Step 2: Run them**

Run: `npm run build && npm run test:e2e && npm test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Add demo dates, browser tests and Stage 4 screenshots"
```

---

### Task 8: Spanish pack (controller, not a subagent)

- [ ] **Step 1:** Write Spanish for every new `en.json` key (with `.one` forms) in `.superpowers/content/es-stage4.json` as `{ ui: {...}, content: {} }`.
- [ ] **Step 2:** Merge it with the owner's current pack into a throwaway data folder and run `GRIMOIRE_DATA_DIR=<tmp> npm run check-pack -- es`. Expected: 0 missing, 0 extra, 0 bad.
- [ ] **Step 3:** Install into the owner's pack only after her yes to merging.

---

## After the tasks

1. Whole-branch review (most capable model), one fix wave, one scoped re-review.
2. Push the full history to the `private` remote; open the public PR from a single clean commit; run `/greploop` to 5/5.
3. Ask the owner before merging. After her yes: merge, `npm run stop`, `git pull` on `main`, `npm run setup`, install the Spanish keys, start the task, check `/api/health`, a `pre-migrate-…` backup, and Today and the Calendar in Spanish.

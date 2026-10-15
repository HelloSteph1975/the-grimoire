# The Grimoire: design

Date: 2026-10-14
Status: approved in chat, waiting for review of this written spec

## What it is

A personal Book of Shadows that runs on the owner's own computer. It holds:

- a **Book of Spells** for the owner's own spells and rituals,
- a **Correspondences** library (crystals, colors, days, planets, elements, moon phases, deities and spirits, saints, sabbats and feasts),
- a **Calendar** with the Wheel of the Year, Mexican folk feast days and the owner's own dates,
- **Rituals**: plan one (with suggested timing), then log what happened and how it turned out,
- a **Journal** for dreams, tarot pulls and signs,
- a **Today** page that pulls these together.

The code is public on GitHub; the app has one user, on one laptop. There are no accounts, no sign-in and no network calls.

It is separate from The Apothecary and shares no data with it. The Apothecary's grimoire covers magical healthcare and skincare; this app makes no health or medical claims.

Every kind of record (spells, correspondences, categories, traditions, calendar dates, rituals, journal entries, tags) can be added, edited, saved and deleted. Deleting moves the record to the Trash (see Saving and loading).

## Foundation

Built on the same foundation as The Apothecary (`~\dev\the-apothecary`), copied and adapted, not shared as a library:

- Node 24+, Express 5, the built-in `node:sqlite` database, React 19 with React Router, built with Vite. Tests with Vitest, Supertest, Testing Library and Playwright.
- Same layout: `server/` (config, db, routes, services, demo), `client/src/` (screens, components, lib, theme, i18n), `scripts/` (setup, stop, icon), `windows/` (start, stop, launch `.vbs` files and install/uninstall scripts).
- Routes and screens stay thin. Shared mechanics (saving with version checks, Trash, backups, sky calculations, timing suggestions, language packs) live in `server/services/` and `client/src/lib/`.
- Moon, sun and planet positions come from `astronomy-engine` (MIT license), computed locally.

### Where things live

| What | Where |
| --- | --- |
| Code | `~\dev\the-grimoire`, public GitHub repo `HelloSteph1975/the-grimoire` |
| Data | `Documents\The Grimoire Data` (`grimoire.db`, `backups\`, `locales\`), overridable by `dataDir` in `config.json` or `GRIMOIRE_DATA_DIR` |
| App port | 4209 (`GRIMOIRE_PORT` overrides) |
| Demo port | 4211, with its own sample data folder |
| Browser test port | 4213, throwaway data folder |

### Daily rhythm (Windows)

- Scheduled task `The Grimoire - Start Morning`: daily 5:30 AM, runs `windows\start-server.vbs`, StartWhenAvailable, ExecutionTimeLimit PT72H, allowed to start and keep running on battery.
- Scheduled task `The Grimoire - Stop 9 PM`: daily 9 PM, runs `windows\stop-server.vbs`, which runs `node scripts/stop.js`. That asks the server to back up and shut down through `POST /api/shutdown`. No PowerShell stop script.
- Desktop shortcut `The Grimoire Dashboard.lnk` runs `windows\Launch The Grimoire.vbs` through wscript, with an `.ico` kept in `windows\`.
- `npm run install-windows` and `npm run uninstall-windows` create and remove these and never touch the data folder.

## Saving and loading

The Apothecary needed several fixes after it shipped: a stale reload could replace newer data on screen and then get saved back, edits were lost when moving away from a form, and failed loads showed nothing. This app builds the guards in from the start, in one shared place, so every screen gets them.

### On the server

- One SQLite file, WAL mode, `foreign_keys` on, `busy_timeout` 5000. Every write runs inside one transaction (`BEGIN IMMEDIATE`), so a save is all or nothing.
- Every editable table has a `version` integer, starting at 1. An update must send the version it was read at. If it doesn't match, the server changes nothing and answers `409 Conflict` with the current record. A successful update adds 1 to the version and returns the saved record.
- Every write returns the saved record as stored, and the screen shows that, not what it sent.
- Input is checked on the server against one schema per record type. Bad input gets `400` with a message per field; nothing is written.
- Deleting sets `deleted_at` (soft delete). Lists hide deleted rows. The Trash screen lists them, restores them, or permanently deletes them when the owner empties the Trash or deletes one item there (with confirmation). Nothing is purged automatically.
- Deleting a record others point to (a spell used by planned rituals, a category with entries, a tradition in use) first says what it affects. Restoring brings the links back.

### Backups

- A backup is a full copy made with `VACUUM INTO` into `backups\grimoire-YYYY-MM-DD-HHMM.db`.
- Taken on server start if none exists for today, on shutdown, and before every restore or Trash empty.
- The newest 30 are kept; older ones go to the Recycle Bin (not hard-deleted).
- Settings lists backups and restores one with a confirmation. The restore makes a backup of the current data first.

### On the screen

- One shared data hook (`useRecord` / `useList`) does all loading. Each request carries a sequence number; a reply is applied only if no newer request for the same data has started. A save's reply always wins over reads that started before it.
- Every load shows a loading state, and on failure a message with a **Try again** button. Never a blank page.
- Forms track unsaved changes. Leaving a form with unsaved changes (link, back button, closing the tab) asks first.
- The Save button is disabled while saving. "Saved" shows only after the server confirms. A failed save keeps the form filled in and shows the error.
- A `409` shows: "This was changed somewhere else. Reload to see the latest, or keep your version and save over it." Keeping overwrites with the new version number on purpose.

### Proof

Every stage has these tests before it merges:

- Server: create, read, update, delete, restore and version-conflict tests for each record type.
- Browser (Playwright, on port 4213): for each record type, add one, edit it, restart the server, reload the page and check the edit is still there. Also: unsaved-changes prompt, a failed load showing Try again, and a stale reply not replacing a newer save.

## Language

- The code, the README and the public repo are English.
- All screen text goes through a small translation function. English strings live in `client/src/i18n/en.json`.
- Other languages are **language packs** kept in the data folder (`locales\<code>\ui.json` and `locales\<code>\content.json`), not in the repo. The server lists the packs it finds; Settings shows a language switch when there is more than one.
- `content.json` gives translated names and text for starter entries, matched by each entry's `starter_key`. Entries the owner writes stay in the language they were written in.
- The owner's copy gets a Spanish pack (`es`), written in the same batches as the starter content.
- The README tells other people they can ask Claude Code or Codex to make a language pack for any language, and explains the two files.

## Look and feel

Two themes, picked in Settings:

- **Old Book** (default, and what the public repo shows): parchment pages, dark brown ink, gold-edged double-line borders, serif fonts (Cormorant Garamond for headings, EB Garamond for text), deep oxblood and gold accents, leather-brown frame around the page.
- **Book & Folk** (the owner's copy): the same book, plus papel picado bands along page tops, marigold orange and candle-flame accents, and marigold and candle line ornaments in the corners.

Ornaments are original SVGs drawn for this app. Nothing is copied from other books, sites or artists. Both themes must pass WCAG AA contrast for text.

Side bar: Today, Book of Spells, Correspondences, Calendar, Rituals, Journal, then Trash and Settings at the bottom. A search box at the top searches spells, correspondences, rituals and journal entries.

## Screens and records

### Traditions

A tradition is a label: name, short description, color. Starter traditions: **Eclectic**, **Wiccan**, **Mexican folk**. The owner can add more. Spells, correspondences and calendar dates can carry any number of traditions, and lists can be filtered by them.

### Correspondences

- **Categories**: name, icon, sort order. Starter categories: Crystals, Colors, Days of the week, Planets, Elements, Moon phases, Deities and spirits, Saints, Sabbats and feasts. The owner can add more (for example Herbs, Tarot cards, Runes).
- **Entry**: name, category, traditions, short summary (one line), full text, keywords (for example "protection", "love"), and links to related entries (Monday ↔ Moon ↔ Silver). Links show both ways.
- Lookup: browse by category, filter by tradition, or search a keyword to see every entry that matches across categories.
- Starter entries have a `starter_key` and a **Starter** tag. Editing a starter entry removes the tag. Deleting one moves it to the Trash like anything else.
- Deities and saints: who they are, tradition, feast day where there is one, and common associations, in short, respectful entries. No invented history, and no claim that any practice belongs to everyone in a tradition.

### Book of Spells

- **Spell**: title, purpose (short), traditions, kind (spell, ritual, blessing, cleansing, other, or one the owner adds), ingredients and tools (a list, each item optionally linked to a correspondence entry), steps (an ordered list), timing preferences (moon phases, days of the week, planet, sabbat or feast; all optional), notes, and source (free text: "my own", or the book or person it came from).
- Steps and ingredient lists can be reordered by dragging and by up/down buttons.
- A spell page shows its rituals: planned ones and past results.

### Calendar

- Month and list views.
- **Sabbats**: the eight Wheel of the Year days. Yule, Ostara, Litha and Mabon use the real solstice and equinox times from `astronomy-engine`. Imbolc, Beltane, Lughnasadh and Samhain use their common fixed dates (Feb 1, May 1, Aug 1, Oct 31). Northern Hemisphere by default; a setting flips the wheel for the Southern Hemisphere.
- **Mexican folk dates**: a starter set of fixed-date feasts (for example Día de la Candelaria, Día de la Santa Cruz, Día de San Juan, Día de Muertos, Día de la Virgen de Guadalupe, Las Posadas). Each links to its correspondence entry.
- **Owner dates**: title, date, repeats yearly or not, traditions, notes.
- Moon phases (new, first quarter, full, last quarter) shown on the days they fall, in the owner's time zone.
- Starter dates can be edited, hidden or deleted like any other entry.

### Today

- Moon phase and illumination, with the date of the next new and full moon.
- The day of the week with its planet and color (from the Days of the week entries, so the owner's edits show here).
- The next sabbat or feast and how many days away it is.
- Rituals planned for the next 7 days, with reminders that are due.
- A link to add a journal entry for today.

### Rituals

Two tabs.

**Plan**

- Pick a spell from the Book of Spells (or none, for a one-off ritual) and give it a title.
- **Suggested timing**: the next 10 dates in the coming 90 days that match the spell's timing preferences (moon phase, day of the week, sabbat or feast), best match first, with which preferences each date meets. The owner picks one or types any date and time.
- **Supplies**: a checklist copied from the spell's ingredients and tools, which the owner can edit for this ritual only.
- **Reminder**: none, or a number of days before. Due reminders show on Today.

**Log**

- After the date, a planned ritual moves to "To log". The owner records: done or skipped, what was done differently, how it went (free text), and a rating (1 to 5, optional).
- The sky at the ritual time is saved with it (moon phase, illumination, day of the week, its planet) when it is planned and updated if the date changes.
- **Follow-ups**: dated notes added later ("two weeks on: ..."), so results can be checked over time.
- The log can be filtered by spell, tradition, rating and date.

### Journal

- **Entry**: date and time, kind (dream, tarot, sign, other, or one the owner adds), title, text, tags, and the sky at that time (saved automatically).
- Tarot entries also have a cards list: card name, position (free text, for example "past"), and upright or reversed.
- Search by text, filter by kind, tag and date.

### Settings

- Language (when a pack exists), theme, hemisphere, time zone.
- Traditions, categories, spell kinds and journal kinds: add, rename, reorder, delete.
- Backups: list, back up now, restore.
- Data folder location (shown, not edited here).

### Trash

- Every deleted record, newest first, with its type and the date it was deleted.
- Restore, delete forever (with confirmation), or empty the Trash (with confirmation and a backup first).

## Starter content

- All starter text is original, written for this app. Nothing is copied or closely paraphrased from books or websites.
- Written in batches of 10 to 20 entries, in this order: days of the week, colors, elements, planets, moon phases, sabbats, crystals, Mexican folk feasts, saints, deities and spirits. The owner checks a sample from each batch before it goes in.
- Stored in `server/content/*.json` and loaded into the database on first start and by later migrations. Loading never overwrites an entry the owner has edited or deleted (matched by `starter_key`).
- The Spanish pack for starter content is written alongside each batch and kept in the owner's data folder, not the repo.

## Build stages

Each stage is its own branch and PR with tests, screenshots and evidence, and is merged and installed before the next starts.

1. **Foundation**: server, database, version checks, Trash, backups, shared data hook and form guards, themes, language packs, Settings, Windows tasks and shortcut, empty side bar screens.
2. **Correspondences**: categories, traditions, entries, links, lookup, starter content in batches.
3. **Book of Spells**.
4. **Calendar and Today**: sabbats, feasts, moon phases, owner dates, the Today page.
5. **Rituals**: Plan with suggested timing, Log with follow-ups.
6. **Journal**, plus the full search.

## Out of scope

- Accounts, sharing, sync, or a public website.
- Photos and file attachments (could come later).
- Herbal health, skincare and remedies (The Apothecary).
- Tarot card meanings as starter content (the owner can add a Tarot category).
- Notifications outside the app.

# The Grimoire, Stage 6: Journal and search (design addendum)

Date: 2026-10-17
Status: the owner asked to build the Journal and the search from the main design, with add, edit, save and delete everywhere. The calls below are the controller's. She can change any of them.

This adds detail to the main design (`2026-10-14-the-grimoire-design.md`), sections "Journal", "Look and feel" (the search box), "Today" (the journal link) and "Settings" (journal kinds). Where they disagree, this file wins for Stage 6.

## Why

The book holds spells, correspondences, the sky and rituals. The Journal is where the everyday magic goes: a dream on waking, a three-card pull, a sign noticed on a walk. Each entry keeps the sky at that moment, so she can look back and see patterns. The search ties the whole book together: one box finds a word anywhere she wrote it.

## Goals

1. **Journal entries**: add, edit, save and delete, each with a date and time, a kind, a title, text, tags and the sky at that moment.
2. **Tarot cards** on an entry: card, position and upright or reversed.
3. **Journal list** with a text search and filters for kind, tag and dates.
4. **Journal kinds** in Settings: add, rename, reorder, delete, like spell kinds.
5. **Today** gets a "Write in the journal" link and shows today's entries.
6. **Full search**: a box at the top of the side bar searches spells, correspondences, rituals, journal entries and her own calendar dates.

## Non-goals

- Photos or file attachments (out of scope in the main design).
- A tarot card library with meanings. Card names are free text with suggestions.
- Journal entries on the calendar grid.
- Ranking search results by relevance. Each group is sorted the way its own list is.

## Anti-goals

- Losing journal text. Every record follows the Stage 1 saving rules: `version`, 409 on a stale save, leave guard, conflict dialog.
- A search that misses something she can see in its own list. The global search reuses each list's matching rules, so the same word finds the same records.

## Records

All editable tables follow the Stage 1 rules: `version`, soft delete, Trash, 409 on a stale save.

- **Journal kind**: name (required, up to 60, like spell kinds), sort order, starter key. Starter kinds: Dream, Tarot, Sign, Other (`server/content/journal-kinds.json`, loaded like spell kinds, never overwriting her edits or bringing back ones she deleted forever).
- **Journal entry**:
  - date (`YYYY-MM-DD`, years 1900 to 2100, required) and time (`HH:MM`, optional), in her Settings time zone;
  - kind (optional link; a kind in the Trash shows as no kind, as with spell kinds);
  - title (up to 200, optional);
  - text (up to 20,000);
  - tags: up to 20, each up to 50 characters, trimmed, duplicates dropped ignoring case and accents, kept in the order typed;
  - cards: up to 20 lines, each a card name (required, up to 100), a position (up to 100) and reversed yes or no;
  - sky: the same saved snapshot as rituals (phase code, percent lit, weekday, weekday planet).
  An entry needs at least a title, some text or one card; otherwise the save fails with `empty` on `title`.
  Tags and cards are saved with the entry in one transaction, under its version, like ritual supplies.

**Controller's call on tags**: tags live on the entry (chips, like correspondence keywords), not as a separate list to manage. The tag filter offers every tag in use on live entries. Renaming a tag means editing the entries that carry it.

## The sky snapshot

Worked out by the server with `skyAt(date, time, zone)` when an entry is created and again only when its date or time changes, exactly as for rituals. No time means noon.

## Screens

- **Journal** (side bar): newest first (date, then time, then id, descending). A search box, a kind filter, a tag filter, and From and To dates, all kept in the URL. Search matches title, text, tags and card names and positions, ignoring case and accents. Each row shows the date (and time), the kind, a small moon for the saved phase, and the title, or the first 80 characters of the text when there's no title. An empty journal shows a short note and a "Write an entry" button; a search with no matches says so.
- **Entry form** (`/journal/new`, `/journal/:id/edit`):
  - date and time (a new entry starts at the current date and time in her zone; `?date=` presets the date and leaves the time empty);
  - kind (a select of live kinds, in their order, plus "No kind"; a new entry starts on the first kind);
  - title; text (a tall text area);
  - tags (the chips input);
  - cards (the list editor: card name with suggestions of the 78 standard card names, position, a Reversed checkbox; "Add a card"). The section is always there; it takes one line when empty.
  - It uses `useRecordForm`, the leave guard and the conflict dialog.
- **Entry page** (`/journal/:id`): title (or the date when there's no title), date and time, kind, the sky line (the ritual page's line and moon icon), tags as links to the filtered list, cards ("Reversed" marked), and the text with its paragraphs. Edit and Delete (confirm, undo toast).
- **Settings**: a "Journal kinds" section after "Spell kinds", the same add, rename, reorder and delete. Deleting asks with the count of entries using it.
- **Today**: the "later stage" note is replaced by a "Journal" section: a "Write in the journal" link to `/journal/new`, and today's entries (time and title) when there are any.
- **Search**:
  - A search box at the top of the side bar, under the name, on every page and on the phone menu. Enter opens `/search?q=…`.
  - The search page has the same box and shows groups in this order: Spells, Correspondences, Rituals, Journal, Dates. Each group shows its count and up to 20 results, and the groups with no results are left out. When a group has more, a "See all" link opens that section's own list with the search filled in (Spells, Correspondences and Journal; Rituals and Dates show up to 50 and have no "See all").
  - Each result shows its name and one line: a spell's purpose, an entry's category and summary, a ritual's date and status, a journal entry's date and kind, a date's day.
  - Fewer than 2 characters: the page asks for a longer word and makes no request.
  - Matching rules per group:
    - Spells and correspondences: exactly their list's search (correspondences include the translated starter text in another language).
    - Rituals: title, plan notes, what was different, how it went, supply names and follow-up text.
    - Journal: as the Journal list.
    - Dates: title and notes of her own dates.

## Deleting

- **An entry** goes to the Trash with its tags and cards and comes back with them. Trash type "Journal entry", titled by its title, or the first 60 characters of the text, or its date.
- **A journal kind** in the Trash shows as no kind on its entries, whose versions go up when it goes or comes back (the Stage 3 kind rule). Deleted forever, its entries keep no kind. Trash type "Journal kind".

## Language

Every new screen string goes through `t()`. The 78 card names are one key (`journal.cardNames`, names separated by `|`) so a pack can translate them. Spanish for every new key goes into the owner's pack, and starter kind names go into her content pack; `npm run check-pack -- es` reports nothing missing.

## Testing

As in earlier stages:
- **Server**: every route and rule above, including the `empty` rule, tag clean-up, cards saved with the entry in one transaction, the sky set on create and changed only by date or time, list order and filters, kinds in the Trash, and the global search returning each group with counts and caps, matching accents and the translated starter text.
- **Client**: the list's filters in the URL, the form and its guards and conflict dialog, the entry page, the journal kinds section, Today's journal section, the side bar search box and the search page.
- **Browser**: write a tarot entry with two cards and tags, restart, reload and check it; find it from the side bar search; filter by its tag; delete it and restore it from the Trash. Screenshots of the Journal list, the entry form, an entry page, the search page and Today, at desktop and phone width in Book & Folk.

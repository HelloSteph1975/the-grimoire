# The Grimoire, Stage 3: Book of Spells (design addendum)

Date: 2026-10-16
Status: approved in chat, waiting for review of this written addendum

This adds detail to the main design (`2026-10-14-the-grimoire-design.md`), section "Book of Spells". Where the two disagree, this file wins for Stage 3.

## Scope

1. The Book of Spells: spells, their ingredients and tools, steps and timing.
2. Spell kinds, managed in Settings.
3. A "Used in spells" list on correspondence entry pages.
4. Three fixes left over from Stage 2: sorting by the displayed name, translated Trash titles, and the Settings tradition row on a phone.
5. Spanish for every new screen text, in the owner's pack.

There are no starter spells. The book starts empty.

## Records

All tables follow the Stage 1 rules: `INTEGER PRIMARY KEY AUTOINCREMENT`, `version`, ISO-8601 UTC timestamps, soft delete, version-checked updates, and Trash support.

- **Spell kind**: name, sort order, `starter_key`, `is_starter`, `content_version`. Starter kinds: spell, ritual, blessing, cleansing, other. They load like starter traditions and get names in `content.json`.
- **Spell**: title (required, up to 200 characters), purpose (one line, up to 200), kind (optional), traditions (any number), ingredients and tools, steps, timing, notes (up to 4,000), source (up to 200, free text such as "my own" or a book or person).
- **Ingredient or tool line**: name (required, up to 200), amount (optional, up to 50, free text such as "3" or "a pinch"), and an optional link to one correspondence entry. A spell has up to 50 lines.
- **Step**: one text item (required, up to 1,000). A spell has up to 50 steps.
- **Timing** (all optional, any number of each):
  - moon phases: the eight phases, stored as fixed codes (`new`, `waxing-crescent`, `first-quarter`, `waxing-gibbous`, `full`, `waning-gibbous`, `last-quarter`, `waning-crescent`);
  - days of the week: fixed codes `mon` to `sun`;
  - planets: the seven classical planets, fixed codes (`sun`, `moon`, `mercury`, `venus`, `mars`, `jupiter`, `saturn`);
  - sabbats and feasts: links to correspondence entries. The picker offers entries that have a feast day, plus the eight sabbat starter entries (four of them move with the solstices and equinoxes and have no fixed day). The owner's own saints count once they have a feast day.

  Fixed codes keep timing usable for date suggestions in Stage 5, whatever the owner renames. Their labels come from the screen text, so they show in Spanish.

Ingredient lines, steps and timing are saved with the spell in one request and one transaction. They have no versions of their own; the spell's version covers them.

## Deleting

- **A spell** goes to the Trash with everything it holds, and comes back the same way. Deleting it forever removes its lines, steps and timing.
- **A correspondence entry linked from a spell** (as an ingredient or a feast) can still go to the Trash. The ingredient keeps its name and the link is hidden until the entry comes back; a hidden feast is left out of the spell page. Sending the entry to the Trash or bringing it back raises the version of each spell that links it, as with linked entries in Stage 2. Deleting the entry forever removes the link; the ingredient line stays, unlinked.
- **A spell kind in use**: the confirm says how many spells use it. The kind goes to the Trash. Spells keep it but show no kind while it's in the Trash, and their versions go up when it goes or comes back. Deleting it forever leaves those spells with no kind.
- **A tradition in the Trash** is hidden on spells, as it is on entries, and sending it to the Trash or bringing it back raises the version of each spell that uses it.
- **Hidden links are kept on save.** A form never sees a kind, tradition or feast that is in the Trash, so saving the spell keeps those hidden links as they are. An ingredient keeps its hidden link unless the owner relinks or removes that line.
- **Starter kinds deleted forever** are recorded in `starter_removed`, so they never come back.

## Screens

- **Book of Spells** (side bar): a list with a kind filter, a tradition filter and a search box. Search matches title, purpose, ingredient names, steps, notes and source. Each row shows the title, the kind and the purpose. Sorted by title. An empty book shows a short note and an "Add a spell" button.
- **Spell page**: title, kind, traditions, purpose, ingredients and tools (amount, then name; a linked name opens its correspondence entry), numbered steps, timing, notes, source, and Edit and Delete buttons. Stage 5 adds its rituals here.
- **Spell form**: every field. Ingredient lines and steps each have an "Add" button, a remove button, and reorder by dragging and by up and down buttons; the buttons work from the keyboard. The ingredient link uses the Stage 2 search-as-you-type picker. Moon phases, days and planets are toggle buttons; sabbats and feasts use the picker limited to the entries above. The form uses `useRecordForm`, the leave guard and the conflict dialog.
- **Correspondence entry page**: a "Used in spells" list, linking to each spell that uses the entry as an ingredient or a feast.
- **Settings**: a Spell kinds list next to Traditions and Categories: add, rename, reorder, delete.

## Fixes from Stage 2

- **Sorting by the displayed name.** Lists sorted by name (correspondence entries, linked entries, picker results, spells, and "Used in spells") sort by the name on screen, using the current language's collation (`Intl.Collator`). In Spanish, starter rows sort by their Spanish names. Lists with a sort order (traditions, categories, kinds) keep it.
- **Trash titles.** Starter rows in the Trash show their translated name.
- **Settings rows on a phone.** The tradition, category and kind rows wrap so the name, color and buttons fit at phone width without overlapping.

## Language

- Every new key in `en.json` gets Spanish in the owner's pack (`<dataDir>\locales\es\ui.json`, working copy in `.superpowers/content/es-ui.json`), and `content.json` gets the five starter kind names. `npm run check-pack -- es` must report nothing missing.
- Moon phases, days and planets used as timing have their own screen keys, so they don't depend on the correspondence entries' names.

## Testing

As in Stages 1 and 2:
- server tests for every route and rule above: create, read, update, delete, restore and conflict for spells and kinds; lines, steps and timing saved and replaced in one transaction; links hidden and shown with the Trash; spell versions raised when a linked entry changes Trash state; kind delete counts; search; limits and error codes;
- client tests for the list, page and form, including reorder by buttons and keyboard, and sorting in Spanish;
- Playwright tests that add a spell with lines, steps and timing, reorder, edit, delete and restore, restart the server, reload and check the result; plus phone-width screenshots of the spell screens and the Settings rows in both themes.

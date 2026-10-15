# The Grimoire, Stage 2: Correspondences (design addendum)

Date: 2026-10-15
Status: approved in chat, waiting for review of this written addendum

This adds detail to the main design (`2026-10-14-the-grimoire-design.md`), sections "Correspondences", "Traditions", "Starter content" and "Language". Where the two disagree, this file wins for Stage 2.

## Scope

1. The Correspondences section: categories, entries, links, browse, filter and search.
2. Reordering traditions and categories (left over from Stage 1).
3. About 100 starter entries in English, written in batches.
4. A Spanish language pack for the owner's copy: all screen text plus every starter entry.
5. Error messages translated through the same packs.
6. Folk-saint entries added only to the owner's own data.

## Records

All tables follow the Stage 1 rules: `INTEGER PRIMARY KEY AUTOINCREMENT`, `version`, ISO-8601 UTC timestamps, soft delete, version-checked updates, and Trash support.

- **Category**: name, icon (a Lucide icon name from a short fixed list), sort order, `starter_key`, `is_starter`.
- **Entry**: category, name, summary (one line, up to 200 characters), full text (up to 4,000 characters), keywords (a list of short words), feast day (`MM-DD`, optional, used by saints, deities and feast days, and read by the Stage 4 calendar), traditions (any number), `starter_key`, `is_starter`.
- **Link**: two entries, stored once (lower id first), shown on both entries. An entry can't link to itself, and a pair can't be linked twice.

## Deleting

- **An entry:** goes to the Trash. Its links stay stored but are hidden while it's in the Trash, and come back when it's restored. Deleting it forever removes its links.
- **A category with entries:** the confirm says how many entries it holds. The category and its entries go to the Trash together, with the same deleted time. Restoring the category brings back the entries that went with it. Deleting the category forever also deletes forever every entry of it in the Trash: the ones that went with it, and the ones put in the Trash earlier on their own. The Trash shows both counts on the category, its delete-forever confirm names them, and an entry whose category is in the Trash is marked as such (it can't be restored until the category is).
- **Saving after a Trash change:** sending an entry or tradition to the Trash, or bringing it back, changes what linked entries show, so their version goes up. A form opened before that gets a conflict instead of dropping the hidden or restored link.
- **A tradition in use:** the confirm says how many entries use it. The tradition goes to the Trash. Entries keep the link but don't show it while the tradition is in the Trash.
- **Starter rows deleted forever** are recorded in `starter_removed`, as in Stage 1, so they never come back.

## Reordering

Traditions and categories get up and down buttons. One request saves the new order of the whole list in one transaction, and each moved row's version goes up. If the list changed in another window, the reorder gets a conflict and the screen reloads the list.

## Screens

- **Correspondences:** tabs for the categories, in their order, plus "All". There's a tradition filter and a search box. Search matches name, summary, full text and keywords across all categories. In another language it also matches the translated starter text. Results show the category, the name and the summary line.
- **Entry page:** name, category, a Starter tag if it's still a starter, summary, full text, feast day, traditions, keywords, linked entries (clickable), and Edit and Delete buttons.
- **Entry form:** every field. Links are added from a search-as-you-type picker and removed with an ×. The form uses `useRecordForm`, the leave guard and the conflict dialog.
- **Categories:** managed in Settings next to Traditions: add, rename, change icon, reorder, delete.

## Starter content

- **Ten batches, in this order:** days (7), colors (12), elements (5), planets (7 classical), moon phases (8), sabbats (8), Mexican feast days (8), crystals (20), saints (12, Catholic saints and the Virgin of Guadalupe), and deities and spirits (16, mixing Wiccan, classical and Mexica figures). Sabbats and Mexican feast days share the "Sabbats and feasts" category; the other batches each have their own category.
- **How each batch is written:** the controller writes it in this session, in original words. Three samples go to the owner in chat. A batch goes into the repo only after she says OK or her changes are made.
- **Links** between starter entries (day and planet, planet and color, and so on) live in `server/content/links.json` as pairs of starter keys.
- **Rules:** no copied or closely paraphrased text, no invented history, no health claims, and no claim that any practice belongs to everyone in a tradition. Mexica deities are described as figures of Mexica religion and their place in later practice, not as a single living tradition.
- **Updates to starter entries:** when an entry is loaded, an existing starter row is left alone (Stage 1 rule). Starter text corrected in a later stage only reaches rows the owner hasn't edited. This is done with a `content_version` per starter row, compared with the file's version.

## Language

- **Spanish pack for the owner's copy:** `<dataDir>\locales\es\ui.json` translates every key in `en.json`. `content.json` translates every starter entry's name, summary, full text and keywords, and every starter category and tradition name. It is not committed to the repo.
- **Error messages:** the server sends a stable `code` with each error (for example `required`, `too_long`, `bad_format`, `not_found`, `conflict`, `restored`, `in_use`, `unreachable`), and a code for each field error. The client shows `t('error.<code>')` and falls back to the English message.

## Owner-only entries

After Stage 2 is merged and installed, the controller adds folk-saint entries (Santa Muerte, Jesús Malverde and others the owner approves) to the owner's data through the running app's API, as her own entries, not starter rows. They are written to the same rules and shown to her first, and they never enter the repo.

## Testing

As in Stage 1:
- server tests for every route and rule above, including delete and restore of a category with entries, links hidden and shown, reorder conflicts and the error codes;
- client tests for the screens;
- Playwright tests that add, edit, link, delete, restore and reorder, restart the server, and check the result;
- a content test that checks every starter file (required fields, lengths, unique keys, links that point at real keys) and a script, `npm run check-pack -- es`, that lists any key a language pack in the data folder is missing.

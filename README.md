# The Grimoire

A personal Book of Shadows that runs on your own computer. It will hold your spells and rituals, a correspondences library, a calendar with the Wheel of the Year and Mexican folk feast days, ritual planning and results, and a journal for dreams, tarot pulls and signs.

Everything is kept in one file on your computer. There are no accounts, and nothing is sent over the internet.

> Stages 1 and 2 of 6 are done: saving, backups, the Trash, settings, traditions, both looks, and the Correspondences library. The other sections arrive in later stages.

## Correspondences

A library of about 100 starter entries, all written for this app: days of the week, colors, elements, the seven classical planets, moon phases, the sabbats, Mexican feast days, crystals, saints, and deities and spirits. Entries link to each other, so Monday leads to the Moon and the Moon to silver. You can browse by category, filter by tradition, or search a word like "protection" across everything.

You can edit or delete any entry, add your own, and make new categories for herbs, tarot cards, runes or whatever you keep. Starter entries carry a small "Starter" tag until you change them.

## Install

You need [Node.js](https://nodejs.org) 24 or newer.

    npm run setup
    npm start

Then open http://localhost:4209. On Windows, `npm run install-windows` adds a Desktop shortcut. It also starts the app each morning at 5:30, then backs it up and stops it at 9 PM.

The easiest way is to open this folder in Claude Code or Codex and say "install The Grimoire". `AGENTS.md` tells them exactly what to do.

## Your data

Everything lives in `Documents\The Grimoire Data`. The app makes a backup once a day when it starts, whenever it is stopped normally (the 9 PM task, `npm run stop`, or the Stop script), before it restores a backup or empties the Trash, and before an update changes the database. It keeps the newest 30. You restore from Settings.

## More languages

The app comes in English. To add another, ask Claude Code or Codex: "Add a Spanish language pack to The Grimoire" (or any language). They write the translation files into your data folder, following `AGENTS.md`, and you pick the language in Settings.

## Two looks

**Old Book** (parchment and gold) is the default. **Book & Folk** adds papel picado, marigolds and candlelight. Switch in Settings.

## License

MIT. See `LICENSE` and `NOTICE.md`.

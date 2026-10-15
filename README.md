# The Grimoire

A personal Book of Shadows that runs on your own computer. It will hold your spells and rituals, a correspondences library, a calendar with the Wheel of the Year and Mexican folk feast days, ritual planning and results, and a journal for dreams, tarot pulls and signs.

Everything is kept in one file on your computer. There are no accounts, and nothing is sent over the internet.

> Stage 1 of 6 is done: saving, backups, the Trash, settings, traditions, and both looks. The other sections arrive in later stages.

## Install

You need [Node.js](https://nodejs.org) 24 or newer.

    npm run setup
    npm start

Then open http://localhost:4209. On Windows, `npm run install-windows` adds a Desktop shortcut. It also starts the app each morning at 5:30, then backs it up and stops it at 9 PM.

The easiest way is to open this folder in Claude Code or Codex and say "install The Grimoire". `AGENTS.md` tells them exactly what to do.

## Your data

Everything lives in `Documents\The Grimoire Data`. The app makes a backup once a day when it starts, whenever it is stopped normally (the 9 PM task, `npm run stop`, or the Stop script), and before it restores a backup or empties the Trash. It keeps the newest 30. You restore from Settings.

## More languages

The app comes in English. To add another, ask Claude Code or Codex: "Add a Spanish language pack to The Grimoire" (or any language). They write the translation files into your data folder, following `AGENTS.md`, and you pick the language in Settings.

## Two looks

**Old Book** (parchment and gold) is the default. **Book & Folk** adds papel picado, marigolds and candlelight. Switch in Settings.

## License

MIT. See `LICENSE` and `NOTICE.md`.

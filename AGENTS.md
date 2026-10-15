# Instructions for coding assistants

The Grimoire is a personal Book of Shadows. It runs on the user's own computer. You are probably here because a non-technical person asked you to install, update, uninstall or fix it, or to add a language. Follow this file exactly. It matches the code in this repository.

## Golden rules

1. Never delete, move, overwrite or reset the data folder. By default it is `Documents\The Grimoire Data` in the user's home folder, or the `dataDir` folder named in `config.json`. It holds the database (`grimoire.db`), backups (`backups\`), language packs (`locales\`) and `epoch.txt`, which changes on every restore so pages opened before it reload instead of saving over the restored data.
2. Never run `npm run demo -- --reset` unless the user asks for it. It is meant for the separate demo folder only.
3. Don't change code unless the user asks you to.
4. Explain each step in plain language, in short messages. Ask before anything that changes the system: scheduled tasks, Desktop shortcuts, antivirus exceptions.
5. Don't edit or delete `config.json` without telling the user. Setup creates it, and Git ignores it.
6. Never disable antivirus or Windows security features.

## Install on Windows

1. Check Node: run `node --version`. It must be 24 or newer. If Node is missing or older, tell the user to install the Node.js 24 LTS from https://nodejs.org, then open a new terminal and ask you again. Stop there.
2. Run `npm run setup`. This installs dependencies, builds the app, writes `config.json` if it is missing, and creates the data folder. It may take a few minutes.
3. Ask the user: "Next I'll add two scheduled tasks (start at 5:30 AM, back up and stop at 9 PM) and a Desktop shortcut. OK?" Only after a yes, run `npm run install-windows`. It creates:
   - the task `The Grimoire - Start Morning` (daily 5:30 AM, runs on battery),
   - the task `The Grimoire - Stop 9 PM` (daily 9 PM, runs on battery),
   - the Desktop shortcut `The Grimoire Dashboard`.
4. Start the app now. Either run the scheduled task (`Start-ScheduledTask -TaskName 'The Grimoire - Start Morning'` in PowerShell) or run `npm start` in a separate terminal and leave it running.
5. Verify: `GET http://127.0.0.1:4209/api/health` should return JSON with `"ok": true`. Use the port from `config.json` if the user changed it. Also check that `The Grimoire Dashboard.lnk` exists on the Desktop.
6. Open the app: ask the user to double-click the Desktop shortcut, or open http://localhost:4209. It opens in a Chrome app window, or in the default browser if Chrome isn't installed.
7. Tell the user where their data lives and that the app is reachable only from their own computer.

## Install on macOS or Linux

Run `npm run setup`, then `npm start`, and open http://localhost:4209. There are no scheduled tasks or shortcuts on these systems. The app still makes a backup when it starts if there isn't one from today yet.

## Update

1. Run `npm run stop`. It asks the running app to back up and stop, and says so if it wasn't running.
2. Get the new files. With Git, run `git pull`. With a ZIP, copy the new files over the folder. Either way keep `config.json` and leave the data folder alone.
3. Run `npm run setup`.
4. Start the app again (the scheduled task, `npm start`, or the Desktop shortcut). The database upgrades itself on start. If the Windows tasks and shortcut already exist, they keep working. Run `npm run install-windows` again only if the app folder has moved.

## Uninstall

1. Confirm with the user first, and say that their data will be kept.
2. On Windows, run `npm run uninstall-windows`. It stops the app and removes both scheduled tasks and the Desktop shortcut. On macOS or Linux, run `npm run stop` instead. Neither command touches the data folder.
3. Before removing the app folder, find the active data path: `GRIMOIRE_DATA_DIR` overrides `dataDir` in `config.json`, which overrides the default `Documents\The Grimoire Data`. Resolve the full path. If it is the app folder or inside it, do not remove the app folder. Tell the user why and keep everything.
4. Otherwise the app folder can be removed if the user wants. Leave the data folder in place unless the user explicitly asks to delete it. If they do, remind them that it holds everything they have written, plus their backups, and confirm once more.

## Add a language

The app's screens are English. To add another language, make a folder `locales\<code>` inside the data folder (for example `locales\es` for Spanish). The folder name must be a language code: two or three lowercase letters, optionally followed by a dash and a two-letter uppercase region (`es`, `pt-BR`). A folder named like `Spanish` or `es-mx` is skipped. Put two files in it:

- `ui.json` holds every key from `client/src/i18n/en.json`, translated, plus a non-empty `"_name"` with the language's own name (like `"Español"`). A pack without `"_name"` is skipped.
- `content.json` translates starter entries by key, like `"tradition.wiccan.name"` and `"tradition.wiccan.description"`. Keys are `<starter_key>.<field>`. The starter keys are in `server/content/*.json`.

To see what is still untranslated, run `npm run check-pack -- <code>` (for example `npm run check-pack -- es`); it lists missing and unused keys.

Reload the page, then pick the language in Settings. Packs live in the data folder, so updates never overwrite them.

## Troubleshooting

- **Port 4209 is busy.** The server prints `Port 4209 is busy; The Grimoire is probably already running.` and exits. Most often another copy is already running, which is fine. To restart it, run `npm run stop`, wait a moment, then start it again. If a different program uses the port, set another `port` in `config.json` (for example 4215), then restart. The launcher and stop script read the port from `config.json`. The environment variable `GRIMOIRE_PORT` overrides the file.
- **`config.json` errors.** The app names the file and stops. The usual cause is a Windows path with single backslashes. In JSON they must be doubled: `"dataDir": "D:\\Grimoire Data"`. Fix only that line. Never point `dataDir` at a new empty folder to "fix" things, because the app would look empty. The old data is still in the old folder.
- **A message says The Grimoire couldn't start.** The Desktop launcher waits about 15 seconds for the server. Open `server.log` in the app folder and read the last lines. Likely causes are an unreachable data folder, a bad `config.json`, or Node missing from the PATH.
- **Antivirus warns about the `.vbs` files.** `windows\start-server.vbs` and `windows\stop-server.vbs` run Node with no visible window, which some antivirus programs flag. `windows\Launch The Grimoire.vbs` starts the server through `start-server.vbs` and then opens the app window. The stop script uses Node, not PowerShell. Read the files with the user so they can see what they do. Add a narrow exception for the app folder only if the user agrees. Never turn antivirus off.
- **Backups and restore.** Backups are in the `backups\` folder inside the data folder. The app makes one at start if there isn't one from today yet, one whenever it is stopped normally (the 9 PM task, `npm run stop`, or `windows\stop-server.vbs`; closing it with Ctrl+C makes no backup), and one before any restore or emptying of the Trash. It keeps the newest 30. Older ones go to the Recycle Bin, or to `backups\_old` if that isn't possible. Settings has Back up now and Restore. Use Restore in Settings, not manual file copying.
- **Chrome isn't installed.** The shortcut opens the app in the default browser instead. It works the same.
- **The app doesn't respond but the tasks exist.** Check `Get-ScheduledTaskInfo -TaskName 'The Grimoire - Start Morning'`, then try `npm start` in a terminal to see the error directly.

## Commands

```
npm run setup              # npm install, build, write config.json, create data folder
npm run install-windows    # scheduled tasks and Desktop shortcut (Windows only)
npm run uninstall-windows  # remove them; keeps data
npm start                  # run the app (port 4209)
npm run stop               # back up and stop the running app
npm run demo               # demo on port 4211 with its own sample data folder (Documents\The Grimoire Demo Data)
npm run dev                # API with auto-restart plus the Vite dev server
npm run build              # build the client
npm test                   # unit and API tests (Vitest)
npm run test:e2e           # browser tests (Playwright), throwaway data folder, port 4213
```

## For contributors

- Work on a branch, not `main`. Run `npm test` before committing, and `npm run test:e2e` for UI changes.
- Tests use throwaway folders. Never point them at the real data folder, and don't use port 4209 for experiments.
- `GRIMOIRE_CONTENT_DIR` (tests only) makes the server seed starter content from another folder, which must hold `traditions.json` and `categories.json`. The tests point it at `tests/fixtures/base-content`.
- Keep text plain and warm, with no em dashes.

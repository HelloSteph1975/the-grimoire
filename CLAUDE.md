# The Grimoire

Read `AGENTS.md` first. It has install, update, uninstall and language-pack steps, and the golden rules about the data folder.

- Design: `docs/superpowers/specs/2026-10-14-the-grimoire-design.md`
- Plans, one per stage: `docs/superpowers/plans/`
- Saving rules: every editable table has `version`. Updates send it, and stale saves get a 409. On the client, load and save only through `useResource` and `useRecordForm`. Don't fetch directly from screens.
- Keep the owner's personal details out of this public repo.

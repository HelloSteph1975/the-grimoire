# The Grimoire, Stage 5: Rituals (design addendum)

Date: 2026-10-17
Status: the owner asked to build Rituals from the main design as written, with add, edit, save and delete everywhere. The calls below are the controller's. She can change any of them.

This adds detail to the main design (`2026-10-14-the-grimoire-design.md`), section "Rituals", and to "Today" and "Book of Spells" where rituals show. Where they disagree, this file wins for Stage 5.

## Why

The book holds spells (Stage 3) and the sky (Stage 4). Rituals join them: plan when to work a spell on a day that suits it, gather the supplies, then record what happened and look back on it weeks later.

## Goals

1. **Plan** a ritual from a spell, or with no spell, at a date and an optional time, with date suggestions from the spell's timing.
2. **Supplies** checklist copied from the spell and editable for this ritual only.
3. **Reminders** some days before, shown on Today.
4. **Log**: done or skipped, what was different, how it went, a rating, and the sky at the time.
5. **Follow-ups**: dated notes added later.
6. Rituals show on the calendar, on Today (next 7 days and due reminders), and on their spell's page.

## Non-goals

- Notifications outside the app.
- Repeating rituals. Each ritual is one occasion; "Plan again" copies one into a new plan.
- Planetary hours or moon signs in suggestions.

## Anti-goals

- Losing a log entry or a follow-up. Every record follows the Stage 1 saving rules.
- A suggestion that contradicts the calendar. Suggestions use the same sky module and calendar rules as Stage 4.

## Records

All editable tables follow the Stage 1 rules: `version`, soft delete, Trash, 409 on a stale save.

- **Ritual**:
  - title (required, up to 200)
  - spell (optional link)
  - traditions (copied from the spell when planned, editable)
  - date (`YYYY-MM-DD`, years 1900 to 2100) and time (`HH:MM`, optional), both in the owner's Settings time zone
  - reminder (none, or 0 to 30 days before)
  - plan notes (up to 4,000)
  - supplies: up to 50 lines, each a name (up to 200), an amount (up to 50), and checked yes or no
  - status: `planned`, `done` or `skipped`
  - log fields: what was different (up to 4,000), how it went (up to 4,000), rating (1 to 5, optional)
  - sky: a saved snapshot of the moon phase code, percent lit, weekday and the weekday's planet code
  Supplies are saved with the ritual in one transaction, under the ritual's version, like spell lines.
- **Follow-up**: ritual, date (`YYYY-MM-DD`), text (required, up to 2,000). Its own versioned record, so adding a follow-up never conflicts with editing the ritual. Soft delete and Trash ("Follow-up"). Follow-ups of a ritual in the Trash are hidden with it and come back with it.

## The sky snapshot

Computed by the server with the Stage 4 sky module whenever a ritual is created or its date or time changes. The moment is the ritual's date and time in her zone, or noon if there's no time. It holds the phase code (`moonPhaseOnDay` for the date), the percent lit at that moment, the weekday code, and the weekday's planet code. The planet comes from a fixed map (Sunday sun, Monday moon, Tuesday mars, Wednesday mercury, Thursday jupiter, Friday venus, Saturday saturn), the same rule the suggestions use. It's stored, not recomputed, so the log keeps what was planned even if a calculation changes later.

## Suggested timing

`GET /api/spells/:id/suggestions?from=YYYY-MM-DD` (default: tomorrow in her zone) returns up to 10 days in the next 90 that match the spell's timing, best first.

- **Preference groups**: moon phases, days, planets and feasts. A day meets a group if:
  - its phase code (`moonPhaseOnDay`) is in the moon list;
  - its weekday is in the days list;
  - its weekday's planet (the fixed map) is in the planets list;
  - one of the spell's feasts falls on it (the same feast and sabbat day rules as the calendar, hidden feasts included, since she picked them on purpose).
- **Ranking**: the number of groups met (only groups the spell has), most first, then the earliest date. Days meeting no group are left out. A spell with no timing gets no suggestions, and the form says so.
- **Each suggestion** gives the date and which preferences it met, by code: `{ day, met: { moon: ['full'], days: ['fri'], planets: ['venus'], feasts: [entry id] } }`.

## Screens

- **Rituals** (side bar) has three tabs:
  - **Planned**: upcoming planned rituals, soonest first.
  - **To log**: planned rituals whose date has passed in her zone, oldest first, each with a "Log it" button.
  - **Log**: done and skipped rituals, newest first, with filters for spell, tradition, rating (at least) and a date range.
- **Plan form**:
  - title; spell (picker; choosing one fills the title if empty, copies its traditions and ingredients into supplies, and loads suggestions);
  - suggestions as buttons that set the date;
  - date and optional time;
  - reminder; traditions; supplies (the Stage 3 list editor, with a checkbox per line); plan notes.
  - It uses `useRecordForm`, the leave guard and the conflict dialog.
- **Ritual page**:
  - title, spell link, date and time, status, the sky snapshot, traditions, supplies (checkboxes tick and save straight away with the version, like the Stage 4 calendar switch), plan notes;
  - the log (when done or skipped);
  - follow-ups (add, edit, delete inline);
  - Edit, "Log it", "Plan again", Delete.
- **Log form**: done or skipped, what was different, how it went, rating (1 to 5 stars, clearable). Saves to the same ritual with its version.
- **Spell page**: a Rituals section, planned (soonest first) and past (newest first), each linking to its ritual.
- **Today**: "Rituals this week" (planned rituals in the next 7 days, including today) and "Reminders" (planned rituals whose reminder day has come and whose date hasn't passed). They replace the "later stages" note, except the journal part, which stays for Stage 6.
- **Calendar**: planned, done and skipped rituals show as a new kind `ritual` (a candle mark in the leaf or oxblood ink), linking to the ritual page.

## Deleting

- **A ritual** goes to the Trash with its supplies and follow-ups and comes back with them.
- **A spell with rituals**: the confirm says how many rituals use it. The rituals keep the link but hide it while the spell is in the Trash, and their versions go up when it goes or comes back (the Stage 3 hidden-link rule). Deleting the spell forever leaves the rituals with no spell.
- **A tradition** in the Trash is hidden on rituals, as elsewhere.

## Language

Every new screen string goes through `t()`. Spanish for every new key goes into the owner's pack, and `npm run check-pack -- es` reports nothing missing.

## Testing

As in earlier stages:
- **Server**: tests for every route and rule above. That covers suggestions against known moon days, weekdays, planets and a sabbat; ranking; the sky snapshot and its update when the date changes; supplies saved with the ritual; follow-ups; and the Trash rules, including a spell in the Trash.
- **Client**: tests for the tabs, the forms and their guards, the supply checkboxes, and Today's new sections.
- **Browser**: plan a ritual from a spell using a suggestion, tick supplies, restart, reload, log it, add a follow-up, restart again and check everything is there; delete and restore. Screenshots of the Planned tab, the plan form, a logged ritual page and Today at desktop and phone width in Book & Folk.

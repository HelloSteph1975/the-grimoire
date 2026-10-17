# The Grimoire, Stage 4: Calendar and Today (design addendum)

Date: 2026-10-16
Status: talked through in chat, waiting for review of this written addendum

This adds detail to the main design (`2026-10-14-the-grimoire-design.md`), sections "Calendar" and "Today". Where they disagree, this file wins for Stage 4.

## Why

The owner wants to open the book in the morning and see where she stands in the sky and the year: tonight's moon, what today belongs to, and what feast is coming. The calendar holds the year's turning points from her own book, plus dates she adds herself. Stage 5 (Rituals) builds its date suggestions on the sky calculations made here.

## Goals

1. **Today page**: the moon, the day, and what's coming up.
2. **Calendar**: a month view and a list view of moon phases, sabbats, feast days and the owner's own dates.
3. **Own dates**: add, edit, save, delete to the Trash and restore, with the same saving rules as everything else.
4. **Hiding a feast** from the calendar without deleting its entry.

## Non-goals

- Planned rituals and reminders on Today (Stage 5) and the journal link (Stage 6). Today leaves room for them but shows only a quiet note that they come later.
- Notifications outside the app, sync with other calendars, importing or exporting calendar files.
- Monthly or weekly repeating dates. Own dates repeat yearly or happen once.
- Moon signs, eclipses, planetary hours, retrogrades.

## Anti-goals

- Anything that looks like a generic web calendar. Both screens must look like pages of the same aged book (see "Look").
- Wrong sky data. A moon phase on the wrong day in her time zone would make the book untrustworthy.
- A calendar that can lose an edit. Own dates follow every saving rule from Stage 1.

## What the owner decided

- **Which feasts show**: every live correspondence entry with a feast day, in any category: sabbats, Mexican feasts, saints (her own included) and deities. Entries she gives a feast day later appear too. That is 32 today.
- **Hiding**: each entry with a feast day (and the four solstice and equinox sabbats) gets a "Show on the calendar" switch, on by default. Off takes it off the calendar and Today; the entry stays in the book.
- **Own dates**: title, date, repeats yearly or once, traditions, notes. Add, edit, save, delete and restore like any record.
- **Look**: like an aged book, in her Book & Folk theme. The approved sketch (kept outside the repo) shows Today as a left page and the month as a right page on parchment, with a gold double border, papel picado along the top and marigold and candle ornaments in the corners. On a narrow screen the pages stack.

## Sky calculations

- Computed locally with `astronomy-engine` (MIT), a new dependency. No network calls.
- **Moon phase days**: the four main phases (new, first quarter, full, last quarter) are placed on the day they fall in the owner's time zone (Settings, `time_zone`). The exact time shows when a day is opened.
- **Today's moon**: the phase name (one of the eight phases, using the same codes as spell timing), the percent lit, and the dates of the next first quarter, full moon, new moon and last quarter.
- **Sabbats with moving dates**: Ostara, Litha, Mabon and Yule fall on the day of the equinox or solstice in her time zone. The other four use their feast day field (Feb 1, May 1, Aug 1, Oct 31).
- **Southern Hemisphere**: when the Settings hemisphere is "south", the eight sabbats move to the opposite point of the wheel. Samhain goes to around May 1, Beltane to around Oct 31, Yule to the June solstice, and so on. The other feasts don't move. The hemisphere setting already exists in Settings.
- **Owner's time zone**: all "which day" questions use Settings `time_zone`, not the computer's clock zone, so dates stay right after a move.

## Today

- **Moon**: a drawn moon showing the real lit fraction, the phase name, the percent lit, and the next phase dates.
- **The day**: the weekday's planet and color, read from the owner's Days of the week entries through their links (the entry with starter key `corr.days.<weekday>`, its live linked Planets and Colors entries, by shown name). If she has deleted that entry or its links, that line shows only the weekday.
- **Coming up**: the next three calendar items (feasts and her own dates, not moon phases) from tomorrow on, each with how many days away. Hidden feasts are left out.
- Each name links to its entry or own date.

## Calendar

- **Month view**: weeks start on Monday (the controller's call; easy to change later). Today is outlined. Each day shows moon phase marks, feasts and own dates with a small mark for each kind: sabbat or feast, saint or deity, own date. Arrows move between months; a "Today" button returns.
- **List view**: the same items for the shown month, in date order, with the day of the week.
- **A day**: clicking a day opens a short list of what's on it. A feast opens its Correspondences entry. An own date opens its page, with Edit and Delete.
- **Add a date** button opens the own-date form, with the clicked day prefilled when it came from a day.
- **Names** of starter entries show in the screen language. Sorting within a day uses the shown name.
- **Range**: any month from 1900 to 2100.

## Own dates

- **Record**: title (required, up to 120 characters), date (`YYYY-MM-DD`), repeats yearly (yes or no), traditions (any number, live only as in Stage 2), notes (up to 2,000). Same table rules as every editable table: `version`, soft delete, Trash, 409 on a stale save.
- **Yearly dates on February 29** fall on February 28 in other years.
- **Form** uses `useRecordForm`, the leave guard and the conflict dialog.
- **Trash**: listed as "Date", restorable, deletable forever.

## Hiding a feast

- A new `show_on_calendar` column on correspondences (default on). It's part of the entry's version and save rules.
- The switch is on the entry page (a quick toggle that saves with the entry's version and handles a conflict like any save) and in the entry form.
- Turning it off doesn't drop the Starter tag. It's a display choice, not an edit of the starter text.

## Look

Both screens use the app's own theme tokens and fonts, so Old Book and Book & Folk both work. The page reads like a book page: parchment background, double gold rule, serif headings, ink colors for the marks (oxblood for saints and deities, accent ink for sabbats and feasts, leaf green for own dates), and moon marks as small drawn moons, not emoji. WCAG AA contrast in both themes. At phone width the month grid stays readable: shorter labels or dots with the full list when a day is opened.

## Language

Every new screen string goes through `t()`; month and weekday names come from `Intl.DateTimeFormat` in the screen language. Spanish for every new key goes into the owner's pack, and `npm run check-pack -- es` reports nothing missing.

## Testing

- Server: sky calculations checked against known dates (for example a full moon, a new moon, a solstice and an equinox in a known year, in two time zones, including a phase that falls on different days in UTC and in `America/Chicago`); calendar items for a month (feasts, hidden feasts, moving sabbats, Southern Hemisphere, Feb 29 dates); own dates CRUD, conflict, Trash.
- Client: Today with a fixed date, the month grid and list, the day panel, the own-date form and its guards, the hide switch, Spanish names and sorting.
- Browser: add an own date, edit it, restart, reload, find it on the calendar; hide a feast and see it gone from the calendar and Today; screenshots of Today and the month at desktop and phone width in both themes.

## Calls made by the controller (the owner can override)

These came up in the builder check. None changes what the owner sees in the Northern Hemisphere.

1. **Which entries are sabbats**: the eight starter keys `corr.sabbats-feasts.{samhain,yule,imbolc,ostara,beltane,litha,lughnasadh,mabon}` (already `SABBAT_KEYS` in `server/services/timing.js`), whether or not she has edited them. An entry she makes herself named "Samhain" is an ordinary feast and doesn't move.
2. **The four moving sabbats** (Ostara, Litha, Mabon, Yule) always take the computed equinox or solstice day. Their `feast_day` is ignored, even if she sets one.
3. **Southern Hemisphere**: each sabbat takes the date its opposite on the wheel has in the north. Yule and Litha swap solstices, Ostara and Mabon swap equinoxes (Southern Ostara is the September equinox), Imbolc and Lughnasadh swap, and Beltane and Samhain swap. For the four fixed ones that means the opposite entry's `feast_day`, or its default (Feb 1, May 1, Aug 1, Oct 31) if that entry is gone or has none.
4. **The "Show on the calendar" switch** appears for entries that have a feast day and for the eight sabbats. Clearing a feast day keeps the stored switch value. Starter content updates never change it.
5. **Translated names**: as in Stages 2 and 3, the server sends `starter_key` and `is_starter`, and the screen applies the language pack (`starterText`). Sorting within a day uses the shown name.
6. **Eight moon phases**: the phase is named for the whole day in her time zone, with the spell-timing codes. If a new moon, first quarter, full moon or last quarter falls on that day, the day takes that name, so each main phase covers one day only. Any other day is named by where the moon is at noon that day: below 90° is `waxing-crescent`, below 180° `waxing-gibbous`, below 270° `waning-gibbous`, and the rest `waning-crescent`. The lit percent and the drawn moon still show the moon at the moment the page loads. One sky module owns this (`moonPhaseOnDay`), and Stage 5 reuses it.
7. **Coming up**: looks up to 366 days ahead from tomorrow and wraps into next year. One-time dates in the past drop out. Two items on one day count as two. Fewer than three are shown if fewer exist.
8. **Today's date**: the server works out "today" from its clock in the Settings time zone. One sky and calendar API serves both Today and the calendar. The tests pass in a fixed "now".
9. **Traditions on own dates** are stored and shown on the date's page. The calendar has no tradition filter in this stage.
10. **Own dates**: page at `/calendar/dates/:id`, form at `/calendar/dates/new` and `/calendar/dates/:id/edit`. They're in the Trash as "Date" and in backups like all data. Search across the book comes in Stage 6.

## Left to the builder

- How the month grid compresses at phone width.
- The exact drawn moon (SVG), as long as the lit part matches the real fraction and waxing or waning side.
- Whether the sky calculations run on the server or the client, as long as one module owns them and Stage 5 can reuse it.

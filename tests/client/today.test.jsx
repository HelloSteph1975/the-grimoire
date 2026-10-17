import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { Today } from '../../client/src/screens/today/Today.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const planet = (id, name, key = null) => ({ id, name, starter_key: key, is_starter: key ? 1 : 0 });
const base = {
  day: '2026-10-16', weekday: 'fri',
  moon: {
    code: 'waxing-crescent', angle: 40, lit: 0.28, waxing: true,
    next: [
      { quarter: 'first-quarter', at: '2026-10-20T10:00:00Z', day: '2026-10-20' },
      { quarter: 'full', at: '2026-10-27T10:00:00Z', day: '2026-10-27' },
    ],
  },
  planets: [planet(2, 'Venus', 'planet.venus'), planet(1, 'Aphrodite')],
  colors: [planet(3, 'Green')],
  coming: [
    { day: '2026-10-17', kind: 'own', date: { id: 7, title: 'Gran birthday', yearly: 1 }, days_away: 1 },
    { day: '2026-10-28', kind: 'feast', entry: { id: 9, name: 'Samhain', starter_key: null, is_starter: 0, category_id: 4 }, days_away: 12 },
  ],
};
function stub(today = base, { pack = {}, language = 'en', fail = false, kinds = [] } = {}) {
  let failed = fail;
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/settings') return json({ language, theme: 'old-book' });
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? (pack.ui ?? {}) : (pack.content ?? {}));
    if (url === '/api/journal-kinds') return json(kinds);
    if (url === '/api/today') {
      if (failed) { failed = false; return json({ error: 'Nope', code: 'server_error' }, 500); }
      return json(today);
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
function mount() {
  const router = createMemoryRouter([{ path: '/', element: <SettingsProvider><Today /></SettingsProvider> }], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Today', () => {
  it('shows the long date, the moon and the next phases', async () => {
    stub(); mount();
    expect(await screen.findByRole('heading', { level: 1, name: /Friday, October 16, 2026/ })).toBeInTheDocument();
    expect(screen.getByText('Waxing crescent')).toBeInTheDocument();
    expect(screen.getByText('28% lit')).toBeInTheDocument();
    expect(screen.getByText(/First quarter/)).toBeInTheDocument();
    expect(screen.getByText(/Oct 27/)).toBeInTheDocument();
  });
  it('shows the day line with links to each planet and color', async () => {
    stub(); mount();
    await screen.findByText('28% lit');
    const line = screen.getByText(/belongs to/).closest('p');
    expect(line).toHaveTextContent('Friday belongs to Aphrodite and Venus. Its color is Green.');
    expect(within(line).getByRole('link', { name: 'Aphrodite' })).toHaveAttribute('href', '/correspondences/1');
    expect(within(line).getByRole('link', { name: 'Green' })).toHaveAttribute('href', '/correspondences/3');
  });
  it('uses the plural when the day has two colors', async () => {
    stub({ ...base, colors: [planet(3, 'Green'), planet(4, 'Pink')] }); mount();
    await screen.findByText('28% lit');
    const line = screen.getByText(/belongs to/).closest('p');
    expect(line).toHaveTextContent('Friday belongs to Aphrodite and Venus. Its colors are Green and Pink.');
    expect(within(line).getByRole('link', { name: 'Pink' })).toHaveAttribute('href', '/correspondences/4');
  });
  it('leaves out the color sentence when there are no colors', async () => {
    stub({ ...base, colors: [] }); mount();
    await screen.findByText('28% lit');
    const line = screen.getByText(/belongs to/).closest('p');
    expect(line).toHaveTextContent(/^Friday belongs to Aphrodite and Venus\.$/);
    expect(line).not.toHaveTextContent(/color/i);
  });
  it('leaves out the planet sentence when there are no planets', async () => {
    stub({ ...base, planets: [] }); mount();
    await screen.findByText('28% lit');
    const line = screen.getByText(/Its color is/).closest('p');
    expect(line).toHaveTextContent(/^Its color is Green\.$/);
  });
  it('keeps literal text that looks like a placeholder marker', async () => {
    stub(base, { language: 'es', pack: { ui: { 'today.dayPlanets': '{weekday} \u0000p\u0000 es de {planets}.' } } });
    mount();
    const line = (await screen.findByText(/es de/)).closest('p');
    expect(line).toHaveTextContent('viernes \u0000p\u0000 es de Aphrodite y Venus.');
  });
  it('shows just the weekday when planets and colors are empty', async () => {
    stub({ ...base, planets: [], colors: [] }); mount();
    await screen.findByText('28% lit');
    expect(screen.queryByText(/belongs to/)).toBeNull();
    expect(screen.getByText('Friday', { selector: 'p' })).toBeInTheDocument();
  });
  it('lists what is coming up with tomorrow and in 12 days', async () => {
    stub(); mount();
    await screen.findByText('Coming up');
    const own = screen.getByRole('link', { name: 'Gran birthday' });
    expect(own).toHaveAttribute('href', '/calendar/dates/7');
    expect(within(own.closest('li')).getByText('tomorrow')).toBeInTheDocument();
    const feast = screen.getByRole('link', { name: 'Samhain' });
    expect(feast).toHaveAttribute('href', '/correspondences/9');
    expect(within(feast.closest('li')).getByText('in 12 days')).toBeInTheDocument();
  });
  it('says so when nothing is coming', async () => {
    stub({ ...base, coming: [] }); mount();
    expect(await screen.findByText('Nothing on the calendar in the next year.')).toBeInTheDocument();
  });
  it('uses Spanish names and sorting from a pack', async () => {
    stub({ ...base, planets: [planet(2, 'Venus', 'planet.venus'), planet(1, 'Zeus', 'planet.zeus')] }, {
      language: 'es',
      pack: {
        ui: { 'today.dayPlanets': '{weekday} es de {planets}.', 'today.dayColors.one': 'Su color es {colors}.', 'today.dayColors': 'Sus colores son {colors}.', 'timing.moon.waxing-crescent': 'Luna creciente' },
        content: { 'planet.venus.name': 'Venus ES', 'planet.zeus.name': 'Ábaco' },
      },
    });
    mount();
    expect(await screen.findByText('Luna creciente')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: /viernes, 16 de octubre de 2026/ })).toBeInTheDocument();
    const line = screen.getByText(/es de/).closest('p');
    expect(line).toHaveTextContent('viernes es de Ábaco y Venus ES. Su color es Green.');
  });
  it('falls back to English for a sentence whose pack string drops or repeats its placeholder', async () => {
    stub(base, { language: 'es', pack: { ui: { 'today.dayPlanets': '{weekday} es de los planetas.', 'today.dayColors.one': 'Su color es {colors} y {colors}.' } } });
    mount();
    await screen.findByText('28% lit');
    const line = await screen.findByText(/belongs to/);
    expect(line.closest('p')).toHaveTextContent('viernes belongs to Aphrodite y Venus. Its color is Green.');
  });
  it('offers Try again when loading fails', async () => {
    stub(base, { fail: true }); mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('28% lit')).toBeInTheDocument();
  });
});

describe('Today rituals', () => {
  const week = [
    { id: 21, title: 'Moon jar', date: '2026-10-16', time: '20:30', spell_id: 5 },
    { id: 22, title: 'Samhain supper', date: '2026-10-18', time: null, spell_id: null },
  ];
  const reminders = [
    { id: 23, title: 'Cleanse the altar', date: '2026-10-16', days_away: 0 },
    { id: 24, title: 'Herb bundle', date: '2026-10-17', days_away: 1 },
    { id: 25, title: 'Hearth blessing', date: '2026-10-19', days_away: 3 },
  ];
  it('lists the week with date, time and a link', async () => {
    stub({ ...base, week, reminders: [] }); mount();
    const section = (await screen.findByRole('heading', { name: 'Rituals this week' })).closest('section');
    const first = within(section).getByRole('link', { name: 'Moon jar' });
    expect(first).toHaveAttribute('href', '/rituals/21');
    expect(first.closest('li')).toHaveTextContent(/Oct 16/);
    expect(first.closest('li')).toHaveTextContent(/8:30/);
    const second = within(section).getByRole('link', { name: 'Samhain supper' });
    expect(second.closest('li')).not.toHaveTextContent(/:/);
  });
  it('lists reminders as title and when', async () => {
    stub({ ...base, week: [], reminders }); mount();
    const section = (await screen.findByRole('heading', { name: 'Reminders' })).closest('section');
    expect(within(section).getByRole('link', { name: 'Cleanse the altar, today' }).closest('li')).toHaveTextContent('Cleanse the altar, today');
    expect(within(section).getByRole('link', { name: 'Herb bundle, tomorrow' }).closest('li')).toHaveTextContent('Herb bundle, tomorrow');
    expect(within(section).getByRole('link', { name: 'Hearth blessing, in 3 days' }).closest('li')).toHaveTextContent('Hearth blessing, in 3 days');
    expect(within(section).getByRole('link', { name: 'Hearth blessing, in 3 days' })).toHaveAttribute('href', '/rituals/25');
  });
  it('shows the journal link always, and no list when there are no entries', async () => {
    stub({ ...base, journal: [] }); mount();
    const section = (await screen.findByRole('heading', { name: 'Journal' })).closest('section');
    expect(within(section).getByRole('link', { name: 'Write in the journal' })).toHaveAttribute('href', '/journal/new');
    expect(within(section).queryByRole('list')).toBeNull();
  });
  it("lists today's entries with the time, linking to each", async () => {
    stub({ ...base, journal: [
      { id: 3, time: '07:30', title: 'A dream', excerpt: 'x', kind_id: 1 },
      { id: 4, time: '', title: '', excerpt: 'Walked by the river', kind_id: null },
      { id: 5, time: '', title: '', excerpt: '', kind_id: null },
    ] }); mount();
    const section = (await screen.findByRole('heading', { name: 'Journal' })).closest('section');
    expect(within(section).getByRole('link', { name: 'A dream' }).closest('li')).toHaveTextContent('7:30');
    expect(within(section).getByRole('link', { name: 'A dream' })).toHaveAttribute('href', '/journal/3');
    expect(within(section).getByRole('link', { name: 'Walked by the river' })).toHaveAttribute('href', '/journal/4');
    expect(await within(section).findByRole('link', { name: 'An entry with cards' })).toHaveAttribute('href', '/journal/5');
  });
  it('names a cards-only entry by its kind', async () => {
    stub({ ...base, journal: [{ id: 5, time: '', title: '', excerpt: '', kind_id: 2 }] }, { kinds: [{ id: 2, name: 'Tarot', is_starter: 0, starter_key: null }] });
    mount();
    expect(await screen.findByRole('link', { name: 'Tarot' })).toHaveAttribute('href', '/journal/5');
  });
  it('fetches the kinds once for two cards-only entries, and not at all when none needs them', async () => {
    stub({ ...base, journal: [
      { id: 5, time: '', title: '', excerpt: '', kind_id: 2 },
      { id: 6, time: '', title: '', excerpt: '', kind_id: 2 },
    ] }, { kinds: [{ id: 2, name: 'Tarot', is_starter: 0, starter_key: null }] });
    mount();
    expect(await screen.findAllByRole('link', { name: 'Tarot' })).toHaveLength(2);
    expect(fetch.mock.calls.filter(([u]) => u === '/api/journal-kinds')).toHaveLength(1);
  });
  it('does not fetch the kinds when every entry has a title or excerpt', async () => {
    stub({ ...base, journal: [{ id: 3, time: '', title: 'A dream', excerpt: '', kind_id: 1 }] }); mount();
    await screen.findByRole('link', { name: 'A dream' });
    expect(fetch.mock.calls.filter(([u]) => u === '/api/journal-kinds')).toHaveLength(0);
  });
  it('leaves out both lists when empty', async () => {
    stub({ ...base, week: [], reminders: [] }); mount();
    await screen.findByText('Coming up');
    expect(screen.queryByRole('heading', { name: 'Rituals this week' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reminders' })).toBeNull();
  });
});

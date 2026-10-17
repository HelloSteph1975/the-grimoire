import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { Calendar } from '../../client/src/screens/calendar/Calendar.jsx';
import { gridRange, addMonths, validMonth } from '../../client/src/lib/days.js';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const entry = (id, name, key = null) => ({ id, name, starter_key: key, is_starter: key ? 1 : 0, category_id: 4 });
const OCTOBER = [
  { day: '2026-09-28', kind: 'own', date: { id: 3, title: 'Old friend day', yearly: 1 } },
  { day: '2026-10-03', kind: 'moon', quarter: 'last-quarter', at: '2026-10-03T13:25:00Z' },
  { day: '2026-10-10', kind: 'moon', quarter: 'new', at: '2026-10-10T15:50:00Z' },
  { day: '2026-10-17', kind: 'own', date: { id: 7, title: 'Gran birthday', yearly: 1 } },
  { day: '2026-10-26', kind: 'moon', quarter: 'full', at: '2026-10-26T15:12:00Z' },
  { day: '2026-10-28', kind: 'saint', entry: entry(50, 'San Judas Tadeo', 'corr.saints-deities.judas') },
  { day: '2026-10-31', kind: 'sabbat', entry: entry(9, 'Samhain', 'corr.sabbats-feasts.samhain') },
];
const calls = [];
function stub({ items = OCTOBER, pack = {}, language = 'en', fail = false, todayFails = false, laterToday = null } = {}) {
  let failed = fail;
  let todayCalls = 0;
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async url => {
    calls.push(url);
    if (url === '/api/settings') return json({ language, theme: 'old-book', time_zone: 'America/Chicago', hemisphere: 'north' });
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? (pack.ui ?? {}) : (pack.content ?? {}));
    if (url === '/api/today') {
      todayCalls += 1;
      if (todayFails) return json({ error: 'Nope', code: 'server_error' }, 500);
      return json({ day: todayCalls > 1 && laterToday ? laterToday : '2026-10-16' });
    }
    if (url.startsWith('/api/calendar?')) {
      if (failed) { failed = false; return json({ error: 'Nope', code: 'server_error' }, 500); }
      return json({ items });
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}
function mount(at = '/calendar') {
  const router = createMemoryRouter([
    { path: '/calendar', element: <SettingsProvider><Calendar /><Where /></SettingsProvider> },
    { path: '*', element: <Where /> },
  ], { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}
const grid = () => screen.findByRole('table');
const cell = (name) => screen.getByRole('button', { name });
afterEach(() => { vi.unstubAllGlobals(); });

describe('day helpers', () => {
  it('starts the grid on Monday and keeps it inside 1900 to 2100', () => {
    expect(gridRange('2026-10')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
    expect(gridRange('1900-01').from).toBe('1900-01-01');
    expect(gridRange('2100-12').to).toBe('2100-12-31');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(validMonth('2026-10')).toBe(true);
    expect(validMonth('1899-12')).toBe(false);
    expect(validMonth('2101-01')).toBe(false);
    expect(validMonth('2026-13')).toBe(false);
    expect(validMonth('nonsense')).toBe(false);
  });
});

describe('Calendar', () => {
  it('shows October 2026 as 35 days starting Monday September 28', async () => {
    stub(); mount();
    const table = await grid();
    expect(screen.getByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
    const days = within(table).getAllByRole('button');
    expect(days).toHaveLength(35);
    expect(days[0]).toHaveAccessibleName(/Monday, September 28, 2026/);
    expect(days[0]).toHaveClass('cal-out');
    expect(days[34]).toHaveAccessibleName(/Sunday, November 1, 2026/);
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(calls).toContain('/api/calendar?from=2026-09-28&to=2026-11-01');
    expect(cell(/October 16, 2026/)).toHaveAttribute('aria-current', 'date');
  });
  it('shows Samhain on October 31 and a moon on the full moon', async () => {
    stub(); mount();
    await grid();
    const samhain = cell('Saturday, October 31, 2026, 1 item');
    expect(within(samhain).getByText('Samhain')).toBeInTheDocument();
    const full = cell(/October 26, 2026/);
    expect(within(full).getByRole('img', { name: 'Full moon' })).toBeInTheDocument();
    expect(cell('Friday, October 16, 2026, 0 items')).toBeInTheDocument();
  });
  it('opens a day with San Judas Tadeo linking to its entry', async () => {
    stub(); mount();
    await grid();
    await userEvent.click(cell(/October 28, 2026/));
    expect(screen.getByTestId('where')).toHaveTextContent('day=2026-10-28');
    const panel = screen.getByRole('region', { name: 'Wednesday, October 28, 2026' });
    expect(within(panel).getByRole('link', { name: 'San Judas Tadeo' })).toHaveAttribute('href', '/correspondences/50');
    expect(within(panel).getByText('Saint or deity')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a date' })).toHaveAttribute('href', '/calendar/dates/new?date=2026-10-28');
  });
  it('shows a moon time in the owner time zone and own dates link to their page', async () => {
    stub(); mount('/calendar?day=2026-10-26');
    await grid();
    const panel = screen.getByRole('region', { name: 'Monday, October 26, 2026' });
    expect(within(panel).getByText(/Full moon/)).toBeInTheDocument();
    expect(within(panel).getByText('at 10:12 AM')).toBeInTheDocument();
    await userEvent.click(cell(/October 17, 2026/));
    const own = within(screen.getByRole('region', { name: 'Saturday, October 17, 2026' })).getByRole('link', { name: 'Gran birthday' });
    expect(own).toHaveAttribute('href', '/calendar/dates/7');
  });
  it('says so when a day is empty', async () => {
    stub(); mount('/calendar?day=2026-10-16');
    await grid();
    expect(within(screen.getByRole('region', { name: /October 16, 2026/ })).getByText('Nothing on this day.')).toBeInTheDocument();
  });
  it('lists the month in date order with the weekday', async () => {
    stub(); mount();
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('where')).toHaveTextContent('view=list');
    const days = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
    expect(days).toEqual(['Saturday, October 3', 'Saturday, October 10', 'Saturday, October 17', 'Monday, October 26', 'Wednesday, October 28', 'Saturday, October 31']);
    expect(screen.queryByText('Old friend day')).toBeNull();
    const names = screen.getAllByRole('listitem').map(li => li.textContent);
    expect(names.findIndex(n => n.includes('Gran birthday'))).toBeLessThan(names.findIndex(n => n.includes('San Judas Tadeo')));
  });
  it('says so when the month is empty', async () => {
    stub({ items: [] }); mount('/calendar?view=list');
    expect(await screen.findByText('Nothing this month.')).toBeInTheDocument();
  });
  it('moves to the next month and back to today', async () => {
    stub(); mount('/calendar?day=2026-10-28');
    await grid();
    await userEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/calendar?month=2026-11');
    expect(screen.getByTestId('where')).not.toHaveTextContent('day=');
    expect(await screen.findByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument();
    expect(calls).toContain('/api/calendar?from=2026-10-26&to=2026-12-06');
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
  });
  it('Today asks the server for the day again, so it follows midnight', async () => {
    stub({ laterToday: '2026-11-01' }); mount('/calendar');
    await grid();
    expect(cell(/October 16/)).toHaveAttribute('aria-current', 'date');
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument();
    expect(calls.filter(u => u === '/api/today')).toHaveLength(2);
    expect(await screen.findByRole('button', { name: /November 1, 2026/ })).toHaveAttribute('aria-current', 'date');
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(1);
  });
  it('disables the previous arrow at January 1900', async () => {
    stub({ items: [] }); mount('/calendar?month=1900-01');
    expect(await screen.findByRole('heading', { level: 2, name: 'January 1900' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeEnabled();
  });
  it('disables the next arrow at December 2100', async () => {
    stub({ items: [] }); mount('/calendar?month=2100-12');
    expect(await screen.findByRole('heading', { level: 2, name: 'December 2100' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(calls).toContain('/api/calendar?from=2100-11-29&to=2100-12-31');
    expect(cell(/Friday, December 31, 2100/)).toBeEnabled();
    expect(cell(/Saturday, January 1, 2101/)).toBeDisabled();
    expect(cell(/Sunday, January 2, 2101/)).toBeDisabled();
  });
  it('never opens or prefills a day past 2100', async () => {
    stub({ items: [] }); mount('/calendar?month=2100-12&day=2101-01-01');
    await grid();
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByRole('link', { name: 'Add a date' })).toHaveAttribute('href', '/calendar/dates/new');
  });
  for (const bad of ['garbage', '2026-13']) {
    it(`treats month=${bad} as today and removes it`, async () => {
      stub(); const router = mount(`/calendar?month=${bad}&view=list`);
      expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/calendar?view=list');
      expect(router.state.historyAction).toBe('REPLACE');
    });
  }
  it('keeps focus on Next while new months load', async () => {
    stub(); mount();
    await grid();
    const next = screen.getByRole('button', { name: 'Next month' });
    next.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 2, name: 'November 2026' })).toBeInTheDocument();
    await grid();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 2, name: 'December 2026' })).toBeInTheDocument();
    await grid();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('button', { name: 'Next month' })).toBe(next);
  });
  it('closes the open day when it is clicked again', async () => {
    stub(); mount('/calendar?day=2026-10-28');
    await grid();
    expect(screen.getByRole('region', { name: /October 28, 2026/ })).toBeInTheDocument();
    await userEvent.click(cell(/October 28, 2026/));
    expect(screen.getByTestId('where')).not.toHaveTextContent('day=');
    expect(screen.queryByRole('region')).toBeNull();
  });
  it('does not prefill a hidden day in the list view', async () => {
    stub(); mount('/calendar?day=2026-10-28&view=list');
    await screen.findByRole('heading', { level: 3, name: /October 28/ });
    expect(screen.getByRole('link', { name: 'Add a date' })).toHaveAttribute('href', '/calendar/dates/new');
  });
  it('labels the view toggles', async () => {
    stub(); mount();
    await grid();
    expect(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('treats a month out of range as today', async () => {
    stub(); mount('/calendar?month=2101-01');
    expect(await screen.findByRole('heading', { level: 2, name: 'October 2026' })).toBeInTheDocument();
  });
  it('uses Spanish weekdays and translated, sorted names', async () => {
    stub({
      language: 'es',
      items: [
        { day: '2026-10-31', kind: 'sabbat', entry: entry(9, 'Samhain', 'corr.sabbats-feasts.samhain') },
        { day: '2026-10-31', kind: 'feast', entry: entry(11, 'Zebra feast') },
      ],
      pack: {
        ui: { 'calendar.title': 'Calendario', 'calendar.dayLabel': '{date}, {n} cosas', 'calendar.dayLabel.one': '{date}, 1 cosa' },
        content: { 'corr.sabbats-feasts.samhain.name': 'Víspera de Samhain' },
      },
    });
    mount();
    expect(await screen.findByRole('heading', { level: 1, name: 'Calendario' })).toBeInTheDocument();
    const table = await grid();
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']);
    expect(screen.getByRole('heading', { level: 2, name: /octubre de 2026/ })).toBeInTheDocument();
    const day = cell('sábado, 31 de octubre de 2026, 2 cosas');
    const names = [...day.querySelectorAll('.cal-name')].map(n => n.textContent);
    expect(names).toEqual(['Víspera de Samhain', 'Zebra feast']);
  });
  it('still shows a named month when today fails to load', async () => {
    stub({ todayFails: true }); mount('/calendar?month=2026-10');
    const table = await grid();
    expect(within(table).getAllByRole('button')).toHaveLength(35);
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(table.querySelector('[aria-current="date"]')).toBeNull();
  });
  it('offers Try again when today fails and no month is named', async () => {
    stub({ todayFails: true }); mount('/calendar');
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
  it('offers Try again when the calendar fails to load', async () => {
    stub({ fail: true }); mount();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await grid()).toBeInTheDocument();
  });
});

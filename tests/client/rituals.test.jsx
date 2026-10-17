import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Rituals } from '../../client/src/screens/rituals/Rituals.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const traditions = [{ id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 }];
const spells = [
  { id: 5, title: 'Moon jar', purpose: '', kind_id: null, version: 1 },
  { id: 6, title: 'Salt line', purpose: '', kind_id: null, version: 1 },
];
const rows = {
  planned: [{ id: 1, title: 'Full moon jar', spell_id: 5, date: '2026-10-25', time: '19:30', status: 'planned', rating: null, version: 1 }],
  tolog: [{ id: 2, title: 'Doorway salt', spell_id: 6, date: '2026-10-02', time: null, status: 'planned', rating: null, version: 1 }],
  log: [
    { id: 3, title: 'Rest jar', spell_id: 5, date: '2026-09-20', time: null, status: 'done', rating: 4, version: 2 },
    { id: 4, title: 'Quiet night', spell_id: 99, date: '2026-09-10', time: null, status: 'skipped', rating: null, version: 2 },
  ],
};

function stub({ list = p => rows[p.get('tab')] ?? [] } = {}) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book' });
    if (url === '/api/traditions') return json(traditions);
    if (url === '/api/spells') return json(spells);
    if (url.startsWith('/api/locales/')) return json({});
    if (url.startsWith('/api/rituals?')) return json(list(new URLSearchParams(url.split('?')[1])));
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path = '/rituals') {
  const wrap = el => <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider>{el}</LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>;
  router = createMemoryRouter([{ path: '/rituals', element: wrap(<Rituals />) }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const urls = () => fetch.mock.calls.map(([u]) => u);
afterEach(() => { vi.unstubAllGlobals(); });

describe('Rituals list', () => {
  it('opens on Planned and shows the date, time, title and spell', async () => {
    stub(); mount();
    expect(await screen.findByText('Full moon jar')).toBeInTheDocument();
    expect(urls()).toContain('/api/rituals?tab=planned');
    expect(screen.getByRole('button', { name: 'Planned' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Log' })).toHaveAttribute('aria-pressed', 'false');
    const row = screen.getByText('Full moon jar').closest('li');
    expect(within(row).getByText('Sun, Oct 25, 2026')).toBeInTheDocument();
    expect(within(row).getByText('7:30 PM')).toBeInTheDocument();
    expect(within(row).getByText('Moon jar')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Full moon jar/ })).toHaveAttribute('href', '/rituals/1');
    expect(within(row).queryByRole('link', { name: 'Log it' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a ritual' })).toHaveAttribute('href', '/rituals/new');
    expect(screen.queryByLabelText('Rating at least')).not.toBeInTheDocument();
  });

  it('keeps the tab in the URL, and To log rows get a Log it link', async () => {
    stub(); mount();
    await screen.findByText('Full moon jar');
    await userEvent.click(screen.getByRole('button', { name: 'To log' }));
    await vi.waitFor(() => expect(router.state.location.search).toBe('?tab=tolog'));
    expect(await screen.findByText('Doorway salt')).toBeInTheDocument();
    expect(urls()).toContain('/api/rituals?tab=tolog');
    const row = screen.getByText('Doorway salt').closest('li');
    expect(within(row).getByRole('link', { name: 'Log it' })).toHaveAttribute('href', '/rituals/2/log');
    expect(within(row).getByText('Salt line')).toBeInTheDocument();
  });

  it('shows stars for a logged rating, and no spell name for a spell that is gone', async () => {
    stub(); mount('/rituals?tab=log');
    const rest = (await screen.findByText('Rest jar')).closest('li');
    expect(within(rest).getByRole('img', { name: '4 of 5' })).toBeInTheDocument();
    expect(within(rest).getByText('Moon jar')).toBeInTheDocument();
    const quiet = screen.getByText('Quiet night').closest('li');
    expect(within(quiet).queryByRole('img', { name: /of 5/ })).not.toBeInTheDocument();
    expect(within(quiet).queryByText('Moon jar')).not.toBeInTheDocument();
  });

  it('writes the Log filters to the URL and sends them', async () => {
    stub(); mount('/rituals?tab=log');
    await screen.findByText('Rest jar');
    const spell = screen.getByRole('combobox', { name: 'Spell' });
    expect(within(spell).getAllByRole('option').map(o => o.textContent)).toEqual(['All spells', 'Moon jar', 'Salt line']);
    await userEvent.selectOptions(spell, '5');
    await vi.waitFor(() => expect(router.state.location.search).toBe('?tab=log&spell=5'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tradition' }), '1');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rating at least' }), '3');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-30' } });
    await vi.waitFor(() => expect(router.state.location.search).toBe('?tab=log&spell=5&tradition=1&rating=3&from=2026-09-01&to=2026-09-30'));
    await vi.waitFor(() => expect(urls()).toContain('/api/rituals?tab=log&spell=5&tradition=1&rating=3&from=2026-09-01&to=2026-09-30'));
  });

  it('reads the filters from the URL and leaves them out on other tabs', async () => {
    stub(); mount('/rituals?tab=log&rating=4&from=2026-09-01');
    await screen.findByText('Rest jar');
    expect(urls()).toContain('/api/rituals?tab=log&rating=4&from=2026-09-01');
    expect(screen.getByRole('combobox', { name: 'Rating at least' })).toHaveValue('4');
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-01');
    await userEvent.click(screen.getByRole('button', { name: 'Planned' }));
    await screen.findByText('Full moon jar');
    expect(urls()).toContain('/api/rituals?tab=planned');
  });

  it('has its own empty text for each tab', async () => {
    stub({ list: () => [] }); mount();
    expect(await screen.findByText('Nothing planned yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'To log' }));
    expect(await screen.findByText('Nothing waiting to be logged.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(await screen.findByText('Nothing logged yet.')).toBeInTheDocument();
  });

  it('treats an unknown tab as Planned', async () => {
    stub(); mount('/rituals?tab=nope');
    expect(await screen.findByText('Full moon jar')).toBeInTheDocument();
    expect(urls()).toContain('/api/rituals?tab=planned');
  });

  it('says no logged rituals match when a filter leaves the Log empty', async () => {
    stub({ list: p => (p.get('rating') ? [] : rows[p.get('tab')] ?? []) }); mount('/rituals?tab=log');
    await screen.findByText('Rest jar');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rating at least' }), '5');
    expect(await screen.findByText('No logged rituals match.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing logged yet.')).not.toBeInTheDocument();
  });
});

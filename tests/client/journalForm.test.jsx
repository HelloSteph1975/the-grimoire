import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { EntryFormRoute } from '../../client/src/screens/journal/EntryForm.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const kinds = [
  { id: 3, name: 'Dream', is_starter: 1, starter_key: 'journalkind.dream', version: 1 },
  { id: 4, name: 'Pull', is_starter: 0, starter_key: null, version: 1 },
];
const stored = () => ({
  id: 8, date: '2026-10-16', time: '19:30', kind_id: 4, kind: { id: 4 }, title: 'Owl dream', text: 'An owl on the gate.',
  tags: ['luna'], cards: [{ name: 'The Moon', position: 'Past', reversed: true }], sky: null, version: 3,
});

let entry;
let override;
let zone;
function stub() {
  entry = stored();
  override = null;
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const hit = override?.(url, m, body);
    if (hit) return hit;
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book', time_zone: zone });
    if (url === '/api/journal-kinds') return json(kinds);
    if (url.startsWith('/api/locales/')) return json({});
    if (url === '/api/journal' && m === 'POST') return json({ ...stored(), ...body, id: 21, version: 1 }, 201);
    if (url === '/api/journal/8' && m === 'GET') return json(entry);
    if (url === '/api/journal/8' && m === 'PATCH') {
      if (body.version !== entry.version) return json({ error: 'changed', code: 'conflict', current: entry }, 409);
      return json({ ...entry, ...body, version: entry.version + 1 });
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path) {
  router = createMemoryRouter([{
    element: <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>,
    children: [
      { path: '/journal', element: <p>The list</p> },
      { path: '/journal/new', element: <EntryFormRoute /> },
      { path: '/journal/:id', element: <p>The entry page</p> },
      { path: '/journal/:id/edit', element: <EntryFormRoute /> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const sent = method => fetch.mock.calls.filter(([, o]) => o?.method === method).map(([u, o]) => ({ url: u, body: JSON.parse(o.body) }));
const cardRows = () => [...screen.getByRole('group', { name: 'Cards drawn' }).querySelectorAll('.list-row')];
const loadEdit = async () => {
  mount('/journal/8/edit');
  await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Owl dream'));
};

beforeEach(() => { zone = 'UTC'; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Journal entry form', () => {
  it('starts on now in the Settings zone, the first kind, and posts the exact body', async () => {
    // 2026-10-17 02:30 UTC is still the evening of the 16th in Mexico City (UTC-6).
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T02:30:00Z') });
    zone = 'America/Mexico_City';
    stub(); mount('/journal/new');
    expect(await screen.findByRole('heading', { name: 'New entry' })).toBeInTheDocument();
    await screen.findByLabelText('Title');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-16');
    expect(screen.getByLabelText('Time')).toHaveValue('20:30');
    const kind = screen.getByLabelText('Kind');
    expect(within(kind).getAllByRole('option').map(o => o.textContent)).toEqual(['No kind', 'Dream', 'Pull']);
    expect(kind).toHaveValue('3');

    await userEvent.type(screen.getByLabelText('Title'), 'Owl');
    await userEvent.type(screen.getByLabelText('Entry'), 'It watched me.');
    await userEvent.type(screen.getByLabelText('Tags'), 'Luna{Enter}');
    await userEvent.click(screen.getByRole('button', { name: 'Add a card' }));
    const [row] = cardRows();
    await userEvent.type(within(row).getByLabelText('Card'), 'The Moon');
    await userEvent.type(within(row).getByLabelText('Position'), 'Past');
    await userEvent.click(within(row).getByLabelText('Reversed'));
    const options = [...row.querySelectorAll('datalist option')].map(o => o.value);
    expect(options).toHaveLength(78);
    expect(options).toContain('The Hanged Man');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal/21'));
    expect(sent('POST')).toEqual([{
      url: '/api/journal',
      body: {
        date: '2026-10-16', time: '20:30', kind_id: 3, title: 'Owl', text: 'It watched me.', tags: ['Luna'],
        cards: [{ name: 'The Moon', position: 'Past', reversed: true }],
      },
    }]);
  });

  it('presets the date from the link and leaves the time empty', async () => {
    stub(); mount('/journal/new?date=2026-10-30');
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-10-30');
    expect(screen.getByLabelText('Time')).toHaveValue('');
  });

  it('ignores a day in the link that is not real', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-17T12:00:00Z') });
    stub(); mount('/journal/new?date=2026-02-30');
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-10-17');
    expect(screen.getByLabelText('Time')).toHaveValue('12:00');
  });

  it('saves an entry with only cards, and one with only text', async () => {
    stub(); mount('/journal/new?date=2026-10-30');
    await screen.findByLabelText('Title');
    await userEvent.type(screen.getByLabelText('Entry'), 'Only words.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('POST')).toHaveLength(1));
    expect(sent('POST')[0].body).toMatchObject({ title: '', text: 'Only words.', cards: [], tags: [] });
  });

  it('shows the empty message on Title when the server says the entry is empty', async () => {
    stub(); mount('/journal/new?date=2026-10-30');
    await screen.findByLabelText('Title');
    override = (url, m) => (m === 'POST' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { title: 'Add a title, some text or a card' }, detailCodes: { title: { code: 'empty' } },
    }, 400) : null);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveAccessibleDescription('Add a title, some words or a card.'));
    expect(router.state.location.pathname).toBe('/journal/new');
  });

  it('shows a card error under the matching row', async () => {
    stub(); await loadEdit();
    override = (url, m) => (m === 'PATCH' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { 'cards.0.name': 'Required' }, detailCodes: { 'cards.0.name': { code: 'required' } },
    }, 400) : null);
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [first] = cardRows();
    await vi.waitFor(() => expect(within(first).getByLabelText('Card')).toHaveAccessibleDescription('Required'));
  });

  it('fills an edit from the stored entry and saves with its version', async () => {
    stub(); await loadEdit();
    expect(screen.getByRole('heading', { name: 'Edit entry' })).toBeInTheDocument();
    expect(screen.getByLabelText('Time')).toHaveValue('19:30');
    expect(screen.getByLabelText('Kind')).toHaveValue('4');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const [card] = cardRows();
    expect(within(card).getByLabelText('Card')).toHaveValue('The Moon');
    expect(within(card).getByLabelText('Reversed')).toBeChecked();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal/8'));
    expect(sent('PATCH')[0].body).toEqual({
      date: '2026-10-16', time: '19:30', kind_id: 4, title: 'Owl dream!', text: 'An owl on the gate.', tags: ['luna'],
      cards: [{ name: 'The Moon', position: 'Past', reversed: true }], version: 3,
    });
  });

  it('shows an entry whose kind is in the Trash as No kind and sends null', async () => {
    stub();
    entry = { ...stored(), kind: null };
    await loadEdit();
    expect(screen.getByLabelText('Kind')).toHaveValue('');
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('PATCH')).toHaveLength(1));
    expect(sent('PATCH')[0].body.kind_id).toBeNull();
  });

  it('Keep mine saves over the newer entry with its version', async () => {
    stub(); await loadEdit();
    entry = { ...stored(), version: 6, title: 'Owl dream two' };
    await userEvent.type(screen.getByLabelText('Entry'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Keep mine and save over it'));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal/8'));
    expect(sent('PATCH').map(c => c.body.version)).toEqual([3, 6]);
    expect(sent('PATCH')[1].body).toMatchObject({ title: 'Owl dream', text: 'An owl on the gate. x' });
  });

  it('Reload the latest fills the form from the newer entry', async () => {
    stub(); await loadEdit();
    entry = { ...stored(), version: 6, title: 'Owl again', time: null, tags: [], cards: [] };
    await userEvent.type(screen.getByLabelText('Entry'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Reload the latest'));
    expect(screen.getByLabelText('Title')).toHaveValue('Owl again');
    expect(screen.getByLabelText('Time')).toHaveValue('');
    expect(cardRows()).toHaveLength(0);
  });

  it('asks before leaving with changes', async () => {
    stub(); await loadEdit();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal/8'));
  });

  it('leaves at once when nothing changed', async () => {
    stub(); mount('/journal/new');
    await screen.findByLabelText('Title');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal'));
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});

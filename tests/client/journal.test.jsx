import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Journal } from '../../client/src/screens/journal/Journal.jsx';
import { EntryPageRoute } from '../../client/src/screens/journal/EntryPage.jsx';
import en from '../../client/src/i18n/en.json';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const kinds = [
  { id: 1, name: 'Dream', is_starter: 1, starter_key: 'journalkind.dream', version: 1 },
  { id: 2, name: 'Pull', is_starter: 0, starter_key: null, version: 1 },
];
const rows = [
  { id: 4, date: '2026-10-16', time: '19:30', kind_id: 1, title: 'Owl dream', excerpt: 'An owl on the gate.', moon: 'full', version: 1 },
  { id: 3, date: '2026-10-15', time: null, kind_id: 2, title: '', excerpt: 'Three cups and a long quiet evening.', moon: 'waning-gibbous', version: 1 },
];
const entry = {
  id: 4, date: '2026-10-16', time: '19:30', kind_id: 1, kind: { id: 1 }, title: 'Owl dream', version: 5,
  text: 'First paragraph.\n\nSecond paragraph.', tags: ['luna', 'Owls'],
  cards: [{ name: 'The Moon', position: 'Past', reversed: true }, { name: 'The Star', position: null, reversed: false }],
  sky: { moon: 'full', lit: 1, weekday: 'fri', planet: 'venus' },
};

function stub({ list = () => rows, one = entry, tags = ['Luna', 'Owls'] } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book', time_zone: 'UTC' });
    if (url === '/api/journal-kinds') return json(kinds);
    if (url === '/api/journal/tags') return json(tags);
    if (url.startsWith('/api/locales/')) return json({});
    if (url.startsWith('/api/journal?')) return json(list(new URLSearchParams(url.split('?')[1])));
    if (url === '/api/journal/4' && init.method === 'DELETE') return json({ ok: true });
    if (url === '/api/journal/4/restore') return json(one);
    if (url === '/api/journal/4') return json(one);
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path = '/journal') {
  const wrap = el => <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider>{el}</LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>;
  router = createMemoryRouter([
    { path: '/journal', element: wrap(<Journal />) },
    { path: '/journal/:id', element: wrap(<EntryPageRoute />) },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Journal list', () => {
  it('shows the date, time, kind, title or excerpt, and links each row', async () => {
    stub(); mount();
    const first = (await screen.findByText('Owl dream')).closest('li');
    expect(within(first).getByRole('link')).toHaveAttribute('href', '/journal/4');
    expect(within(first).getByText('Oct 16, 2026')).toBeInTheDocument();
    expect(within(first).getByText('7:30 PM')).toBeInTheDocument();
    expect(within(first).getByText('Dream')).toBeInTheDocument();
    expect(first.querySelector('.moon-icon')).not.toBeNull();
    // No title: the excerpt stands in, and there is no time.
    const second = screen.getByText('Three cups and a long quiet evening.').closest('li');
    expect(within(second).getByText('Pull')).toBeInTheDocument();
    expect(within(second).getByText('Oct 15, 2026')).toBeInTheDocument();
    expect(within(second).queryByText(/[AP]M/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Write an entry' })).toHaveAttribute('href', '/journal/new');
  });

  it('names an entry with no title and no excerpt as untitled', async () => {
    stub({ list: () => [{ id: 6, date: '2026-10-14', time: null, kind_id: null, title: '', excerpt: '', moon: null, version: 1 }] }); mount();
    const li = (await screen.findByText(en['journal.untitled'])).closest('li');
    expect(within(li).getByRole('link')).toHaveAttribute('href', '/journal/6');
  });

  it('fetches with the filters from the URL', async () => {
    stub(); mount('/journal?kind=2&tag=luna&from=2026-10-01&to=2026-10-31&q=owl');
    await screen.findByText('Owl dream');
    const sent = fetch.mock.calls.map(([u]) => u).filter(u => u.startsWith('/api/journal?'));
    expect(sent).toContain('/api/journal?kind=2&tag=luna&from=2026-10-01&to=2026-10-31&q=owl');
    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveValue('2');
    // The tag in the link is shown under the spelling the tag list uses.
    expect(screen.getByRole('combobox', { name: 'Tag' })).toHaveValue('Luna');
    expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-31');
    expect(screen.getByRole('searchbox')).toHaveValue('owl');
  });

  it('writes kind, tag, from, to and q to the URL', async () => {
    stub(); mount();
    await screen.findByText('Owl dream');
    const kind = screen.getByRole('combobox', { name: 'Kind' });
    expect(within(kind).getAllByRole('option').map(o => o.textContent)).toEqual(['All kinds', 'Dream', 'Pull']);
    await userEvent.selectOptions(kind, '1');
    await vi.waitFor(() => expect(router.state.location.search).toBe('?kind=1'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'Owls');
    await vi.waitFor(() => expect(router.state.location.search).toBe('?kind=1&tag=Owls'));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
    await vi.waitFor(() => expect(router.state.location.search).toContain('from=2026-10-01'));
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-10-31' } });
    await vi.waitFor(() => expect(router.state.location.search).toContain('to=2026-10-31'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'owl' } });
    await vi.waitFor(() => expect(router.state.location.search).toContain('q=owl'));
    expect(new URLSearchParams(router.state.location.search).get('kind')).toBe('1');
    await vi.waitFor(() => expect(fetch.mock.calls.map(([u]) => u))
      .toContain('/api/journal?kind=1&tag=Owls&from=2026-10-01&to=2026-10-31&q=owl'));
  });

  it('treats an unknown kind as All', async () => {
    stub(); mount('/journal?kind=99');
    await screen.findByText('Owl dream');
    await vi.waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('says the journal is empty, and says nothing matches when a filter finds nothing', async () => {
    stub({ list: () => [] }); mount();
    expect(await screen.findByText('The journal is empty. Write down a dream, a pull or a sign.')).toBeInTheDocument();
  });
  it('says no entries match with any filter', async () => {
    stub({ list: () => [] }); mount('/journal?q=zzz');
    expect(await screen.findByText('No entries match.')).toBeInTheDocument();
    expect(screen.queryByText(/The journal is empty/)).not.toBeInTheDocument();
  });
});

describe('Journal entry page', () => {
  it('shows the heading, kind, sky, tag links, cards and paragraphs', async () => {
    stub(); mount('/journal/4');
    expect(await screen.findByRole('heading', { name: 'Owl dream' })).toBeInTheDocument();
    expect(await screen.findByText('Dream')).toBeInTheDocument();
    expect(screen.getByText('Friday, October 16, 2026')).toBeInTheDocument();
    expect(screen.getByText('7:30 PM')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The sky' })).toBeInTheDocument();
    expect(screen.getByText('Full moon, 100% lit. Friday, the day of Venus.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'luna' })).toHaveAttribute('href', '/journal?tag=luna');
    expect(screen.getByRole('link', { name: 'Owls' })).toHaveAttribute('href', '/journal?tag=Owls');
    const cards = screen.getAllByText(/The (Moon|Star)/).map(el => el.closest('li'));
    expect(within(cards[0]).getByText('Past')).toBeInTheDocument();
    expect(within(cards[0]).getByText('Reversed')).toBeInTheDocument();
    expect(within(cards[1]).queryByText('Reversed')).not.toBeInTheDocument();
    expect(screen.getByText('First paragraph.').tagName).toBe('P');
    expect(screen.getByText('Second paragraph.').tagName).toBe('P');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/journal/4/edit');
  });

  it('uses the date as the heading when there is no title', async () => {
    stub({ one: { ...entry, title: '', sky: null, cards: [], tags: [] } }); mount('/journal/4');
    expect(await screen.findByRole('heading', { level: 1, name: 'Friday, October 16, 2026' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'The sky' })).not.toBeInTheDocument();
  });

  it('deletes after asking, goes back to the list, and Undo restores', async () => {
    stub(); mount('/journal/4');
    await screen.findByRole('heading', { name: 'Owl dream' });
    await userEvent.click(within(document.querySelector('.page-header')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move this entry to the Trash?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The entry is in the Trash.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/journal');
    expect(fetch.mock.calls.filter(([u, o]) => u === '/api/journal/4' && o?.method === 'DELETE')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/journal/4'));
    expect(fetch.mock.calls.filter(([u, o]) => u === '/api/journal/4/restore' && o?.method === 'POST')).toHaveLength(1);
  });
});

describe('Journal strings', () => {
  it('lists exactly 78 card names', () => {
    const names = en['journal.cardNames'].split('|');
    expect(names).toHaveLength(78);
    expect(new Set(names).size).toBe(78);
    expect(names[0]).toBe('The Fool');
    expect(names[21]).toBe('The World');
    expect(names[22]).toBe('Ace of Wands');
    expect(names[77]).toBe('King of Pentacles');
  });
});

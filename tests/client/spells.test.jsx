import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Spells } from '../../client/src/screens/spells/Spells.jsx';
import { SpellPageRoute } from '../../client/src/screens/spells/SpellPage.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const kinds = [
  { id: 1, name: 'Protection', is_starter: 1, starter_key: 'spellkind.protection', version: 1 },
  { id: 2, name: 'Blessing', is_starter: 0, starter_key: null, version: 1 },
];
const traditions = [{ id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 }];
const spells = [
  { id: 3, title: 'Cobre', purpose: 'Warm the house.', kind_id: 2, version: 1 },
  { id: 1, title: 'Agua', purpose: 'Clear the air.', kind_id: 1, version: 1 },
  { id: 2, title: 'Ámbar ward', purpose: 'Keep watch.', kind_id: 1, version: 1 },
];
const spell = {
  id: 5, title: 'Moon jar', purpose: 'For rest.', kind_id: 1, notes: 'First para.\n\nSecond para.', source: 'My gran', version: 4,
  traditions: [1],
  feasts: [{ id: 30, name: 'Yule', starter_key: null, is_starter: 0, feast_day: '12-21' }],
  ingredients: [
    { name: 'Salt', amount: '1 pinch', correspondence_id: 9, link: { id: 9, name: 'Salt', starter_key: null, is_starter: 0 } },
    { name: 'Hidden herb', amount: '2 leaves', correspondence_id: null, link: null },
  ],
  steps: ['Light the candle', 'Say the words', 'Blow it out'],
  timing: { moon: ['full'], day: ['fri'], planet: [] },
};

function stub({ language = 'en', pack = {}, list = () => spells, one = spell, del = () => json({ ok: true }) } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    if (url === '/api/settings') return json({ language, theme: 'old-book' });
    if (url === '/api/spell-kinds') return json(kinds);
    if (url === '/api/traditions') return json(traditions);
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? (pack.ui ?? {}) : (pack.content ?? {}));
    if (url.startsWith('/api/spells?')) return json(list(new URLSearchParams(url.split('?')[1])));
    if (url === '/api/spells/5' && init?.method === 'DELETE') return del();
    if (url === '/api/spells/5/restore') return json({ ok: true });
    if (url === '/api/spells/5') return json(one);
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path = '/spells') {
  const wrap = el => <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider>{el}</LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>;
  router = createMemoryRouter([
    { path: '/spells', element: wrap(<Spells />) },
    { path: '/spells/:id', element: wrap(<SpellPageRoute />) },
  ], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('Book of Spells list', () => {
  it('sorts titles the Spanish way and shows kind and purpose', async () => {
    stub({ language: 'es', pack: { content: { 'spellkind.protection.name': 'Protección' } } });
    mount();
    await screen.findByText('Agua');
    const titles = screen.getAllByRole('link').map(a => a.textContent).filter(x => /Agua|Ámbar|Cobre/.test(x));
    expect(titles.map(x => x.match(/Agua|Ámbar ward|Cobre/)[0])).toEqual(['Agua', 'Ámbar ward', 'Cobre']);
    const row = screen.getByText('Agua').closest('li');
    expect(await within(row).findByText('Protección')).toBeInTheDocument();
    expect(within(row).getByText('Clear the air.')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/spells/1');
  });
  it('writes the kind filter to the URL and reloads', async () => {
    stub({ list: p => (p.get('kind') === '2' ? [spells[0]] : spells) });
    mount();
    await screen.findByText('Agua');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Kind' }), '2');
    await vi.waitFor(() => expect(router.state.location.search).toBe('?kind=2'));
    await vi.waitFor(() => expect(screen.queryByText('Agua')).not.toBeInTheDocument());
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/spells?kind=2');
  });
  it('treats an unknown kind as All', async () => {
    stub(); mount('/spells?kind=99');
    await screen.findByText('Agua');
    await vi.waitFor(() => expect(router.state.location.search).toBe(''));
  });
  it('treats an unknown tradition as All', async () => {
    stub(); mount('/spells?tradition=99');
    await screen.findByText('Agua');
    await vi.waitFor(() => expect(router.state.location.search).toBe(''));
  });
  it('searches after a pause', async () => {
    stub(); mount();
    await screen.findByText('Agua');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'moon' } });
    await vi.waitFor(() => expect(router.state.location.search).toBe('?q=moon'));
  });
  it('says the book is empty and offers to add a spell', async () => {
    stub({ list: () => [] }); mount();
    expect(await screen.findByText('Your Book of Spells is empty. Write your first spell.')).toBeInTheDocument();
    const adds = screen.getAllByRole('link', { name: /Add a spell/ });
    expect(adds).toHaveLength(2);
    expect(adds[1]).toHaveAttribute('href', '/spells/new');
  });
  it('says nothing matches when a filter finds nothing', async () => {
    stub({ list: p => (p.get('q') ? [] : spells) }); mount('/spells?q=zzz');
    expect(await screen.findByText('No spells match.')).toBeInTheDocument();
  });
});

describe('Spell page', () => {
  it('shows linked lines as links, hidden ones as plain text, and numbered steps', async () => {
    stub(); mount('/spells/5');
    expect(await screen.findByRole('heading', { name: 'Moon jar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Salt' })).toHaveAttribute('href', '/correspondences/9');
    expect(screen.getByText(/Hidden herb/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Hidden herb/ })).not.toBeInTheDocument();
    const steps = screen.getAllByRole('listitem').filter(li => li.closest('ol'));
    expect(steps.map(li => li.textContent)).toEqual(['Light the candle', 'Say the words', 'Blow it out']);
    expect(screen.getByText('Second para.')).toBeInTheDocument();
    expect(screen.getByText('My gran')).toBeInTheDocument();
    expect(screen.getByText('Wiccan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/spells/5/edit');
  });
  it('keeps the typed ingredient name as the link text, in any language', async () => {
    const one = { ...spell, ingredients: [{ name: 'sea salt', amount: '1 pinch', correspondence_id: 9, link: { id: 9, name: 'Salt', starter_key: 'corr.herbs.salt', is_starter: 1 } }] };
    stub({ one, language: 'es', pack: { content: { 'corr.herbs.salt.name': 'Sal' } } });
    mount('/spells/5');
    const link = await screen.findByRole('link', { name: 'sea salt' });
    expect(link).toHaveAttribute('href', '/correspondences/9');
    expect(screen.queryByRole('link', { name: 'Sal' })).not.toBeInTheDocument();
  });
  it('shows timing labels and feast days in English', async () => {
    stub(); mount('/spells/5');
    expect(await screen.findByText('Full moon')).toBeInTheDocument();
    expect(screen.getByText('Friday')).toBeInTheDocument();
    expect(screen.getByText('Yule').closest('li')).toHaveTextContent('Yule, December 21');
  });
  it('shows timing labels from the Spanish pack', async () => {
    stub({ language: 'es', pack: { ui: { 'timing.moon.full': 'Luna llena', 'timing.day.fri': 'Viernes' } } });
    mount('/spells/5');
    expect(await screen.findByText('Luna llena')).toBeInTheDocument();
    expect(screen.getByText('Viernes')).toBeInTheDocument();
  });
  it('lists feasts by the name shown, the Spanish way', async () => {
    // In server order (by stored name): Alpha, Nube, Oso, Ñu.
    const feasts = [
      { id: 31, name: 'Alpha', starter_key: 'corr.sabbats-feasts.alpha', is_starter: 1, feast_day: null },
      { id: 32, name: 'Nube', starter_key: null, is_starter: 0, feast_day: null },
      { id: 33, name: 'Oso', starter_key: null, is_starter: 0, feast_day: null },
      { id: 34, name: 'Ñu', starter_key: null, is_starter: 0, feast_day: null },
    ];
    stub({ one: { ...spell, feasts }, language: 'es', pack: { content: { 'corr.sabbats-feasts.alpha.name': 'Zarza' } } });
    mount('/spells/5');
    await screen.findByRole('link', { name: 'Zarza' });
    const names = screen.getAllByRole('link').filter(a => /^\/correspondences\/3[1-4]$/.test(a.getAttribute('href'))).map(a => a.textContent);
    expect(names).toEqual(['Nube', 'Ñu', 'Oso', 'Zarza']);
  });
  it('deletes after confirming, goes to the list and offers Undo', async () => {
    stub(); mount('/spells/5');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Delete Moon jar?')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells'));
    expect(await screen.findByText('Moon jar is in the Trash.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
  });
});

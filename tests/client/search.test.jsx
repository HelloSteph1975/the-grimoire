import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { SearchBox } from '../../client/src/components/SearchBox.jsx';
import { Search } from '../../client/src/screens/search/Search.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const empty = { total: 0, items: [] };
const RESULT = {
  q: 'owl',
  groups: {
    spells: { total: 3, items: [{ id: 1, title: 'Owl charm', purpose: 'For night sight' }] },
    correspondences: {
      total: 1,
      items: [{ id: 5, name: 'Owl feather', summary: 'Wisdom', category_id: 2, is_starter: 0, starter_key: null }],
    },
    rituals: { total: 2, items: [{ id: 7, title: 'Owl night', date: '2026-10-16', status: 'done' }, { id: 8, title: 'Owl rest', date: '2026-10-17', status: 'planned' }] },
    journal: {
      total: 1,
      items: [{ id: 9, date: '2026-10-15', time: null, title: '', excerpt: '', kind_id: 1 }],
    },
    dates: { total: 1, items: [{ id: 3, title: 'Owl day', date: '2026-11-01', yearly: 1 }] },
  },
};
let result = RESULT;
let calls;
function stub({ failLookups = false } = {}) {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async url => {
    calls.push(url);
    if (failLookups && (url === '/api/categories' || url === '/api/journal-kinds')) return json({ error: 'Nope', code: 'server_error' }, 500);
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book', time_zone: 'UTC' });
    if (url === '/api/categories') return json([{ id: 2, name: 'Animals', is_starter: 0, starter_key: null, icon: 'paw' }]);
    if (url === '/api/journal-kinds') return json([{ id: 1, name: 'Dream', is_starter: 0, starter_key: null }]);
    if (url.startsWith('/api/search?')) return json(result);
    return json([]);
  }));
}
let router;
function mount(path) {
  const page = <SettingsProvider><SearchBox /><Search /></SettingsProvider>;
  router = createMemoryRouter([{ path: '/search', element: page }, { path: '/', element: <SettingsProvider><SearchBox /></SettingsProvider> }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
afterEach(() => { vi.unstubAllGlobals(); result = RESULT; });

describe('SearchBox', () => {
  it('limits the words to 200 characters', () => {
    stub(); mount('/');
    expect(screen.getByRole('searchbox', { name: 'Search the book' })).toHaveAttribute('maxlength', '200');
  });
  it('goes to /search with the trimmed words', async () => {
    stub(); mount('/');
    const box = screen.getByRole('searchbox', { name: 'Search the book' });
    await userEvent.type(box, '  moon water  {Enter}');
    expect(router.state.location.pathname).toBe('/search');
    expect(router.state.location.search).toBe('?q=moon%20water');
  });
  it('shows the page words and keeps one history entry when Enter is pressed twice', async () => {
    stub(); mount('/');
    const box = screen.getByRole('searchbox', { name: 'Search the book' });
    await userEvent.type(box, 'owl{Enter}{Enter}');
    expect(box).toHaveValue('owl');
    await userEvent.clear(box);
    await userEvent.type(box, 'owls{Enter}{Enter}');
    expect(router.state.location.search).toBe('?q=owls');
    await router.navigate(-1);
    expect(router.state.location.pathname).toBe('/');
  });
  it('shows the q of the page it is on', async () => {
    stub(); mount('/search?q=raven');
    expect(screen.getByRole('searchbox', { name: 'Search the book' })).toHaveValue('raven');
  });
  it('does nothing for empty words', async () => {
    stub(); mount('/');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search the book' }), '   {Enter}');
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('Search page', () => {
  it('asks for two letters without a request', async () => {
    stub(); mount('/search?q=o');
    expect(await screen.findByText('Type at least two letters to search.')).toBeInTheDocument();
    expect(calls.some(u => u.startsWith('/api/search'))).toBe(false);
  });
  it('shows the groups in order with counts and links', async () => {
    stub(); mount('/search?q=owl');
    await screen.findByRole('heading', { name: /Spells/ });
    const names = screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent);
    expect(names).toEqual(['Spells 3 found', 'Correspondences 1 found', 'Rituals 2 found', 'Journal 1 found', 'Dates 1 found']);
    expect(screen.getByRole('link', { name: /Owl charm/ })).toHaveAttribute('href', '/spells/1');
    const feather = screen.getByRole('link', { name: /Owl feather/ });
    expect(feather).toHaveAttribute('href', '/correspondences/5');
    expect(feather).toHaveTextContent('Animals');
    expect(feather).toHaveTextContent('Wisdom');
    expect(screen.getByRole('link', { name: /Owl night/ })).toHaveTextContent('Done');
    expect(screen.getByRole('link', { name: /Owl night/ })).toHaveAttribute('href', '/rituals/7');
    const j = screen.getByRole('link', { name: /An entry with cards/ });
    expect(j).toHaveAttribute('href', '/journal/9');
    expect(j).toHaveTextContent('Dream');
    expect(screen.getByRole('link', { name: /Owl day/ })).toHaveAttribute('href', '/calendar/dates/3');
  });
  it('leaves out empty groups', async () => {
    result = { q: 'owl', groups: { spells: RESULT.groups.spells, correspondences: empty, rituals: empty, journal: empty, dates: empty } };
    stub(); mount('/search?q=owl');
    await screen.findByRole('heading', { name: /Spells/ });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });
  it('shows See all only when there are more, and only for spells, correspondences and journal', async () => {
    result = {
      q: 'owl',
      groups: { ...RESULT.groups,
        correspondences: { total: 25, items: Array.from({ length: 20 }, (_, i) => ({ id: i + 10, name: `Owl ${i}`, summary: '', category_id: 2 })) },
        rituals: { total: 60, items: [{ id: 7, title: 'Owl night', date: '2026-10-16', status: 'done' }] },
        dates: { total: 60, items: [{ id: 3, title: 'Owl day', date: '2026-11-01' }] } },
    };
    stub(); mount('/search?q=owl');
    await screen.findByRole('heading', { name: /Spells/ });
    expect(screen.getByRole('link', { name: 'See all 3' })).toHaveAttribute('href', '/spells?q=owl');
    expect(screen.getByRole('link', { name: 'See all 25' })).toHaveAttribute('href', '/correspondences?q=owl');
    expect(screen.getAllByRole('link', { name: /See all/ })).toHaveLength(2);
    expect(within(screen.getByRole('region', { name: /Journal/ })).queryByText(/See all/)).toBeNull();
  });
  it('says nothing matches', async () => {
    result = { q: 'zzz', groups: { spells: empty, correspondences: empty, rituals: empty, journal: empty, dates: empty } };
    stub(); mount('/search?q=zzz');
    expect(await screen.findByText('Nothing in the book matches "zzz".')).toBeInTheDocument();
  });
  it('still shows results when the category and kind lookups fail', async () => {
    stub({ failLookups: true }); mount('/search?q=owl');
    expect(await screen.findByRole('link', { name: /Owl feather/ })).toHaveAttribute('href', '/correspondences/5');
    expect(screen.getByRole('link', { name: /An entry with cards/ }).getAttribute('href')).toBe('/journal/9');
    expect(screen.queryByRole('button', { name: /try again|retry/i })).toBeNull();
  });
  it('uses the singular count', async () => {
    result = { q: 'owl', groups: { ...RESULT.groups, spells: { total: 1, items: [RESULT.groups.spells.items[0]] } } };
    stub(); mount('/search?q=owl');
    expect(await screen.findByRole('heading', { name: 'Spells 1 found' })).toBeInTheDocument();
  });
});

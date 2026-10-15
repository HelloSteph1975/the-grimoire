import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Correspondences } from '../../client/src/screens/correspondences/Correspondences.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const categories = [
  { id: 1, name: 'Days', icon: 'calendar-days', is_starter: 1, starter_key: 'category.days', version: 1 },
  { id: 2, name: 'Colors', icon: 'palette', is_starter: 1, starter_key: 'category.colors', version: 1 },
  { id: 3, name: 'Crystals', icon: 'gem', is_starter: 0, starter_key: null, version: 1 },
];
const traditions = [
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
];
const entries = [
  { id: 10, category_id: 2, name: 'Red', summary: 'Courage and heat.', is_starter: 1, starter_key: 'corr.colors.red', version: 1 },
  { id: 11, category_id: 1, name: 'Monday', summary: 'The moon day.', is_starter: 0, starter_key: null, version: 2 },
];

function stub({ language = 'en', pack = {}, list = () => entries } = {}) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/settings') return json({ language, theme: 'old-book' });
    if (url === '/api/categories') return json(categories);
    if (url === '/api/traditions') return json(traditions);
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? (pack.ui ?? {}) : (pack.content ?? {}));
    if (url.startsWith('/api/correspondences?')) return json(list(new URLSearchParams(url.split('?')[1])));
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path = '/correspondences') {
  router = createMemoryRouter([{
    path: '/correspondences',
    element: <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider><Correspondences /></LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>,
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const listCalls = () => fetch.mock.calls.map(([u]) => u).filter(u => u.startsWith('/api/correspondences?'));
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Correspondences list', () => {
  it('shows the tabs in order with All first', async () => {
    stub(); mount();
    const tabs = within(await screen.findByRole('tablist')).getAllByRole('tab');
    await vi.waitFor(() => expect(tabs.length).toBe(4));
    expect(within(screen.getByRole('tablist')).getAllByRole('tab').map(t => t.textContent)).toEqual(['All', 'Days', 'Colors', 'Crystals']);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Correspondences' })).toBeInTheDocument();
    expect(screen.getByText('Add an entry')).toBeInTheDocument();
  });
  it('lists entries with their category, summary and Starter tag, linking to the entry page', async () => {
    stub(); mount();
    const row = (await screen.findByText('Red')).closest('li');
    expect(within(row).getByText('Colors')).toBeInTheDocument();
    expect(within(row).getByText('Courage and heat.')).toBeInTheDocument();
    expect(within(row).getByText('Starter')).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/correspondences/10');
    expect(within(screen.getByText('Monday').closest('li')).queryByText('Starter')).not.toBeInTheDocument();
  });
  it('filters by category with the tabs, in the URL and the request', async () => {
    stub(); mount();
    await screen.findByText('Red');
    await userEvent.click(await screen.findByRole('tab', { name: 'Colors' }));
    expect(router.state.location.search).toBe('?category=2');
    await vi.waitFor(() => expect(listCalls().at(-1)).toContain('category=2'));
    expect(screen.getByRole('tab', { name: 'Colors' })).toHaveAttribute('aria-selected', 'true');
  });
  it('filters by tradition', async () => {
    stub(); mount();
    await screen.findByText('Red');
    const select = screen.getByRole('combobox', { name: 'Traditions' });
    await vi.waitFor(() => expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['All traditions', 'Wiccan', 'Eclectic']));
    await userEvent.selectOptions(select, '1');
    expect(router.state.location.search).toBe('?tradition=1');
    await vi.waitFor(() => expect(listCalls().at(-1)).toContain('tradition=1'));
  });
  it('searches 250 ms after the last key', async () => {
    stub(); mount();
    await screen.findByText('Red');
    vi.useFakeTimers();
    const box = screen.getByRole('searchbox', { name: 'Search correspondences' });
    fireEvent.change(box, { target: { value: 'mo' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    fireEvent.change(box, { target: { value: 'moon' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(listCalls().some(u => u.includes('q='))).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(60); });
    expect(router.state.location.search).toBe('?q=moon');
    expect(listCalls().filter(u => u.includes('q='))).toEqual(['/api/correspondences?q=moon']);
  });
  it('says nothing matches when a filter finds nothing', async () => {
    stub({ list: p => (p.get('q') ? [] : entries) }); mount('/correspondences?q=zzz');
    expect(await screen.findByText('No entries match.')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('zzz');
  });
  it('says the book is empty when there are no entries at all', async () => {
    stub({ list: () => [] }); mount();
    expect(await screen.findByText('Nothing here yet.')).toBeInTheDocument();
  });
  it('shows translated starter names with a Spanish pack', async () => {
    stub({ language: 'es', pack: { ui: { 'corr.all': 'Todo' }, content: { 'corr.colors.red.name': 'Rojo', 'corr.colors.red.summary': 'Valor.', 'category.colors.name': 'Colores' } } });
    mount();
    const row = (await screen.findByText('Rojo')).closest('li');
    expect(within(row).getByText('Valor.')).toBeInTheDocument();
    expect(within(row).getByText('Colores')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Todo' })).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
  });
});

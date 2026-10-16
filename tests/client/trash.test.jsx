import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { Trash } from '../../client/src/screens/Trash.jsx';

let items;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function stub() {
  items = [
    { type: 'tradition', id: 4, title: 'Old path', deleted_at: '2026-10-14T10:00:00.000Z' },
    { type: 'tradition', id: 5, title: 'Other', deleted_at: '2026-10-13T10:00:00.000Z' },
    { type: 'category', id: 6, title: 'Runes', deleted_at: '2026-10-12T10:00:00.000Z', extra: 3, earlier: 1 },
    { type: 'correspondence', id: 7, title: 'Thurisaz', deleted_at: '2026-10-11T10:00:00.000Z', categoryInTrash: true },
    { type: 'category', id: 8, title: 'Empty one', deleted_at: '2026-10-10T10:00:00.000Z', extra: 0, earlier: 0 },
    { type: 'kind', id: 9, title: 'Ritual', deleted_at: '2026-10-09T10:00:00.000Z' },
    { type: 'spell', id: 10, title: 'Moon bath', deleted_at: '2026-10-08T10:00:00.000Z' },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    if (url === '/api/trash' && m === 'GET') return json(items);
    if (url === '/api/trash/empty') { const n = items.length; items = []; return json({ removed: n, backup: 'pre-empty-x.db' }); }
    const [, , , type, id] = url.split('/');
    items = items.filter(i => !(i.type === type && i.id === Number(id)));
    return json(m === 'DELETE' ? { ok: true } : { id: Number(id) });
  }));
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ToastProvider><ConfirmProvider><Trash /></ConfirmProvider></ToastProvider> }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('Trash', () => {
  it('lists deleted records with their kind', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    expect(within(row).getByText('Tradition')).toBeInTheDocument();
  });
  it('labels spells and spell kinds', async () => {
    stub(); mount();
    expect(within((await screen.findByText('Ritual')).closest('li')).getByText('Spell kind')).toBeInTheDocument();
    expect(within(screen.getByText('Moon bath').closest('li')).getByText('Spell')).toBeInTheDocument();
  });
  it('says how many entries went with a category', async () => {
    stub(); mount();
    const row = (await screen.findByText('Runes')).closest('li');
    expect(within(row).getByText('Category')).toBeInTheDocument();
    expect(within(row).getByText('3 entries went with it')).toBeInTheDocument();
    expect(within(row).getByText('1 entry was put in the Trash earlier')).toBeInTheDocument();
    expect(within((await screen.findByText('Old path')).closest('li')).queryByText(/went with it/)).not.toBeInTheDocument();
  });
  it('shows only the counts a category has, in the singular for one', async () => {
    stub();
    Object.assign(items[2], { extra: 1, earlier: 0 });
    Object.assign(items[4], { extra: 0, earlier: 2 });
    mount();
    const runes = (await screen.findByText('Runes')).closest('li');
    expect(within(runes).getByText('1 entry went with it')).toBeInTheDocument();
    expect(within(runes).queryByText(/earlier/)).not.toBeInTheDocument();
    const other = screen.getByText('Empty one').closest('li');
    expect(within(other).getByText('2 entries were put in the Trash earlier')).toBeInTheDocument();
    expect(within(other).queryByText(/went with it/)).not.toBeInTheDocument();
  });
  it('notes an entry whose category is in the Trash', async () => {
    stub(); mount();
    const row = (await screen.findByText('Thurisaz')).closest('li');
    expect(within(row).getByText('Entry')).toBeInTheDocument();
    expect(within(row).getByText('Its category is in the Trash')).toBeInTheDocument();
  });
  it('says which entries a category takes with it before deleting it forever', async () => {
    stub(); mount();
    await userEvent.click(within((await screen.findByText('Runes')).closest('li')).getByText('Delete forever'));
    expect(await screen.findByText("The 3 entries that went to the Trash with it will also be deleted forever. One entry from this category that you put in the Trash earlier will also be deleted forever. This can't be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    await userEvent.click(within(screen.getByText('Empty one').closest('li')).getByText('Delete forever'));
    expect(await screen.findByText("This can't be undone.")).toBeInTheDocument();
  });
  it('names only the entries a category has when deleting it forever', async () => {
    stub();
    Object.assign(items[2], { extra: 1, earlier: 0 });
    mount();
    await userEvent.click(within((await screen.findByText('Runes')).closest('li')).getByText('Delete forever'));
    expect(await screen.findByText("The entry that went to the Trash with it will also be deleted forever. This can't be undone.")).toBeInTheDocument();
  });
  it('restores one', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    await userEvent.click(within(row).getByText('Restore'));
    expect(await screen.findByText('Restored Old path.')).toBeInTheDocument();
    expect(screen.queryByText('Old path', { selector: 'strong' })).not.toBeInTheDocument();
  });
  it('shows a starter row under its translated name, in the row, the confirmation and the toast', async () => {
    stub();
    items.unshift({ type: 'tradition', id: 1, title: 'Wiccan', starter_key: 'tradition.wiccan', deleted_at: '2026-10-15T10:00:00.000Z' });
    const plain = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      if (url === '/api/settings') return json({ language: 'es', theme: 'old-book' });
      if (url === '/api/locales/es/ui') return json({});
      if (url === '/api/locales/es/content') return json({ 'tradition.wiccan.name': 'Wicca' });
      return plain(url, opts);
    }));
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <SettingsProvider><ToastProvider><ConfirmProvider><Trash /></ConfirmProvider></ToastProvider></SettingsProvider> }])} />);
    const row = (await screen.findByText('Wicca')).closest('li');
    expect(screen.queryByText('Wiccan')).not.toBeInTheDocument();
    await userEvent.click(within(row).getByText('Delete forever'));
    expect(await screen.findByText('Delete Wicca forever?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    await userEvent.click(within(row).getByText('Restore'));
    expect(await screen.findByText('Restored Wicca.')).toBeInTheDocument();
  });
  it('asks before deleting forever', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    await userEvent.click(within(row).getByText('Delete forever'));
    expect(await screen.findByText('Delete Old path forever?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
  });
  it('empties the Trash after confirming', async () => {
    stub(); mount();
    await userEvent.click(await screen.findByText('Empty the Trash'));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Empty the Trash' }));
    expect(await screen.findByText('The Trash is empty.')).toBeInTheDocument();
  });
});

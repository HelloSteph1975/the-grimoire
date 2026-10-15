import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
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
    expect(await screen.findByText("This also deletes forever the 3 entries that went to the Trash with it. It also deletes forever 1 entry of it you put in the Trash earlier. This can't be undone.")).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    await userEvent.click(within(screen.getByText('Empty one').closest('li')).getByText('Delete forever'));
    expect(await screen.findByText("This can't be undone.")).toBeInTheDocument();
  });
  it('names only the entries a category has when deleting it forever', async () => {
    stub();
    Object.assign(items[2], { extra: 1, earlier: 0 });
    mount();
    await userEvent.click(within((await screen.findByText('Runes')).closest('li')).getByText('Delete forever'));
    expect(await screen.findByText("This also deletes forever the 1 entry that went to the Trash with it. This can't be undone.")).toBeInTheDocument();
  });
  it('restores one', async () => {
    stub(); mount();
    const row = (await screen.findByText('Old path')).closest('li');
    await userEvent.click(within(row).getByText('Restore'));
    expect(await screen.findByText('Restored Old path.')).toBeInTheDocument();
    expect(screen.queryByText('Old path', { selector: 'strong' })).not.toBeInTheDocument();
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

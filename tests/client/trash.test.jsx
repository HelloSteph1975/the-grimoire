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
    { type: 'category', id: 6, title: 'Runes', deleted_at: '2026-10-12T10:00:00.000Z', extra: 3 },
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
    expect(within(row).getByText('Entries in the Trash with it: 3')).toBeInTheDocument();
    expect(within((await screen.findByText('Old path')).closest('li')).queryByText(/Entries in the Trash/)).not.toBeInTheDocument();
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

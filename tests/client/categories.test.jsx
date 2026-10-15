import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Categories } from '../../client/src/screens/settings/Categories.jsx';

let rows;
let usage;
let usageFails;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function server() {
  usage = 3; usageFails = false;
  rows = [
    { id: 1, name: 'Crystals', icon: 'gem', version: 1, is_starter: 1, starter_key: 'category.crystals' },
    { id: 2, name: 'Colors', icon: 'palette', version: 1, is_starter: 1, starter_key: 'category.colors' },
  ];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url === '/api/categories' && m === 'GET') return json(rows);
    if (url === '/api/categories' && m === 'POST') { const r = { id: 3, version: 1, is_starter: 0, ...body }; rows.push(r); return json(r, 201); }
    if (url === '/api/categories/reorder' && m === 'POST') {
      rows = body.items.map(it => rows.find(r => r.id === it.id));
      return json(rows);
    }
    const id = Number(url.split('/')[3]);
    if (url.endsWith('/usage')) return usageFails ? json({ error: 'nope', code: 'server' }, 500) : json({ entries: usage });
    if (url.endsWith('/restore')) return json({ ok: true });
    if (m === 'PATCH') {
      const r = rows.find(x => x.id === id);
      if (body.version !== r.version) return json({ error: 'changed', current: r }, 409);
      Object.assign(r, body, { version: r.version + 1, is_starter: 0 });
      return json(r);
    }
    if (m === 'DELETE') { rows = rows.filter(x => x.id !== id); return json({ ok: true }); }
    return json({}, 404);
  }));
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ToastProvider><ConfirmProvider><LeaveGuardProvider><Categories /></LeaveGuardProvider></ConfirmProvider></ToastProvider> }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('Categories', () => {
  it('lists categories in order with the Starter tag', async () => {
    server(); mount();
    const first = (await screen.findByText('Crystals')).closest('li');
    expect(within(first).getByText('Starter')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')[1]).toHaveTextContent('Colors');
  });
  it('reorders with the move buttons', async () => {
    server(); mount();
    await screen.findByText('Crystals');
    await userEvent.click(screen.getByRole('button', { name: 'Move Crystals down' }));
    const post = fetch.mock.calls.find(([u]) => u === '/api/categories/reorder');
    expect(JSON.parse(post[1].body).items).toEqual([{ id: 2, version: 1 }, { id: 1, version: 1 }]);
    await vi.waitFor(() => expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Colors'));
  });
  it('adds a category with an icon', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a category'));
    await userEvent.type(screen.getByLabelText('Name'), 'Candles');
    expect(screen.getByRole('group', { name: 'Icon' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    await userEvent.click(screen.getByRole('radio', { name: 'Flame' }));
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Candles')).toBeInTheDocument();
    const post = fetch.mock.calls.find(([u, o]) => u === '/api/categories' && o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ name: 'Candles', icon: 'flame' });
  });
  it('picks an icon with the keyboard', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a category'));
    screen.getByRole('radio', { name: 'Star' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Book' })).toBeChecked();
  });
  it('edits a category and sends its version', async () => {
    server(); mount();
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    expect(screen.getByRole('radio', { name: 'Gem' })).toBeChecked();
    const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'Moon' }));
    await userEvent.click(save);
    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toMatchObject({ version: 1, icon: 'moon' });
  });
  it('shows the conflict dialog on a stale save', async () => {
    server(); mount();
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    rows[0].version = 2;
    await userEvent.click(screen.getByRole('radio', { name: 'Moon' }));
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('This was changed somewhere else')).toBeInTheDocument();
  });
  it('asks before discarding edits', async () => {
    server(); mount();
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    await userEvent.click(screen.getByRole('radio', { name: 'Moon' }));
    await userEvent.click(screen.getAllByText('Cancel')[0]);
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  });
  it('says "entry" when the category holds one', async () => {
    server(); usage = 1; mount();
    await userEvent.click(within((await screen.findByText('Crystals')).closest('li')).getByText('Delete'));
    expect(await screen.findByText('Move Crystals and its 1 entry to the Trash?')).toBeInTheDocument();
  });
  it('warns about entries before deleting, then offers Undo', async () => {
    server(); mount();
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    expect(await screen.findByText('Move Crystals and its 3 entries to the Trash?')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(await screen.findByText('Moved Crystals to the Trash.')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });
  it('uses the short question when nothing is inside', async () => {
    server(); mount();
    usage = 0;
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    expect(await screen.findByText('Move Crystals to the Trash?')).toBeInTheDocument();
  });
  it('sends nothing when the delete is canceled', async () => {
    server(); mount();
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    await screen.findByText('Move Crystals and its 3 entries to the Trash?');
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Cancel'));
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
  });
  it('shows the error and deletes nothing when the usage check fails', async () => {
    server(); mount();
    usageFails = true;
    const item = (await screen.findByText('Crystals')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    await vi.waitFor(() => expect(fetch.mock.calls.some(([u]) => u.endsWith('/usage'))).toBe(true));
    expect(await screen.findByText(/went wrong|Can't reach|nope/i)).toBeInTheDocument();
    expect(fetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { JournalKinds } from '../../client/src/screens/settings/JournalKinds.jsx';
import { I18nProvider } from '../../client/src/i18n/I18nProvider.jsx';

let rows;
let usage = 0;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const NAMES = ['Dream', 'Tarot', 'Note'];
function server() {
  usage = 0;
  rows = NAMES.map((name, i) => ({ id: i + 1, name, version: 1, is_starter: 0, starter_key: null, sort_order: (i + 1) * 10 }));
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url.startsWith('/api/locales/')) return json({});
    if (url.endsWith('/usage')) return json({ entries: usage });
    if (url === '/api/journal-kinds' && m === 'GET') return json(rows);
    if (url === '/api/journal-kinds' && m === 'POST') {
      const r = { id: 9, version: 1, is_starter: 0, starter_key: null, sort_order: 100, ...body };
      rows = [...rows, r];
      return json(r, 201);
    }
    if (url === '/api/journal-kinds/reorder' && m === 'POST') {
      rows = body.items.map((it, i) => ({ ...rows.find(r => r.id === it.id), sort_order: (i + 1) * 10 }));
      return json(rows);
    }
    const id = Number(url.split('/')[3]);
    if (url.endsWith('/restore')) return json({ id });
    if (m === 'PATCH') {
      const r = rows.find(x => x.id === id);
      Object.assign(r, body, { version: r.version + 1 });
      return json(r);
    }
    if (m === 'DELETE') { rows = rows.filter(x => x.id !== id); return json({ ok: true }); }
    return json({}, 404);
  }));
}
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: (
  <I18nProvider language="en"><ToastProvider><ConfirmProvider><LeaveGuardProvider><JournalKinds /></LeaveGuardProvider></ConfirmProvider></ToastProvider></I18nProvider>
) }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('JournalKinds', () => {
  it('lists the kinds under the journal kinds title', async () => {
    server(); mount();
    await screen.findByText('Dream');
    expect(screen.getByText('Journal kinds')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map(li => li.querySelector('strong').textContent)).toEqual(NAMES);
  });
  it('adds a kind', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a kind'));
    expect(screen.getByText('New journal kind')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 'Omen');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Omen')).toBeInTheDocument();
  });
  it('renames a kind with its version', async () => {
    server(); mount();
    await userEvent.click(within((await screen.findByText('Tarot')).closest('li')).getByText('Edit'));
    expect(screen.getByText('Edit journal kind')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Name'), 's');
    await userEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(fetch.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(true));
    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toMatchObject({ name: 'Tarots', version: 1 });
  });
  it('reorders with the move buttons', async () => {
    server(); mount();
    await screen.findByText('Dream');
    await userEvent.click(screen.getByRole('button', { name: 'Move Dream down' }));
    const post = fetch.mock.calls.find(([u]) => u === '/api/journal-kinds/reorder');
    expect(JSON.parse(post[1].body).items.map(i => i.id)).toEqual([2, 1, 3]);
  });
  it('shows how many entries use a kind', async () => {
    server(); mount();
    usage = 3;
    await userEvent.click(within((await screen.findByText('Tarot')).closest('li')).getByText('Delete'));
    expect(await screen.findByText('Move Tarot to the Trash? 3 entries use it.')).toBeInTheDocument();
  });
  it('says "entry" for one, then offers Undo that restores', async () => {
    server(); mount();
    usage = 1;
    await userEvent.click(within((await screen.findByText('Tarot')).closest('li')).getByText('Delete'));
    expect(await screen.findByText('Move Tarot to the Trash? 1 entry uses it.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(await screen.findByText('Tarot is in the Trash.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Undo'));
    await vi.waitFor(() => expect(fetch.mock.calls.some(([u, o]) => u === '/api/journal-kinds/2/restore' && o?.method === 'POST')).toBe(true));
  });
});

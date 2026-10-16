import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { SpellKinds } from '../../client/src/screens/settings/SpellKinds.jsx';
import { I18nProvider } from '../../client/src/i18n/I18nProvider.jsx';

let rows;
let usage = 0;
let pack = { ui: {}, content: {} };
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const NAMES = ['Spell', 'Ritual', 'Blessing', 'Cleansing', 'Other'];
function server() {
  usage = 0;
  rows = NAMES.map((name, i) => ({ id: i + 1, name, version: 1, is_starter: 1, starter_key: `spell-kind.${name.toLowerCase()}`, sort_order: (i + 1) * 10 }));
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? pack.ui : pack.content);
    if (url.endsWith('/usage')) return json({ spells: usage });
    if (url === '/api/spell-kinds' && m === 'GET') return json(rows);
    if (url === '/api/spell-kinds/reorder' && m === 'POST') {
      rows = body.items.map((it, i) => ({ ...rows.find(r => r.id === it.id), sort_order: (i + 1) * 10 }));
      return json(rows);
    }
    const id = Number(url.split('/')[3]);
    if (m === 'PATCH') {
      const r = rows.find(x => x.id === id);
      if (body.version !== r.version) return json({ error: 'changed', code: 'conflict', current: r }, 409);
      Object.assign(r, body, { version: r.version + 1, is_starter: 0 });
      return json(r);
    }
    if (m === 'DELETE') { rows = rows.filter(x => x.id !== id); return json({ ok: true }); }
    return json({}, 404);
  }));
}
const tree = lang => (
  <I18nProvider language={lang}><ToastProvider><ConfirmProvider><LeaveGuardProvider><SpellKinds /></LeaveGuardProvider></ConfirmProvider></ToastProvider></I18nProvider>
);
const mount = (lang = 'en') => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: tree(lang) }])} />);
afterEach(() => { vi.unstubAllGlobals(); pack = { ui: {}, content: {} }; });

describe('SpellKinds', () => {
  it('lists the five kinds in order', async () => {
    server(); mount();
    await screen.findByText('Spell');
    expect(screen.getAllByRole('listitem').map(li => li.querySelector('strong').textContent)).toEqual(NAMES);
    expect(screen.getByText('Spell kinds')).toBeInTheDocument();
  });
  it('opens Edit prefilled and saves with the version', async () => {
    server(); mount();
    await userEvent.click(within((await screen.findByText('Ritual')).closest('li')).getByText('Edit'));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Ritual');
    await userEvent.type(name, 's');
    await userEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(fetch.mock.calls.some(([, o]) => o?.method === 'PATCH')).toBe(true));
    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toMatchObject({ name: 'Rituals', version: 1 });
  });
  it('shows the conflict dialog on a stale save, and Keep mine saves over it with the newer version', async () => {
    server(); mount();
    await userEvent.click(within((await screen.findByText('Ritual')).closest('li')).getByText('Edit'));
    rows[1] = { ...rows[1], name: 'Rite', version: 2 };
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Moon rite');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('This was changed somewhere else')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Keep mine and save over it'));
    await vi.waitFor(() => expect(fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH')).toHaveLength(2));
    const [first, second] = fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH').map(([, o]) => JSON.parse(o.body));
    expect(first).toMatchObject({ name: 'Moon rite', version: 1 });
    expect(second).toMatchObject({ name: 'Moon rite', version: 2 });
    expect(await screen.findByText('Moon rite')).toBeInTheDocument();
    expect(rows[1]).toMatchObject({ name: 'Moon rite', version: 3 });
  });
  it('reorders with the move buttons', async () => {
    server(); mount();
    await screen.findByText('Spell');
    await userEvent.click(screen.getByRole('button', { name: 'Move Spell down' }));
    const post = fetch.mock.calls.find(([u]) => u === '/api/spell-kinds/reorder');
    expect(JSON.parse(post[1].body).items.map(i => i.id)).toEqual([2, 1, 3, 4, 5]);
  });
  it('shows how many spells use a kind before deleting', async () => {
    server(); mount();
    usage = 3;
    await userEvent.click(within((await screen.findByText('Ritual')).closest('li')).getByText('Delete'));
    expect(await screen.findByText('Delete Ritual? 3 spells use it.')).toBeInTheDocument();
  });
  it('says "spell" when one uses it, and offers Undo after deleting', async () => {
    server(); mount();
    usage = 1;
    await userEvent.click(within((await screen.findByText('Ritual')).closest('li')).getByText('Delete'));
    expect(await screen.findByText('Delete Ritual? 1 spell uses it.')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByText('Delete'));
    expect(await screen.findByText('Ritual is in the Trash.')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });
  it('shows Spanish pack names and prefills the dialog with them', async () => {
    server();
    pack = { ui: {}, content: { 'spell-kind.ritual.name': 'Ritual de luna' } };
    mount('es');
    const item = (await screen.findByText('Ritual de luna')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    expect(screen.getByLabelText('Name')).toHaveValue('Ritual de luna');
  });
});

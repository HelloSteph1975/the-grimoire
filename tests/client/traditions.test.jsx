import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { Traditions } from '../../client/src/screens/settings/Traditions.jsx';

let rows;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function server() {
  rows = [{ id: 1, name: 'Wiccan', description: null, color: '#2f4a3a', version: 1, is_starter: 1, starter_key: 'tradition.wiccan' }];
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url === '/api/traditions' && m === 'GET') return json(rows);
    if (url === '/api/traditions' && m === 'POST') { const r = { id: 2, version: 1, is_starter: 0, ...body }; rows.push(r); return json(r, 201); }
    const id = Number(url.split('/')[3]);
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
const mount = () => render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <ToastProvider><ConfirmProvider><LeaveGuardProvider><Traditions /></LeaveGuardProvider></ConfirmProvider></ToastProvider> }])} />);
afterEach(() => vi.unstubAllGlobals());

describe('Traditions', () => {
  it('lists traditions with the Starter tag', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    expect(within(item).getByText('Starter')).toBeInTheDocument();
  });
  it('adds a tradition', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a tradition'));
    await userEvent.type(screen.getByLabelText('Name'), 'Kitchen witchery');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Kitchen witchery')).toBeInTheDocument();
  });
  it('edits a tradition and sends its version', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    await userEvent.type(screen.getByLabelText('Description'), 'God and Goddess');
    await userEvent.click(screen.getByText('Save'));
    const patch = fetch.mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(JSON.parse(patch[1].body)).toMatchObject({ version: 1, description: 'God and Goddess' });
    expect(await screen.findByText('God and Goddess')).toBeInTheDocument();
  });
  it('shows the conflict dialog on a stale save', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    rows[0].version = 2; rows[0].name = 'Wicca';
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('This was changed somewhere else')).toBeInTheDocument();
  });
  it('deletes to the Trash and offers Undo', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Delete'));
    expect(await screen.findByText('Moved Wiccan to the Trash.')).toBeInTheDocument();
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });
  it('asks before discarding edits, and keeps them if you stay', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    await userEvent.type(screen.getByLabelText('Description'), 'draft');
    await userEvent.click(screen.getAllByText('Cancel')[0]);
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getAllByText('Cancel').at(-1));
    await vi.waitFor(() => expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Description')).toHaveValue('draft');
    await userEvent.click(screen.getAllByText('Cancel')[0]);
    await userEvent.click(await screen.findByText('Leave'));
    await vi.waitFor(() => expect(screen.queryByLabelText('Description')).not.toBeInTheDocument());
  });
  it('keeps Save off until something changes', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    expect(save).toBeEnabled();
  });
  it('turns Save on for a new tradition once it has a name', async () => {
    server(); mount();
    await userEvent.click(await screen.findByText('Add a tradition'));
    const save = within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Name'), 'K');
    expect(save).toBeEnabled();
  });
  it('closes at once when nothing changed', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    await userEvent.click(screen.getByText('Cancel'));
    await vi.waitFor(() => expect(screen.queryByLabelText('Description')).not.toBeInTheDocument());
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
  it('locks the fields while saving, and stays open with edits made during the save', async () => {
    server(); mount();
    const real = fetch.getMockImplementation();
    let release;
    fetch.mockImplementation((url, opts = {}) => (opts.method === 'PATCH'
      ? new Promise(r => { release = () => r(real(url, opts)); })
      : real(url, opts)));
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    const description = screen.getByLabelText('Description');
    await userEvent.type(description, 'first');
    await userEvent.click(screen.getByText('Save'));
    expect(description).toBeDisabled();
    // A change that slips in anyway (fieldset locks only the mouse and keyboard).
    fireEvent.change(description, { target: { value: 'first and second' } });
    await act(async () => release());
    await vi.waitFor(() => expect(description).toBeEnabled());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Description')).toHaveValue('first and second');
  });
  it('saves with the latest version after Reload the latest', async () => {
    server(); mount();
    const item = (await screen.findByText('Wiccan')).closest('li');
    await userEvent.click(within(item).getByText('Edit'));
    rows[0].version = 2; rows[0].name = 'Wicca';
    await userEvent.type(screen.getByLabelText('Description'), 'x');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Reload the latest'));
    await userEvent.type(screen.getByLabelText('Description'), 'y');
    await userEvent.click(screen.getByText('Save'));
    await vi.waitFor(() => expect(screen.queryByLabelText('Description')).not.toBeInTheDocument());
    const patches = fetch.mock.calls.filter(([, o]) => o?.method === 'PATCH').map(([, o]) => JSON.parse(o.body));
    expect(patches.at(-1)).toMatchObject({ version: 2, description: 'y' });
  });
});

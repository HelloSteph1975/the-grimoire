import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { EntryFormRoute } from '../../client/src/screens/correspondences/EntryForm.jsx';
import { EntryPageRoute } from '../../client/src/screens/correspondences/EntryPage.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const categories = [
  { id: 1, name: 'Days', icon: 'calendar-days', is_starter: 1, starter_key: 'category.days', version: 1 },
  { id: 2, name: 'Colors', icon: 'palette', is_starter: 1, starter_key: 'category.colors', version: 1 },
];
const traditions = [
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
];
let rows;
let override;
function stub() {
  rows = {
    10: { id: 10, category_id: 2, name: 'Red', summary: 'Courage.', body: null, keywords: [], feast_day: null, is_starter: 1, starter_key: 'corr.colors.red', version: 1, traditions: [], links: [] },
    11: {
      id: 11, category_id: 1, name: 'Monday', summary: 'The moon day.', body: 'First paragraph.\n\nSecond paragraph.', keywords: ['moon'], feast_day: '02-29',
      is_starter: 0, starter_key: null, version: 2, traditions: [1], links: [{ id: 10, name: 'Red', category_id: 2, is_starter: 1, starter_key: 'corr.colors.red' }],
    },
  };
  override = null;
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const hit = override?.(url, m, body);
    if (hit) return hit;
    if (url === '/api/categories') return json(categories);
    if (url === '/api/traditions') return json(traditions);
    if (url.startsWith('/api/correspondences?')) return json(Object.values(rows));
    const linkRows = ids => ids.map(id => ({ id, name: rows[id].name, category_id: rows[id].category_id, is_starter: rows[id].is_starter, starter_key: rows[id].starter_key }));
    if (url === '/api/correspondences' && m === 'POST') {
      const r = { id: 20, version: 1, is_starter: 0, starter_key: null, ...body, links: linkRows(body.links) };
      rows[20] = r;
      return json(r, 201);
    }
    const [, , , idText, action] = url.split('/');
    const r = rows[Number(idText)];
    if (action === 'restore' && m === 'POST') { r.deleted = false; return json(r); }
    if (!r || r.deleted) return json({ error: 'Not found', code: 'not_found' }, 404);
    if (m === 'GET') return json(r);
    if (m === 'PATCH') {
      if (body.version !== r.version) return json({ error: 'changed', code: 'conflict', current: r }, 409);
      const { version, ...rest } = body;
      Object.assign(r, rest, { version: r.version + 1, links: linkRows(rest.links) });
      return json(r);
    }
    if (m === 'DELETE') { r.deleted = true; return json({ ok: true }); }
    return json({}, 404);
  }));
}
let router;
function mount(path) {
  router = createMemoryRouter([{
    element: <ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider>,
    children: [
      { path: '/correspondences', element: <p>The list</p> },
      { path: '/correspondences/new', element: <EntryFormRoute /> },
      { path: '/correspondences/:id', element: <EntryPageRoute /> },
      { path: '/correspondences/:id/edit', element: <EntryFormRoute /> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const sent = method => fetch.mock.calls.filter(([, o]) => o?.method === method).map(([u, o]) => ({ url: u, body: o.body ? JSON.parse(o.body) : null }));
afterEach(() => vi.unstubAllGlobals());

describe('Entry form', () => {
  it('posts a new entry with every field, then shows its page', async () => {
    stub(); mount('/correspondences/new?category=2');
    expect(await screen.findByRole('heading', { name: 'New entry' })).toBeInTheDocument();
    const category = screen.getByLabelText('Category');
    await vi.waitFor(() => expect(category).toHaveValue('2'));
    await userEvent.type(screen.getByLabelText('Name'), 'Ruby');
    await userEvent.type(screen.getByLabelText('Summary'), 'Deep red.');
    expect(screen.getByText('9 of 200')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Keywords'), 'love{Enter}fire{Enter}');
    await userEvent.selectOptions(screen.getByLabelText('Month'), '12');
    await userEvent.selectOptions(screen.getByLabelText('Day'), '12');
    await userEvent.click(screen.getByLabelText('Wiccan'));
    await userEvent.type(screen.getByLabelText('Find an entry to link'), 'Mon');
    await userEvent.click(await screen.findByRole('button', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Ruby' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/correspondences/20');
    expect(sent('POST')[0]).toEqual({
      url: '/api/correspondences',
      body: { name: 'Ruby', category_id: 2, summary: 'Deep red.', body: '', keywords: ['love', 'fire'], feast_day: '12-12', traditions: [1], links: [11] },
    });
  });
  it('sends no feast day when month and day are None', async () => {
    stub(); mount('/correspondences/new?category=1');
    await userEvent.type(await screen.findByLabelText('Name'), 'Tuesday');
    await vi.waitFor(() => expect(screen.getByLabelText('Category')).toHaveValue('1'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('heading', { name: 'Tuesday' });
    expect(sent('POST')[0].body).toMatchObject({ feast_day: null, keywords: [], traditions: [], links: [] });
  });
  it('edits an entry and sends its version', async () => {
    stub(); mount('/correspondences/11/edit');
    expect(await screen.findByRole('heading', { name: 'Edit entry' })).toBeInTheDocument();
    const name = await screen.findByLabelText('Name');
    await vi.waitFor(() => expect(name).toHaveValue('Monday'));
    expect(screen.getByLabelText('Month')).toHaveValue('02');
    expect(screen.getByLabelText('Day')).toHaveValue('29');
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Summary'), ' Silver.');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/correspondences/11'));
    expect(sent('PATCH')[0]).toEqual({
      url: '/api/correspondences/11',
      body: { version: 2, name: 'Monday', category_id: 1, summary: 'The moon day. Silver.', body: 'First paragraph.\n\nSecond paragraph.', keywords: ['moon'], feast_day: '02-29', traditions: [1], links: [10] },
    });
  });
  it('shows the conflict dialog on a stale save, and Reload the latest loads every field and its version', async () => {
    stub(); mount('/correspondences/11/edit');
    const name = await screen.findByLabelText('Name');
    await vi.waitFor(() => expect(name).toHaveValue('Monday'));
    Object.assign(rows[11], { version: 5, name: 'Moon day', keywords: ['moon', 'silver'], traditions: [2], links: [], feast_day: '12-12' });
    await userEvent.type(screen.getByLabelText('Summary'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Reload the latest'));
    expect(name).toHaveValue('Moon day');
    expect(screen.getByLabelText('Summary')).toHaveValue('The moon day.');
    expect(screen.getByText('silver')).toBeInTheDocument();
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    expect(screen.getByLabelText('Wiccan')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Remove Red' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Month')).toHaveValue('12');
    await userEvent.type(screen.getByLabelText('Summary'), ' y');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/correspondences/11'));
    expect(sent('PATCH').at(-1).body).toMatchObject({ version: 5, name: 'Moon day', summary: 'The moon day. y', traditions: [2], links: [], keywords: ['moon', 'silver'] });
  });
  it('shows translated field errors from a 400', async () => {
    stub(); mount('/correspondences/new?category=1');
    override = (url, m) => (m === 'POST' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { name: 'Too long', feast_day: 'Bad', traditions: 'Not found', links: 'Self' },
      detailCodes: { name: { code: 'too_long', max: 80 }, feast_day: { code: 'bad_format', hint: 'feast_day' }, traditions: { code: 'not_found' }, links: { code: 'self_link' } },
    }, 400) : null);
    await userEvent.type(await screen.findByLabelText('Name'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Keep it to 80 characters or fewer')).toBeInTheDocument();
    expect(screen.getByText('Use a day like 12-12 (month-day)')).toBeInTheDocument();
    for (const label of ['Month', 'Day']) {
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription('Use a day like 12-12 (month-day)');
    }
    expect(screen.getByRole('group', { name: 'Traditions' })).toHaveAccessibleDescription("That isn't here any more. It may have been deleted.");
    expect(screen.getByRole('group', { name: 'Linked entries' })).toHaveAccessibleDescription("An entry can't link to itself.");
    expect(router.state.location.pathname).toBe('/correspondences/new');
  });
  it('asks for a category on a new entry', async () => {
    stub(); mount('/correspondences/new');
    const category = await screen.findByLabelText('Category');
    expect(category).toHaveValue('');
    expect(within(category).getAllByRole('option')[0]).toHaveTextContent('Choose a category');
  });
  it('keeps edits made during the first save, and saves them to the new entry', async () => {
    stub(); mount('/correspondences/new?category=1');
    let release;
    const real = fetch.getMockImplementation();
    fetch.mockImplementation((url, opts = {}) => (opts.method === 'POST' && !release
      ? new Promise(r => { release = () => r(real(url, opts)); })
      : real(url, opts)));
    const name = await screen.findByLabelText('Name');
    await userEvent.type(name, 'Tuesday');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(release).toBeDefined());
    fireEvent.change(name, { target: { value: 'Tuesday!' } });
    await act(async () => { release(); });
    expect(await screen.findByRole('heading', { name: 'Edit entry' })).toBeInTheDocument();
    expect(name).toHaveValue('Tuesday!');
    expect(router.state.location.pathname).toBe('/correspondences/new');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/correspondences/20'));
    expect(sent('PATCH').at(-1)).toMatchObject({ url: '/api/correspondences/20', body: { version: 1, name: 'Tuesday!' } });
    expect(sent('POST')).toHaveLength(1);
  });
  it('asks before leaving with changes', async () => {
    stub(); mount('/correspondences/11/edit');
    const name = await screen.findByLabelText('Name');
    await vi.waitFor(() => expect(name).toHaveValue('Monday'));
    await userEvent.type(name, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/correspondences/11'));
  });
  it('leaves at once when nothing changed', async () => {
    stub(); mount('/correspondences/11/edit');
    await vi.waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue('Monday'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/correspondences/11'));
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});

describe('Entry page', () => {
  it('shows every part of the entry', async () => {
    stub(); mount('/correspondences/11');
    expect(await screen.findByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();
    expect(screen.getByText('The moon day.')).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
    expect(screen.getByText('February 29')).toBeInTheDocument();
    expect(await screen.findByText('Wiccan')).toBeInTheDocument();
    expect(screen.getByText('moon')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Red' })).toHaveAttribute('href', '/correspondences/10');
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/correspondences/11/edit');
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
  });
  it('moves the entry to the Trash after asking, and Undo restores it', async () => {
    stub(); mount('/correspondences/11');
    await screen.findByRole('heading', { name: 'Monday' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move Monday to the Trash?')).toBeInTheDocument();
    expect(within(dialog).getByText('You can restore it from the Trash.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The list')).toBeInTheDocument();
    expect(sent('DELETE')).toEqual([{ url: '/api/correspondences/11', body: null }]);
    expect(screen.getByText('Moved Monday to the Trash.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Undo'));
    await vi.waitFor(() => expect(sent('POST').map(c => c.url)).toEqual(['/api/correspondences/11/restore']));
    expect(await screen.findByRole('heading', { name: 'Monday' })).toBeInTheDocument();
  });
  it('reloads the entry when the delete fails', async () => {
    stub(); mount('/correspondences/11');
    await screen.findByRole('heading', { name: 'Monday' });
    override = (url, m) => (m === 'DELETE' ? json({ error: 'Boom', code: 'server_error' }, 500) : null);
    const gets = () => fetch.mock.calls.filter(([u, o]) => u === '/api/correspondences/11' && (o?.method ?? 'GET') === 'GET').length;
    const before = gets();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument();
    await vi.waitFor(() => expect(gets()).toBe(before + 1));
    expect(router.state.location.pathname).toBe('/correspondences/11');
  });
  it('shows a category load error with Try again, and keeps the entry', async () => {
    stub();
    let fail = true;
    override = url => (url === '/api/categories' && fail ? json({ error: 'Boom', code: 'server_error' }, 500) : null);
    mount('/correspondences/11');
    expect(await screen.findByText('Something went wrong on our side.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monday' })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Days')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong on our side.')).not.toBeInTheDocument();
  });
  it('keeps the entry when the delete is cancelled', async () => {
    stub(); mount('/correspondences/11');
    await screen.findByRole('heading', { name: 'Monday' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(sent('DELETE')).toEqual([]);
  });
  it('says when the entry is gone and links back', async () => {
    stub(); mount('/correspondences/99');
    expect(await screen.findByText("That isn't here any more. It may have been deleted.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to correspondences' })).toHaveAttribute('href', '/correspondences');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { OwnDateFormRoute } from '../../client/src/screens/calendar/OwnDateForm.jsx';
import { OwnDatePageRoute } from '../../client/src/screens/calendar/OwnDatePage.jsx';

const THIS_YEAR = new Date().getFullYear();
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const traditions = [
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
];
let rows;
let override;
let pack = null;
function stub() {
  rows = {
    5: { id: 5, title: 'Grandmother', date: '1950-03-14', yearly: 1, notes: 'She loved roses.\n\nLight a candle.', traditions: [2, 1], version: 3 },
  };
  override = null;
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const hit = override?.(url, m, body);
    if (hit) return hit;
    if (url === '/api/traditions') return json(traditions);
    if (url === '/api/settings') return json({ language: pack ? 'es' : 'en', theme: 'old-book' });
    if (url.startsWith('/api/locales/')) return json(url.endsWith('/ui') ? {} : pack.content);
    if (url === '/api/own-dates' && m === 'POST') {
      const r = { id: 20, version: 1, ...body, yearly: body.yearly ? 1 : 0 };
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
      Object.assign(r, rest, { yearly: rest.yearly ? 1 : 0, version: r.version + 1 });
      return json(r);
    }
    if (m === 'DELETE') { r.deleted = true; return json({ ok: true }); }
    return json({}, 404);
  }));
}
let router;
function mount(path, { settings = false } = {}) {
  const shell = <ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider>;
  router = createMemoryRouter([{
    element: settings ? <SettingsProvider>{shell}</SettingsProvider> : shell,
    children: [
      { path: '/calendar', element: <p>The calendar</p> },
      { path: '/calendar/dates/new', element: <OwnDateFormRoute /> },
      { path: '/calendar/dates/:id', element: <OwnDatePageRoute /> },
      { path: '/calendar/dates/:id/edit', element: <OwnDateFormRoute /> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const sent = method => fetch.mock.calls.filter(([, o]) => o?.method === method).map(([u, o]) => ({ url: u, body: o.body ? JSON.parse(o.body) : null }));
afterEach(() => { vi.unstubAllGlobals(); pack = null; });

describe('Own date form', () => {
  it('adds a date with the day from the link, sends the exact body and opens its page', async () => {
    stub(); mount('/calendar/dates/new?date=2026-10-31');
    expect(await screen.findByRole('heading', { name: 'New date' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Date')).toHaveValue('2026-10-31');
    await userEvent.type(screen.getByLabelText('Title'), 'Ancestor night');
    await userEvent.click(screen.getByLabelText('Repeats every year'));
    await userEvent.click(screen.getByLabelText('Eclectic'));
    await userEvent.type(screen.getByLabelText('Notes'), 'Set a plate.');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('heading', { name: 'Ancestor night' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/calendar/dates/20');
    expect(sent('POST')).toEqual([{
      url: '/api/own-dates',
      body: { title: 'Ancestor night', date: '2026-10-31', yearly: true, notes: 'Set a plate.', traditions: [2] },
    }]);
  });
  it('lists traditions in their sort order', async () => {
    stub(); mount('/calendar/dates/new');
    const group = await screen.findByRole('group', { name: 'Traditions' });
    expect(within(group).getAllByRole('checkbox').map(c => c.closest('label').textContent.trim())).toEqual(['Wiccan', 'Eclectic']);
    expect(screen.getByLabelText('Date')).toHaveValue('');
  });
  it('fills an existing date and Keep mine sends the newer version after a conflict', async () => {
    stub(); mount('/calendar/dates/5/edit');
    expect(await screen.findByRole('heading', { name: 'Edit date' })).toBeInTheDocument();
    const title = await screen.findByLabelText('Title');
    await vi.waitFor(() => expect(title).toHaveValue('Grandmother'));
    expect(screen.getByLabelText('Date')).toHaveValue('1950-03-14');
    expect(screen.getByLabelText('Repeats every year')).toBeChecked();
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    rows[5].version = 9;
    await userEvent.type(title, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Keep mine and save over it'));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar/dates/5'));
    expect(sent('PATCH').map(c => c.body.version)).toEqual([3, 9]);
    expect(sent('PATCH')[1].body).toEqual({ title: 'Grandmother!', date: '1950-03-14', yearly: true, notes: 'She loved roses.\n\nLight a candle.', traditions: [2, 1], version: 9 });
  });
  it('Reload the latest takes the newer date and saves with its version', async () => {
    stub(); mount('/calendar/dates/5/edit');
    const title = await screen.findByLabelText('Title');
    await vi.waitFor(() => expect(title).toHaveValue('Grandmother'));
    Object.assign(rows[5], { version: 6, title: 'Nana', yearly: 0 });
    await userEvent.type(title, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Reload the latest'));
    expect(title).toHaveValue('Nana');
    expect(screen.getByLabelText('Repeats every year')).not.toBeChecked();
    await userEvent.type(title, '?');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar/dates/5'));
    expect(sent('PATCH').at(-1).body).toMatchObject({ title: 'Nana?', yearly: false, version: 6 });
  });
  it('asks before leaving with changes', async () => {
    stub(); mount('/calendar/dates/5/edit');
    const title = await screen.findByLabelText('Title');
    await vi.waitFor(() => expect(title).toHaveValue('Grandmother'));
    await userEvent.type(title, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/calendar/dates/5'));
  });
  it('Cancel on a new date from a day goes back to that day on the calendar', async () => {
    stub(); mount('/calendar/dates/new?date=2026-10-31');
    await screen.findByLabelText('Title');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/calendar?month=2026-10&day=2026-10-31'));
  });
  it('Cancel on a new date without a day goes to the calendar', async () => {
    stub(); mount('/calendar/dates/new');
    await screen.findByLabelText('Title');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname + router.state.location.search).toBe('/calendar'));
  });
  it('shows the field errors from a 400', async () => {
    stub(); mount('/calendar/dates/new?date=2026-10-31');
    override = (url, m) => (m === 'POST' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { date: 'Bad', traditions: 'Not found' },
      detailCodes: { date: { code: 'bad_format', hint: 'date' }, traditions: { code: 'not_found' } },
    }, 400) : null);
    await userEvent.type(await screen.findByLabelText('Title'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Pick a real date from 1900 to 2100')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Traditions' })).toHaveAccessibleDescription("That isn't here any more. It may have been deleted.");
    expect(router.state.location.pathname).toBe('/calendar/dates/new');
  });
});

describe('Own date page', () => {
  it('shows the date in the screen language, Every year, Spanish traditions and the notes', async () => {
    stub();
    pack = { content: { 'tradition.wiccan.name': 'Wicca', 'tradition.eclectic.name': 'Ecléctica' } };
    mount('/calendar/dates/5', { settings: true });
    expect(await screen.findByRole('heading', { name: 'Grandmother' })).toBeInTheDocument();
    expect(await screen.findByText('14 de marzo de 1950')).toBeInTheDocument();
    expect(screen.getByText('Every year')).toBeInTheDocument();
    expect(await screen.findByText('Wicca, Ecléctica')).toBeInTheDocument();
    expect(screen.getByText('She loved roses.')).toBeInTheDocument();
    expect(screen.getByText('Light a candle.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/calendar/dates/5/edit');
    // A yearly date comes back this year, so the way back opens this year's March.
    expect(screen.getByRole('link', { name: 'Back to the calendar' })).toHaveAttribute('href', `/calendar?month=${THIS_YEAR}-03`);
  });
  it('links a one-time date back to the month it happened', async () => {
    stub();
    rows[5].yearly = 0;
    mount('/calendar/dates/5');
    await screen.findByText('March 14, 1950');
    expect(screen.getByRole('link', { name: 'Back to the calendar' })).toHaveAttribute('href', '/calendar?month=1950-03');
  });
  it('says nothing about every year for a one-time date', async () => {
    stub();
    Object.assign(rows[5], { yearly: 0, traditions: [], notes: null });
    mount('/calendar/dates/5');
    expect(await screen.findByText('March 14, 1950')).toBeInTheDocument();
    expect(screen.queryByText('Every year')).not.toBeInTheDocument();
    expect(screen.queryByText('Traditions')).not.toBeInTheDocument();
  });
  it('moves the date to the Trash after asking, and Undo brings it back', async () => {
    stub(); mount('/calendar/dates/5');
    await screen.findByRole('heading', { name: 'Grandmother' });
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move Grandmother to the Trash?')).toBeInTheDocument();
    expect(within(dialog).getByText('You can bring it back from the Trash.')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The calendar')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?month=${THIS_YEAR}-03`);
    expect(sent('DELETE')).toEqual([{ url: '/api/own-dates/5', body: null }]);
    expect(screen.getByText('Grandmother is in the Trash.')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Undo'));
    await vi.waitFor(() => expect(sent('POST').map(c => c.url)).toEqual(['/api/own-dates/5/restore']));
    expect(await screen.findByRole('heading', { name: 'Grandmother' })).toBeInTheDocument();
  });
  it('says when the date is gone and links back to the calendar', async () => {
    stub(); mount('/calendar/dates/99');
    expect(await screen.findByText("That isn't here any more. It may have been deleted.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the calendar' })).toHaveAttribute('href', '/calendar');
  });
});

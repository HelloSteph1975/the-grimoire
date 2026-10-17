import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { RitualPageRoute } from '../../client/src/screens/rituals/RitualPage.jsx';
import { LogFormRoute } from '../../client/src/screens/rituals/LogForm.jsx';
import { RitualFormRoute } from '../../client/src/screens/rituals/RitualForm.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const traditions = [
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
];
const spells = [{ id: 5, title: 'Moon jar', purpose: '', kind_id: null, version: 1 }];
const stored = () => ({
  id: 8, title: 'Full moon jar', spell_id: 5, spell: { id: 5, title: 'Moon jar' }, date: '2026-10-25', time: '19:30',
  reminder_days: 2, plan_notes: 'Bring a shawl.', status: 'planned', changes: null, outcome: null, rating: null,
  sky: { moon: 'waxing-gibbous', lit: 0.82, weekday: 'sun', planet: 'sun' },
  traditions: [2], supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: null, checked: false }], version: 3,
});
const storedFollowups = () => [{ id: 3, ritual_id: 8, date: '2026-10-27', text: 'Slept well.', version: 1 }];

let ritual;
let followups;
function stub() {
  ritual = stored();
  followups = storedFollowups();
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book' });
    if (url === '/api/traditions') return json(traditions);
    if (url === '/api/spells') return json(spells);
    if (url === '/api/today') return json({ day: '2026-10-16' });
    if (url.startsWith('/api/locales/')) return json({});
    if (url === '/api/rituals/8' && m === 'GET') return json(ritual);
    if (url === '/api/rituals/8' && m === 'PATCH') {
      if (body.version !== ritual.version) return json({ error: 'changed', code: 'conflict', current: ritual }, 409);
      ritual = { ...ritual, ...body, version: ritual.version + 1 };
      return json(ritual);
    }
    if (url === '/api/rituals/8' && m === 'DELETE') return json({ ok: true });
    if (url === '/api/followups?ritual=8') return json(followups);
    if (url === '/api/followups' && m === 'POST') {
      const made = { id: 4, ...body, version: 1 };
      followups = [...followups, made];
      return json(made, 201);
    }
    const fu = url.match(/^\/api\/followups\/(\d+)(\/restore)?$/);
    if (fu) {
      const id = Number(fu[1]);
      if (fu[2]) { followups = storedFollowups(); return json(followups[0]); }
      if (m === 'PATCH') {
        const was = followups.find(x => x.id === id);
        if (body.version !== was.version) return json({ error: 'changed', code: 'conflict', current: was }, 409);
        const next = { ...was, ...body, version: was.version + 1 };
        followups = followups.map(x => (x.id === id ? next : x));
        return json(next);
      }
      if (m === 'DELETE') { followups = followups.filter(x => x.id !== id); return json({ ok: true }); }
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
function mount(path) {
  const router = createMemoryRouter([{
    element: <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>,
    children: [
      { path: '/rituals', element: <p>The list</p> },
      { path: '/rituals/new', element: <RitualFormRoute /> },
      { path: '/rituals/:id', element: <RitualPageRoute /> },
      { path: '/rituals/:id/log', element: <LogFormRoute /> },
      { path: '/rituals/:id/edit', element: <p>The plan form</p> },
      { path: '/spells/:id', element: <p>The spell page</p> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}
const calls = (method, url) => fetch.mock.calls.filter(([u, o]) => (o?.method ?? 'GET') === method && (!url || u === url))
  .map(([u, o]) => ({ url: u, body: o?.body ? JSON.parse(o.body) : null }));
const loadPage = async () => {
  const router = mount('/rituals/8');
  await screen.findByRole('heading', { name: 'Full moon jar', level: 1 });
  return router;
};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
// Holds the first ritual PATCH until the gate opens, then lets the normal handler answer it.
const gateFirstPatch = () => {
  const gate = deferred();
  let first = true;
  const realFetch = fetch.getMockImplementation();
  fetch.mockImplementation(async (url, opts = {}) => {
    if (url === '/api/rituals/8' && opts.method === 'PATCH' && first) { first = false; await gate.promise; }
    return realFetch(url, opts);
  });
  return gate;
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('Ritual page', () => {
  it('shows the sky, the spell link and the supplies, and a tick saves with the version', async () => {
    stub(); await loadPage();
    expect(screen.getByText('Waxing gibbous, 82% lit. Sunday, the day of Sun.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Moon jar' })).toHaveAttribute('href', '/spells/5');
    expect(screen.getByText('Planned')).toBeInTheDocument();
    expect(await screen.findByText('Eclectic')).toBeInTheDocument();
    expect(screen.getByText('Bring a shawl.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Jar/ })).toBeChecked();
    const candle = screen.getByRole('checkbox', { name: /Candle/ });
    expect(candle).not.toBeChecked();
    await userEvent.click(candle);
    await vi.waitFor(() => expect(calls('PATCH')).toHaveLength(1));
    expect(calls('PATCH')[0]).toEqual({ url: '/api/rituals/8', body: {
      supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: null, checked: true }], version: 3,
    } });
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: /Candle/ })).toBeChecked());
  });

  it('queues quick ticks: two PATCHes in order, each with the newest version, none lost', async () => {
    stub(); await loadPage();
    const gate = deferred();
    let first = true;
    // The first PATCH waits on the gate, then goes to the normal handler.
    const realFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, opts = {}) => {
      if (url === '/api/rituals/8' && opts.method === 'PATCH' && first) { first = false; await gate.promise; }
      return realFetch(url, opts);
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Candle/ }));
    expect(screen.getByRole('checkbox', { name: /Jar/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Candle/ })).toBeChecked();
    expect(calls('PATCH')).toHaveLength(1);
    gate.resolve();
    await vi.waitFor(() => expect(calls('PATCH')).toHaveLength(2));
    const [a, b] = calls('PATCH');
    expect(a.body).toEqual({ supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Candle', amount: null, checked: false }], version: 3 });
    expect(b.body).toEqual({ supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Candle', amount: null, checked: true }], version: 4 });
    await vi.waitFor(() => expect(ritual.version).toBe(5));
    expect(screen.getByRole('checkbox', { name: /Jar/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Candle/ })).toBeChecked();
  });

  it('a tick that meets a conflict shows the message and reloads the ritual', async () => {
    stub(); await loadPage();
    // Someone else ticked the candle meanwhile.
    ritual = { ...ritual, version: 4, supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: null, checked: true }] };
    const before = calls('GET', '/api/rituals/8').length;
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    expect(await screen.findByText('This was changed somewhere else.')).toBeInTheDocument();
    await vi.waitFor(() => expect(calls('GET', '/api/rituals/8').length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: /Candle/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Jar/ })).toBeChecked();
    // One reload, not two: the resource reloads itself after a failed save.
    await new Promise(r => setTimeout(r, 50));
    expect(calls('GET', '/api/rituals/8')).toHaveLength(before + 1);
  });

  it('a conflict on a tick drops the queued ticks instead of sending them on the stale version', async () => {
    stub(); await loadPage();
    const gate = gateFirstPatch();
    ritual = { ...ritual, version: 4, supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: null, checked: true }] };
    const before = calls('GET', '/api/rituals/8').length;
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Candle/ }));
    gate.resolve();
    expect(await screen.findByText('This was changed somewhere else.')).toBeInTheDocument();
    await vi.waitFor(() => expect(calls('GET', '/api/rituals/8')).toHaveLength(before + 1));
    await vi.waitFor(() => expect(screen.getByRole('checkbox', { name: /Jar/ })).toBeChecked());
    expect(screen.getByRole('checkbox', { name: /Candle/ })).toBeChecked();
    await new Promise(r => setTimeout(r, 50));
    expect(calls('PATCH')).toHaveLength(1);
    expect(calls('PATCH')[0].body.version).toBe(3);
  });

  it('finishes sending queued ticks after leaving the page, quietly', async () => {
    stub(); const router = await loadPage();
    const gate = gateFirstPatch();
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Candle/ }));
    await router.navigate('/rituals');
    expect(await screen.findByText('The list')).toBeInTheDocument();
    gate.resolve();
    await vi.waitFor(() => expect(calls('PATCH')).toHaveLength(2));
    const [first, second] = calls('PATCH');
    expect(first.body).toEqual({ supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Candle', amount: null, checked: false }], version: 3 });
    expect(second.body).toEqual({ supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Candle', amount: null, checked: true }], version: 4 });
    await new Promise(r => setTimeout(r, 50));
    expect(ritual.version).toBe(5);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('shows no toast when a queued tick fails after leaving the page', async () => {
    stub(); const router = await loadPage();
    const gate = gateFirstPatch();
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Candle/ }));
    await router.navigate('/rituals');
    expect(await screen.findByText('The list')).toBeInTheDocument();
    // Someone else saved meanwhile, so the first tick loses with a 409 and overwrites nothing.
    ritual = { ...ritual, version: 9 };
    gate.resolve();
    await new Promise(r => setTimeout(r, 50));
    expect(calls('PATCH')).toHaveLength(1);
    expect(ritual.version).toBe(9);
    expect(document.querySelector('.toast')).toBeNull();
  });

  it('drops a queued tick whose line moved in the saved list', async () => {
    stub(); await loadPage();
    // The first save comes back with the lines in another order (say, edited in another window).
    const gate = deferred();
    let first = true;
    const realFetch = fetch.getMockImplementation();
    fetch.mockImplementation(async (url, opts = {}) => {
      if (url === '/api/rituals/8' && opts.method === 'PATCH' && first) {
        first = false;
        await gate.promise;
        ritual = { ...ritual, version: 4, supplies: [{ name: 'Candle', amount: null, checked: false }, { name: 'Jar', amount: '1', checked: false }] };
        return json(ritual);
      }
      return realFetch(url, opts);
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /Jar/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Candle/ }));
    gate.resolve();
    await vi.waitFor(() => expect(screen.getAllByRole('checkbox')[0]).toHaveAccessibleName(/Candle/));
    await new Promise(r => setTimeout(r, 50));
    // The Candle tick named line 2, which is now Jar, so it is not sent and Jar is not flipped.
    expect(calls('PATCH')).toHaveLength(1);
    expect(screen.getByRole('checkbox', { name: /Jar/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Candle/ })).not.toBeChecked();
  });

  it('has no spell link when the ritual has no spell', async () => {
    stub();
    ritual = { ...stored(), spell_id: null, spell: null };
    mount('/rituals/8');
    await screen.findByRole('heading', { name: 'Full moon jar', level: 1 });
    expect(screen.queryByRole('link', { name: 'Moon jar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Plan again' })).toHaveAttribute('href', '/rituals/new?copy=8');
  });

  it('shows the log when the ritual is done', async () => {
    stub();
    ritual = { ...stored(), status: 'done', changes: 'Used a white candle.', outcome: 'Calm all week.', rating: 4 };
    await loadPage();
    expect(screen.getByRole('heading', { name: 'Log' })).toBeInTheDocument();
    expect(screen.getByText('Used a white candle.')).toBeInTheDocument();
    expect(screen.getByText('Calm all week.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '4 of 5' })).toBeInTheDocument();
  });

  it('Plan again opens the plan form with the copied values', async () => {
    stub(); await loadPage();
    const link = screen.getByRole('link', { name: 'Plan again' });
    expect(link).toHaveAttribute('href', '/rituals/new?copy=8&spell=5');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Plan a ritual' })).toBeInTheDocument();
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Full moon jar'));
    expect(screen.getByLabelText('Plan notes')).toHaveValue('Bring a shawl.');
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    for (const box of screen.getAllByLabelText('Ready')) expect(box).not.toBeChecked();
  });

  it('deletes after asking and offers undo', async () => {
    stub(); const router = await loadPage();
    await userEvent.click(within(document.querySelector('.page-header')).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Move Full moon jar to the Trash?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Full moon jar is in the Trash.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rituals');
    expect(calls('DELETE', '/api/rituals/8')).toHaveLength(1);
  });
});

describe('Log form', () => {
  it('saves status, texts and rating with the version, then opens the ritual page', async () => {
    stub(); const router = mount('/rituals/8/log');
    expect(await screen.findByRole('heading', { name: 'Full moon jar' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Done' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Skipped' }));
    await userEvent.type(screen.getByLabelText('What was different'), 'Rain');
    await userEvent.type(screen.getByLabelText('How it went'), 'Tried again later');
    const rating = screen.getByRole('group', { name: 'Rating' });
    expect(within(rating).getByRole('button', { name: 'No rating' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(rating).getByRole('button', { name: '1 star' })).toBeInTheDocument();
    await userEvent.click(within(rating).getByRole('button', { name: '4 stars' }));
    expect(within(rating).getByRole('button', { name: '4 stars' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
    expect(calls('PATCH')).toEqual([{ url: '/api/rituals/8', body: {
      status: 'skipped', changes: 'Rain', outcome: 'Tried again later', rating: 4, version: 3,
    } }]);
  });

  it('clears the rating with No rating and asks before leaving with changes', async () => {
    stub();
    ritual = { ...stored(), status: 'done', rating: 3 };
    mount('/rituals/8/log');
    const rating = await screen.findByRole('group', { name: 'Rating' });
    expect(within(rating).getByRole('button', { name: '3 stars' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(rating).getByRole('button', { name: 'No rating' }));
    expect(within(rating).getByRole('button', { name: '3 stars' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  });

  it('sets a mis-logged ritual back to Planned', async () => {
    stub();
    ritual = { ...stored(), status: 'done', outcome: 'Calm.' };
    const router = mount('/rituals/8/log');
    expect(await screen.findByRole('radio', { name: 'Done' })).toBeChecked();
    expect(screen.getAllByRole('radio').map(r => r.value)).toEqual(['planned', 'done', 'skipped']);
    await userEvent.click(screen.getByRole('radio', { name: 'Planned' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
    expect(calls('PATCH')).toEqual([{ url: '/api/rituals/8', body: {
      status: 'planned', changes: '', outcome: 'Calm.', rating: null, version: 3,
    } }]);
  });
});

describe('Follow-ups', () => {
  it('adds one dated today without touching the ritual', async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    expect(await within(section).findByText('Slept well.')).toBeInTheDocument();
    const ritualReads = calls('GET', '/api/rituals/8').length;
    await userEvent.click(within(section).getByRole('button', { name: 'Add a follow-up' }));
    await vi.waitFor(() => expect(within(section).getByLabelText('Date')).toHaveValue('2026-10-16'));
    await userEvent.type(within(section).getByLabelText('Note'), 'Dreamed of water.');
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByText('Dreamed of water.')).toBeInTheDocument();
    expect(calls('POST', '/api/followups')).toEqual([{ url: '/api/followups', body: { ritual_id: 8, date: '2026-10-16', text: 'Dreamed of water.' } }]);
    expect(calls('PATCH')).toHaveLength(0);
    expect(calls('GET', '/api/rituals/8')).toHaveLength(ritualReads);
    expect(within(section).queryByLabelText('Note')).toBeNull();
  });

  it('edits one inline with its version, and the leave guard covers an open form', async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    const item = (await within(section).findByText('Slept well.')).closest('li');
    await userEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    const note = within(section).getByLabelText('Note');
    expect(note).toHaveValue('Slept well.');
    await userEvent.type(note, ' Twice.');
    await userEvent.click(screen.getByRole('link', { name: 'Back to Rituals' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByText('Slept well. Twice.')).toBeInTheDocument();
    expect(calls('PATCH')).toEqual([{ url: '/api/followups/3', body: { date: '2026-10-27', text: 'Slept well. Twice.', version: 1 } }]);
  });

  it('deletes one with undo', async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    const item = (await within(section).findByText('Slept well.')).closest('li');
    await userEvent.click(within(item).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('The follow-up is in the Trash.')).toBeInTheDocument();
    await vi.waitFor(() => expect(within(section).queryByText('Slept well.')).toBeNull());
    expect(within(section).getByText('No follow-ups yet.')).toBeInTheDocument();
    expect(calls('DELETE', '/api/followups/3')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await within(section).findByText('Slept well.')).toBeInTheDocument();
    expect(calls('POST', '/api/followups/3/restore')).toHaveLength(1);
  });

  it('keeps a dirty add form open: Edit on an item waits until it closes', async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    const item = (await within(section).findByText('Slept well.')).closest('li');
    await userEvent.click(within(section).getByRole('button', { name: 'Add a follow-up' }));
    await userEvent.type(await within(section).findByLabelText('Note'), 'Half typed');
    const edit = within(item).getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    await userEvent.click(edit);
    expect(within(section).getAllByLabelText('Note')).toHaveLength(1);
    expect(within(section).getByLabelText('Note')).toHaveValue('Half typed');
  });

  it('keeps a dirty edit form open: Add waits until it closes', async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    const item = (await within(section).findByText('Slept well.')).closest('li');
    await userEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    await userEvent.type(within(section).getByLabelText('Note'), ' Twice.');
    const add = within(section).getByRole('button', { name: 'Add a follow-up' });
    expect(add).toBeDisabled();
    await userEvent.click(add);
    expect(within(section).getAllByLabelText('Note')).toHaveLength(1);
    expect(within(section).getByLabelText('Note')).toHaveValue('Slept well. Twice.');
  });

  const editIntoConflict = async () => {
    stub(); await loadPage();
    const section = screen.getByRole('region', { name: 'Follow-ups' });
    const item = (await within(section).findByText('Slept well.')).closest('li');
    await userEvent.click(within(item).getByRole('button', { name: 'Edit' }));
    // Another window changes it meanwhile.
    followups = [{ ...followups[0], text: 'Slept badly.', version: 2 }];
    await userEvent.type(within(section).getByLabelText('Note'), ' Twice.');
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    return { section, dialog: await screen.findByRole('dialog') };
  };

  it('a follow-up conflict: Keep mine saves over it with the newer version', async () => {
    const { section, dialog } = await editIntoConflict();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep mine and save over it' }));
    expect(await within(section).findByText('Slept well. Twice.')).toBeInTheDocument();
    expect(calls('PATCH').map(c => c.body.version)).toEqual([1, 2]);
  });

  it('a follow-up conflict: Reload the latest refills the form', async () => {
    const { section, dialog } = await editIntoConflict();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reload the latest' }));
    await vi.waitFor(() => expect(within(section).getByLabelText('Note')).toHaveValue('Slept badly.'));
    await userEvent.type(within(section).getByLabelText('Note'), ' Then fine.');
    await userEvent.click(within(section).getByRole('button', { name: 'Save' }));
    expect(await within(section).findByText('Slept badly. Then fine.')).toBeInTheDocument();
    expect(calls('PATCH').map(c => c.body.version)).toEqual([1, 2]);
  });
});

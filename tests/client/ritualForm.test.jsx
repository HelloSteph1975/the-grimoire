import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { RitualFormRoute } from '../../client/src/screens/rituals/RitualForm.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const traditions = [
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
];
const spells = [
  { id: 6, title: 'Salt line', purpose: '', kind_id: null, version: 1 },
  { id: 5, title: 'Moon jar', purpose: '', kind_id: null, version: 1 },
];
const spellDetail = {
  5: {
    id: 5, title: 'Moon jar', traditions: [1], version: 2,
    feasts: [{ id: 30, name: 'Yule', starter_key: null, is_starter: 0, feast_day: '12-21' }],
    ingredients: [
      { name: 'Jar', amount: '1', correspondence_id: null, link: null },
      { name: 'Salt', amount: '1 pinch', correspondence_id: 9, link: { id: 9, name: 'Sea salt' } },
    ],
    steps: [], timing: { moon: ['full'], day: ['fri'], planet: ['venus'] },
  },
  6: { id: 6, title: 'Salt line', traditions: [2], version: 1, feasts: [], ingredients: [], steps: [], timing: { moon: [], day: [], planet: [] } },
};
const suggestions = {
  5: [
    { day: '2026-10-23', met: { moon: ['full'], days: ['fri'], planets: ['venus'], feasts: [] } },
    { day: '2026-12-21', met: { moon: [], days: [], planets: [], feasts: [30] } },
  ],
  6: [],
};
const saved5 = suggestions[5];
const stored = () => ({
  id: 8, title: 'Full moon jar', spell_id: 5, spell: { id: 5, title: 'Moon jar' }, date: '2026-10-25', time: '19:30',
  reminder_days: 2, plan_notes: 'Bring a shawl.', status: 'planned', changes: null, outcome: null, rating: null, sky: null,
  traditions: [2], supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: null, checked: false }], version: 3,
});

let ritual;
let override;
function stub() {
  ritual = stored();
  override = null;
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const hit = override?.(url, m, body);
    if (hit) return hit;
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book' });
    if (url === '/api/traditions') return json(traditions);
    if (url === '/api/spells') return json(spells);
    if (url.startsWith('/api/locales/')) return json({});
    const sug = url.match(/^\/api\/spells\/(\d+)\/suggestions$/);
    if (sug) return json({ suggestions: suggestions[sug[1]] ?? [] });
    const sp = url.match(/^\/api\/spells\/(\d+)$/);
    if (sp && spellDetail[sp[1]]) return json(spellDetail[sp[1]]);
    if (url === '/api/rituals' && m === 'POST') return json({ ...stored(), ...body, id: 21, version: 1 }, 201);
    if (url === '/api/rituals/8' && m === 'GET') return json(ritual);
    if (url === '/api/rituals/8' && m === 'PATCH') {
      if (body.version !== ritual.version) return json({ error: 'changed', code: 'conflict', current: ritual }, 409);
      return json({ ...ritual, version: ritual.version + 1 });
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path) {
  router = createMemoryRouter([{
    element: <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>,
    children: [
      { path: '/rituals', element: <p>The list</p> },
      { path: '/rituals/new', element: <RitualFormRoute /> },
      { path: '/rituals/:id', element: <p>The ritual page</p> },
      { path: '/rituals/:id/edit', element: <RitualFormRoute /> },
      { path: '/spells/:id', element: <p>The spell page</p> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const sent = method => fetch.mock.calls.filter(([, o]) => o?.method === method).map(([u, o]) => ({ url: u, body: JSON.parse(o.body) }));
const supplyRows = () => [...screen.getByRole('group', { name: 'Supplies' }).querySelectorAll('.list-row')];
const loadEdit = async () => {
  mount('/rituals/8/edit');
  await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Full moon jar'));
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('Ritual plan form', () => {
  it('copies a chosen spell, uses a suggestion and posts the exact body', async () => {
    stub(); mount('/rituals/new');
    expect(await screen.findByRole('heading', { name: 'Plan a ritual' })).toBeInTheDocument();
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    const spell = screen.getByLabelText('Spell');
    expect(within(spell).getAllByRole('option').map(o => o.textContent)).toEqual(['No spell', 'Moon jar', 'Salt line']);
    const reminder = screen.getByLabelText('Reminder');
    expect(within(reminder).getAllByRole('option').map(o => o.textContent)).toEqual([
      'None', 'On the day', '1 day before', '2 days before', '3 days before', '4 days before', '5 days before',
      '6 days before', '7 days before', '14 days before', '30 days before',
    ]);

    await userEvent.selectOptions(spell, '5');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Moon jar'));
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    expect(screen.getByLabelText('Eclectic')).not.toBeChecked();
    const [jar, salt] = supplyRows();
    expect(within(jar).getByLabelText('Name')).toHaveValue('Jar');
    expect(within(salt).getByLabelText('Amount')).toHaveValue('1 pinch');
    expect(within(salt).getByLabelText('Ready')).not.toBeChecked();

    const group = await screen.findByRole('group', { name: 'Suggested days' });
    const first = await within(group).findByRole('button', { name: /October 23, 2026/ });
    expect(first).toHaveTextContent('Matches: Full moon, Friday, and Venus');
    expect(within(group).getByRole('button', { name: /December 21, 2026/ })).toHaveTextContent('Matches: Yule');
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/spells/5/suggestions');
    await userEvent.click(first);
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-23');
    expect(first).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Time')).toHaveFocus();

    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '21:00' } });
    await userEvent.selectOptions(reminder, '0');
    await userEvent.click(within(salt).getByLabelText('Ready'));
    await userEvent.type(screen.getByLabelText('Plan notes'), 'Open a window.');
    await userEvent.click(save);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/21'));
    expect(sent('POST')).toEqual([{
      url: '/api/rituals',
      body: {
        title: 'Moon jar', spell_id: 5, traditions: [1], date: '2026-10-23', time: '21:00', reminder_days: 0,
        plan_notes: 'Open a window.',
        supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Salt', amount: '1 pinch', checked: true }],
      },
    }]);
  });

  it('cannot save until a chosen spell has loaded and been copied', async () => {
    stub();
    let release;
    const gate = new Promise(r => { release = r; });
    override = (url, m) => (url === '/api/spells/5' && m === 'GET' ? gate.then(() => json(spellDetail[5])) : null);
    mount('/rituals/new');
    const title = await screen.findByLabelText('Title');
    await userEvent.type(title, 'Mine');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-10-30' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    await userEvent.selectOptions(screen.getByLabelText('Spell'), '5');
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest('form'));
    expect(sent('POST')).toEqual([]);
    release();
    await vi.waitFor(() => expect(screen.getByLabelText('Wiccan')).toBeChecked());
    await vi.waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await vi.waitFor(() => expect(sent('POST')).toHaveLength(1));
    const body = sent('POST')[0].body;
    expect(body.traditions).toEqual([1]);
    expect(body.supplies.map(l => l.name)).toEqual(['Jar', 'Salt']);
  });

  it('keeps a typed title, supplies and ticked traditions when a spell is chosen', async () => {
    stub(); mount('/rituals/new');
    const title = await screen.findByLabelText('Title');
    await userEvent.type(title, 'My jar');
    await userEvent.click(screen.getByRole('button', { name: 'Add a supply' }));
    await userEvent.type(within(supplyRows()[0]).getByLabelText('Name'), 'Shell');
    await userEvent.click(screen.getByLabelText('Eclectic'));
    await userEvent.selectOptions(screen.getByLabelText('Spell'), '5');
    await vi.waitFor(() => expect(screen.getByLabelText('Wiccan')).toBeChecked());
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    expect(title).toHaveValue('My jar');
    expect(supplyRows()).toHaveLength(1);
    expect(within(supplyRows()[0]).getByLabelText('Name')).toHaveValue('Shell');
  });

  it('says so when the spell has no timing, and sends no spell for No spell', async () => {
    stub(); mount('/rituals/new');
    await userEvent.selectOptions(await screen.findByLabelText('Spell'), '6');
    expect(await screen.findByText('This spell has no timing, so there are no suggestions. Pick any day.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Spell'), '');
    expect(screen.queryByText('This spell has no timing, so there are no suggestions. Pick any day.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('POST')).toHaveLength(1));
    expect(sent('POST')[0].body).toEqual({
      title: 'Salt line', spell_id: null, traditions: [2], date: '2026-11-02', time: null, reminder_days: null, plan_notes: '', supplies: [],
    });
  });

  it('fills every field when editing and patches with the version', async () => {
    stub(); await loadEdit();
    expect(screen.getByRole('heading', { name: 'Edit ritual' })).toBeInTheDocument();
    expect(screen.getByLabelText('Spell')).toHaveValue('5');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-25');
    expect(screen.getByLabelText('Time')).toHaveValue('19:30');
    expect(screen.getByLabelText('Reminder')).toHaveValue('2');
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    expect(screen.getByLabelText('Wiccan')).not.toBeChecked();
    const [jar, candle] = supplyRows();
    expect(within(jar).getByLabelText('Ready')).toBeChecked();
    expect(within(candle).getByLabelText('Amount')).toHaveValue('');
    expect(screen.getByLabelText('Plan notes')).toHaveValue('Bring a shawl.');
    // Suggestions show for the stored spell, and nothing is copied over the stored plan.
    expect(await screen.findByRole('button', { name: /October 23, 2026/ })).toBeInTheDocument();
    expect(supplyRows()).toHaveLength(2);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Plan notes'), ' And tea.');
    await userEvent.click(save);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
    expect(sent('PATCH')).toEqual([{
      url: '/api/rituals/8',
      body: {
        version: 3, title: 'Full moon jar', spell_id: 5, traditions: [2], date: '2026-10-25', time: '19:30', reminder_days: 2,
        plan_notes: 'Bring a shawl. And tea.',
        supplies: [{ name: 'Jar', amount: '1', checked: true }, { name: 'Candle', amount: '', checked: false }],
      },
    }]);
  });

  it('shows a supply error under the matching row', async () => {
    stub(); await loadEdit();
    override = (url, m) => (m === 'PATCH' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { 'supplies.1.name': 'Required' }, detailCodes: { 'supplies.1.name': { code: 'required' } },
    }, 400) : null);
    await userEvent.type(screen.getByLabelText('Plan notes'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [first, second] = supplyRows();
    await vi.waitFor(() => expect(within(second).getByLabelText('Name')).toHaveAccessibleDescription('Required'));
    expect(within(first).getByLabelText('Name')).not.toHaveAccessibleDescription('Required');
  });

  it('Keep mine saves over the newer ritual with its version', async () => {
    stub(); await loadEdit();
    ritual = { ...stored(), version: 6, title: 'Full moon jar two' };
    await userEvent.type(screen.getByLabelText('Plan notes'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Keep mine and save over it'));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
    expect(sent('PATCH').map(c => c.body.version)).toEqual([3, 6]);
    expect(sent('PATCH')[1].body).toMatchObject({ title: 'Full moon jar', plan_notes: 'Bring a shawl. x' });
  });

  it('Reload the latest fills the form from the newer ritual', async () => {
    stub(); await loadEdit();
    ritual = { ...stored(), version: 6, title: 'Jar again', spell_id: 6, spell: { id: 6, title: 'Salt line' }, time: null,
      reminder_days: null, traditions: [1], supplies: [{ name: 'Bowl', amount: null, checked: false }] };
    await userEvent.type(screen.getByLabelText('Plan notes'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Reload the latest'));
    expect(screen.getByLabelText('Title')).toHaveValue('Jar again');
    expect(screen.getByLabelText('Spell')).toHaveValue('6');
    expect(screen.getByLabelText('Time')).toHaveValue('');
    expect(screen.getByLabelText('Reminder')).toHaveValue('');
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    expect(supplyRows()).toHaveLength(1);
    expect(within(supplyRows()[0]).getByLabelText('Name')).toHaveValue('Bowl');
    await userEvent.type(screen.getByLabelText('Plan notes'), ' y');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
    expect(sent('PATCH').at(-1).body).toEqual({
      version: 6, title: 'Jar again', spell_id: 6, traditions: [1], date: '2026-10-25', time: null, reminder_days: null,
      plan_notes: 'Bring a shawl. y', supplies: [{ name: 'Bowl', amount: '', checked: false }],
    });
  });

  it('asks before leaving with changes', async () => {
    stub(); await loadEdit();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
  });

  it('starts from the spell and day in the link', async () => {
    stub(); mount('/rituals/new?spell=5&date=2026-10-30');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Moon jar'));
    expect(screen.getByLabelText('Spell')).toHaveValue('5');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-30');
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    expect(supplyRows()).toHaveLength(2);
    expect(await screen.findByRole('button', { name: /October 23, 2026/ })).toBeInTheDocument();
    // Opened from a spell, Cancel goes back to it, and an untouched form leaves without asking.
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
  });

  it('ignores a day in the link that is not real', async () => {
    stub(); mount('/rituals/new?date=2026-02-30');
    expect(await screen.findByLabelText('Date')).toHaveValue('');
  });

  it('copies a ritual for Plan again, with supplies unticked and no date', async () => {
    stub(); mount('/rituals/new?copy=8');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Full moon jar'));
    expect(screen.getByRole('heading', { name: 'Plan a ritual' })).toBeInTheDocument();
    expect(screen.getByLabelText('Spell')).toHaveValue('5');
    expect(screen.getByLabelText('Date')).toHaveValue('');
    expect(screen.getByLabelText('Time')).toHaveValue('');
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    expect(screen.getByLabelText('Plan notes')).toHaveValue('Bring a shawl.');
    const [jar, candle] = supplyRows();
    expect(within(jar).getByLabelText('Ready')).not.toBeChecked();
    expect(within(candle).getByLabelText('Name')).toHaveValue('Candle');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-24' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('POST')).toHaveLength(1));
    expect(sent('POST')[0].body).toEqual({
      title: 'Full moon jar', spell_id: 5, traditions: [2], date: '2026-11-24', time: null, reminder_days: null,
      plan_notes: 'Bring a shawl.', supplies: [{ name: 'Jar', amount: '1', checked: false }, { name: 'Candle', amount: '', checked: false }],
    });
  });

  it('has a different note when the spell has timing but no day matches', async () => {
    stub();
    suggestions[5] = [];
    try {
      mount('/rituals/new');
      await userEvent.selectOptions(await screen.findByLabelText('Spell'), '5');
      expect(await screen.findByText("No day in the next 90 days matches this spell's timing. Pick any day.")).toBeInTheDocument();
      expect(screen.queryByText('This spell has no timing, so there are no suggestions. Pick any day.')).not.toBeInTheDocument();
    } finally {
      suggestions[5] = saved5;
    }
  });

  it('starts blank when the ritual to copy is gone, and Cancel goes to the list', async () => {
    stub(); mount('/rituals/new?copy=77');
    const title = await screen.findByLabelText('Title');
    expect(title).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan a ritual' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals'));
  });

  it('Cancel from a copy goes back to the ritual it came from', async () => {
    stub(); mount('/rituals/new?copy=8');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Full moon jar'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/rituals/8'));
  });

  it('keeps the form filled and shows the error when a new ritual fails to save', async () => {
    stub();
    override = (url, m) => (url === '/api/rituals' && m === 'POST' ? json({ error: 'Something went wrong on our side.', code: 'server' }, 500) : null);
    mount('/rituals/new');
    await userEvent.type(await screen.findByLabelText('Title'), 'Rain jar');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-02' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/rituals/new');
    expect(screen.getByLabelText('Title')).toHaveValue('Rain jar');
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-02');
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});

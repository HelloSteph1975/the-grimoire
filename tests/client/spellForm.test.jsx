import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Outlet } from 'react-router-dom';
import { SettingsProvider } from '../../client/src/components/SettingsProvider.jsx';
import { ToastProvider } from '../../client/src/components/ToastProvider.jsx';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { SpellFormRoute } from '../../client/src/screens/spells/SpellForm.jsx';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const kinds = [
  { id: 1, name: 'Protection', is_starter: 1, starter_key: 'spellkind.protection', version: 1 },
  { id: 2, name: 'Blessing', is_starter: 0, starter_key: null, version: 1 },
];
const traditions = [
  { id: 2, name: 'Eclectic', is_starter: 1, starter_key: 'tradition.eclectic', version: 1 },
  { id: 1, name: 'Wiccan', is_starter: 1, starter_key: 'tradition.wiccan', version: 1 },
];
const entries = [
  { id: 9, name: 'Sea salt', category_id: 1, is_starter: 0, starter_key: null },
  { id: 30, name: 'Yule', category_id: 3, is_starter: 0, starter_key: null, feast_day: '12-21' },
];
const stored = () => ({
  id: 5, title: 'Moon jar', purpose: 'For rest.', kind_id: 1, notes: 'Keep it dark.', source: 'My own', version: 4,
  traditions: [1],
  feasts: [{ id: 30, name: 'Yule', starter_key: null, is_starter: 0, feast_day: '12-21' }],
  ingredients: [
    { name: 'Hidden herb', amount: '2 leaves', correspondence_id: 7, link: null },
    { name: 'Salt', amount: '1 pinch', correspondence_id: 9, link: { id: 9, name: 'Sea salt', starter_key: null, is_starter: 0 } },
  ],
  steps: ['Light the candle', 'Say the words', 'Blow it out'],
  timing: { moon: ['full'], day: [], planet: ['moon'] },
});

let spell;
let override;
function stub() {
  spell = stored();
  override = null;
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    const m = opts.method ?? 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const hit = override?.(url, m, body);
    if (hit) return hit;
    if (url === '/api/settings') return json({ language: 'en', theme: 'old-book' });
    if (url === '/api/spell-kinds') return json(kinds);
    if (url === '/api/traditions') return json(traditions);
    if (url.startsWith('/api/locales/')) return json({});
    if (url.startsWith('/api/correspondences?')) return json(url.includes('feasts=1') ? [entries[1]] : [entries[0]]);
    if (url === '/api/spells' && m === 'POST') return json({ ...spell, ...body, id: 21, version: 1 }, 201);
    if (url === '/api/spells/5' && m === 'GET') return json(spell);
    if (url === '/api/spells/5' && m === 'PATCH') {
      if (body.version !== spell.version) return json({ error: 'changed', code: 'conflict', current: spell }, 409);
      return json({ ...spell, version: spell.version + 1 });
    }
    return json({ error: 'Not found', code: 'not_found' }, 404);
  }));
}
let router;
function mount(path) {
  router = createMemoryRouter([{
    element: <SettingsProvider><ToastProvider><ConfirmProvider><LeaveGuardProvider><Outlet /></LeaveGuardProvider></ConfirmProvider></ToastProvider></SettingsProvider>,
    children: [
      { path: '/spells', element: <p>The list</p> },
      { path: '/spells/new', element: <SpellFormRoute /> },
      { path: '/spells/:id', element: <p>The spell page</p> },
      { path: '/spells/:id/edit', element: <SpellFormRoute /> },
    ],
  }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
}
const sent = method => fetch.mock.calls.filter(([, o]) => o?.method === method).map(([u, o]) => ({ url: u, body: JSON.parse(o.body) }));
const rowsOf = name => [...screen.getByRole('group', { name }).querySelectorAll('.list-row')];
const loadEdit = async () => {
  mount('/spells/5/edit');
  await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Moon jar'));
};
afterEach(() => { vi.unstubAllGlobals(); });

describe('Spell form', () => {
  it('posts a new spell with lines, steps, timing and a feast, then shows its page', async () => {
    stub(); mount('/spells/new');
    expect(await screen.findByRole('heading', { name: 'New spell' })).toBeInTheDocument();
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Title'), 'Sleep jar');
    expect(save).toBeEnabled();
    const kind = screen.getByLabelText('Kind');
    expect(within(kind).getAllByRole('option').map(o => o.textContent)).toEqual(['No kind', 'Protection', 'Blessing']);
    await userEvent.selectOptions(kind, '1');
    const tradBoxes = within(screen.getByRole('group', { name: 'Traditions' })).getAllByRole('checkbox');
    expect(tradBoxes.map(b => b.parentElement.textContent.trim())).toEqual(['Eclectic', 'Wiccan']);
    await userEvent.click(screen.getByLabelText('Wiccan'));

    await userEvent.click(screen.getByRole('button', { name: 'Add an ingredient or tool' }));
    let [first] = rowsOf('Ingredients and tools');
    await userEvent.type(within(first).getByLabelText('Name'), 'Salt');
    await userEvent.type(within(first).getByLabelText('Amount'), '1 pinch');
    await userEvent.type(within(first).getByLabelText('Link to a correspondence'), 'sa');
    await userEvent.click(await within(first).findByRole('button', { name: 'Sea salt' }));
    expect(within(first).queryByLabelText('Link to a correspondence')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add an ingredient or tool' }));
    const second = rowsOf('Ingredients and tools')[1];
    await userEvent.type(within(second).getByLabelText('Name'), 'Candle');

    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    await userEvent.type(screen.getByLabelText('Step 1'), 'Light it');
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    await userEvent.type(screen.getByLabelText('Step 2'), 'Blow it out');

    await userEvent.click(within(screen.getByRole('group', { name: 'Moon phases' })).getByRole('button', { name: 'Full moon' }));
    await userEvent.click(within(screen.getByRole('group', { name: 'Days' })).getByRole('button', { name: 'Friday' }));
    const feasts = screen.getByRole('group', { name: 'Sabbats and feasts' });
    expect(within(feasts).getByPlaceholderText('Find a sabbat or feast')).toBeInTheDocument();
    await userEvent.type(within(feasts).getByLabelText('Find a sabbat or feast'), 'yu');
    await userEvent.click(await within(feasts).findByRole('button', { name: 'Yule' }));
    expect(fetch.mock.calls.map(([u]) => u)).toContain('/api/correspondences?q=yu&feasts=1');
    await userEvent.type(screen.getByLabelText('Notes'), 'Keep it dark.');
    await userEvent.type(screen.getByLabelText('Source'), 'My own');

    await userEvent.click(save);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/21'));
    expect(sent('POST')).toEqual([{
      url: '/api/spells',
      body: {
        title: 'Sleep jar', purpose: '', kind_id: 1, notes: 'Keep it dark.', source: 'My own', traditions: [1], feasts: [30],
        ingredients: [{ name: 'Salt', amount: '1 pinch', correspondence_id: 9 }, { name: 'Candle', amount: '', correspondence_id: null }],
        steps: ['Light it', 'Blow it out'],
        timing: { moon: ['full'], day: ['fri'], planet: [] },
      },
    }]);
  });

  it('fills every field when editing, and keeps the link of a line whose entry is in the Trash', async () => {
    stub(); await loadEdit();
    expect(screen.getByRole('heading', { name: 'Edit spell' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kind')).toHaveValue('1');
    expect(screen.getByLabelText('Wiccan')).toBeChecked();
    const [hidden, salt] = rowsOf('Ingredients and tools');
    expect(within(hidden).getByLabelText('Name')).toHaveValue('Hidden herb');
    expect(within(hidden).getByLabelText('Amount')).toHaveValue('2 leaves');
    expect(within(salt).getByText('Sea salt')).toBeInTheDocument();
    expect(within(salt).getByLabelText('Name')).toHaveValue('Salt');
    expect(screen.getByLabelText('Step 3')).toHaveValue('Blow it out');
    expect(screen.getByRole('button', { name: 'Full moon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Moon' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Remove Yule' })).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Purpose'), ' Deep.');
    await userEvent.click(save);
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
    expect(sent('PATCH')).toEqual([{
      url: '/api/spells/5',
      body: {
        version: 4, title: 'Moon jar', purpose: 'For rest. Deep.', kind_id: 1, notes: 'Keep it dark.', source: 'My own', traditions: [1], feasts: [30],
        ingredients: [{ name: 'Hidden herb', amount: '2 leaves', correspondence_id: 7 }, { name: 'Salt', amount: '1 pinch', correspondence_id: 9 }],
        steps: ['Light the candle', 'Say the words', 'Blow it out'],
        timing: { moon: ['full'], day: [], planet: ['moon'] },
      },
    }]);
  });

  it('sends no link once the owner removes it, from a line in the Trash or a live one', async () => {
    stub(); await loadEdit();
    const [hidden, salt] = rowsOf('Ingredients and tools');
    expect(within(hidden).getByText('The linked entry is in the Trash')).toBeInTheDocument();
    await userEvent.click(within(hidden).getByRole('button', { name: 'Remove the link from Hidden herb' }));
    await userEvent.click(within(salt).getByRole('button', { name: 'Remove Sea salt' }));
    expect(within(salt).getByLabelText('Link to a correspondence')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('PATCH')).toHaveLength(1));
    expect(sent('PATCH')[0].body.ingredients).toEqual([
      { name: 'Hidden herb', amount: '2 leaves', correspondence_id: null },
      { name: 'Salt', amount: '1 pinch', correspondence_id: null },
    ]);
  });

  it('sends a spell whose kind is in the Trash with no kind', async () => {
    stub();
    spell.kind_id = null;
    mount('/spells/5/edit');
    await vi.waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Moon jar'));
    expect(screen.getByLabelText('Kind')).toHaveValue('');
    await userEvent.type(screen.getByLabelText('Notes'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('PATCH')).toHaveLength(1));
    expect(sent('PATCH')[0].body.kind_id).toBeNull();
  });

  it('sends the steps in their new order after one is moved up', async () => {
    stub(); await loadEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Move Step 2 up' }));
    expect(screen.getByLabelText('Step 1')).toHaveValue('Say the words');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(sent('PATCH')).toHaveLength(1));
    expect(sent('PATCH')[0].body.steps).toEqual(['Say the words', 'Light the candle', 'Blow it out']);
  });

  it('shows a line error under the matching row', async () => {
    stub(); await loadEdit();
    override = (url, m) => (m === 'PATCH' ? json({
      error: 'Please fix the highlighted fields.', code: 'invalid',
      details: { 'ingredients.1.name': 'Required', 'steps.2': 'Too long' },
      detailCodes: { 'ingredients.1.name': { code: 'required' }, 'steps.2': { code: 'too_long', max: 1000 } },
    }, 400) : null);
    await userEvent.type(screen.getByLabelText('Notes'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const [first, second] = rowsOf('Ingredients and tools');
    await vi.waitFor(() => expect(within(second).getByLabelText('Name')).toHaveAccessibleDescription('Required'));
    expect(within(first).getByLabelText('Name')).not.toHaveAccessibleDescription('Required');
    expect(screen.getByLabelText('Step 3')).toHaveAccessibleDescription('Keep it to 1000 characters or fewer');
    expect(router.state.location.pathname).toBe('/spells/5/edit');
  });

  it('opens the conflict dialog on a stale save, and Reload the latest fills the form from it', async () => {
    stub(); await loadEdit();
    spell = { ...stored(), version: 6, title: 'Moon jar two', kind_id: 2, traditions: [2], feasts: [], steps: ['Only step'],
      ingredients: [{ name: 'Rose', amount: null, correspondence_id: null, link: null }], timing: { moon: [], day: ['mon'], planet: [] } };
    await userEvent.type(screen.getByLabelText('Purpose'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Reload the latest'));
    expect(screen.getByLabelText('Title')).toHaveValue('Moon jar two');
    expect(screen.getByLabelText('Purpose')).toHaveValue('For rest.');
    expect(screen.getByLabelText('Kind')).toHaveValue('2');
    expect(screen.getByLabelText('Eclectic')).toBeChecked();
    expect(screen.getByLabelText('Step 1')).toHaveValue('Only step');
    expect(screen.queryByLabelText('Step 2')).not.toBeInTheDocument();
    expect(within(rowsOf('Ingredients and tools')[0]).getByLabelText('Amount')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Remove Yule' })).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Purpose'), ' y');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
    expect(sent('PATCH').at(-1).body).toMatchObject({
      version: 6, title: 'Moon jar two', purpose: 'For rest. y', kind_id: 2, traditions: [2], feasts: [], steps: ['Only step'],
      ingredients: [{ name: 'Rose', amount: '', correspondence_id: null }],
    });
  });

  it('names a line without a name by its number', async () => {
    stub(); await loadEdit();
    const [hidden] = rowsOf('Ingredients and tools');
    await userEvent.clear(within(hidden).getByLabelText('Name'));
    expect(within(hidden).getByRole('button', { name: 'Remove Line 1' })).toBeInTheDocument();
    expect(within(hidden).getByRole('button', { name: 'Remove the link from Line 1' })).toBeInTheDocument();
  });

  it('Keep mine saves over the newer spell with its version', async () => {
    stub(); await loadEdit();
    spell = { ...stored(), version: 6, title: 'Moon jar two' };
    await userEvent.type(screen.getByLabelText('Purpose'), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(await screen.findByText('Keep mine and save over it'));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
    expect(sent('PATCH')).toHaveLength(2);
    expect(sent('PATCH')[1].body).toMatchObject({ version: 6, title: 'Moon jar', purpose: 'For rest. x' });
  });

  it('keeps edits made during the first save, and saves them to the new spell', async () => {
    stub();
    override = (url, m, body) => {
      if (url === '/api/spells/21' && m === 'PATCH') return json({ ...stored(), ...body, id: 21, version: 2 });
      return null;
    };
    mount('/spells/new');
    let release;
    const real = fetch.getMockImplementation();
    fetch.mockImplementation((url, opts = {}) => (opts.method === 'POST' && !release
      ? new Promise(r => { release = () => r(real(url, opts)); })
      : real(url, opts)));
    const title = await screen.findByLabelText('Title');
    await userEvent.type(title, 'Sleep jar');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(release).toBeDefined());
    fireEvent.change(title, { target: { value: 'Sleep jar!' } });
    await act(async () => { release(); });
    expect(await screen.findByRole('heading', { name: 'Edit spell' })).toBeInTheDocument();
    expect(title).toHaveValue('Sleep jar!');
    expect(router.state.location.pathname).toBe('/spells/new');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/21'));
    expect(sent('POST')).toHaveLength(1);
    expect(sent('PATCH')).toEqual([expect.objectContaining({ url: '/api/spells/21', body: expect.objectContaining({ version: 1, title: 'Sleep jar!' }) })]);
  });

  it('asks before leaving with changes', async () => {
    stub(); await loadEdit();
    await userEvent.type(screen.getByLabelText('Title'), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
  });

  it('leaves at once when nothing changed', async () => {
    stub(); await loadEdit();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/spells/5'));
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });
});

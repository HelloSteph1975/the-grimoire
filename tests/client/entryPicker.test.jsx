import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../client/src/i18n/I18nProvider.jsx';
import { EntryPicker } from '../../client/src/components/EntryPicker.jsx';

const rows = [
  { id: 1, category_id: 1, name: 'Moonstone', is_starter: 0, starter_key: null },
  { id: 2, category_id: 1, name: 'Moonwort', is_starter: 0, starter_key: null },
  { id: 3, category_id: 1, name: 'Moth', is_starter: 0, starter_key: null },
];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });

function Harness({ start = [], excludeId, onChange, ...rest }) {
  const [v, setV] = useState(start);
  return <EntryPicker value={v} excludeId={excludeId} onChange={n => { setV(n); onChange?.(n); }} {...rest} />;
}
const type = text => fireEvent.change(screen.getByLabelText('Find an entry to link'), { target: { value: text } });
const settle = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('EntryPicker', () => {
  it('searches after 250 ms of quiet and lists results; clicking adds a chip', async () => {
    const fetchMock = vi.fn(async () => json(rows));
    vi.stubGlobal('fetch', fetchMock);
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    type('mo');
    await settle(100);
    expect(fetchMock).not.toHaveBeenCalled();
    await settle(160);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/correspondences?q=mo');
    fireEvent.click(screen.getByRole('button', { name: 'Moonstone' }));
    expect(onChange).toHaveBeenCalledWith([{ id: 1, name: 'Moonstone' }]);
    expect(screen.getByRole('button', { name: 'Remove Moonstone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Moonstone' })).toBeNull();
  });

  it('does not offer excludeId or already-chosen entries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rows)));
    render(<Harness excludeId={1} start={[{ id: 2, name: 'Moonwort' }]} />);
    type('mo');
    await settle(260);
    expect(screen.getByRole('button', { name: 'Moth' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Moonstone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Moonwort' })).toBeNull();
  });

  it('says there are no matches when every result is excluded or already chosen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rows.slice(0, 2))));
    render(<Harness excludeId={1} start={[{ id: 2, name: 'Moonwort' }]} />);
    type('moon');
    await settle(260);
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });

  it('ignores a slow first reply that arrives after a newer one', async () => {
    let releaseFirst;
    const fetchMock = vi.fn(url => (url.endsWith('q=mo')
      ? new Promise(res => { releaseFirst = () => res(json([rows[0]])); })
      : Promise.resolve(json([rows[2]]))));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness />);
    type('mo');
    await settle(260);
    type('mot');
    await settle(260);
    expect(screen.getByRole('button', { name: 'Moth' })).toBeInTheDocument();
    await act(async () => { releaseFirst(); });
    expect(screen.queryByRole('button', { name: 'Moonstone' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Moth' })).toBeInTheDocument();
  });

  it('shows an error message when the search fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ error: 'Nope', code: 'server_error' }, 500)));
    render(<Harness />);
    type('mo');
    await settle(260);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('returns focus to the input after picking and after removing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rows)));
    render(<Harness />);
    const input = screen.getByLabelText('Find an entry to link');
    type('mo');
    await settle(260);
    fireEvent.click(screen.getByRole('button', { name: 'Moonstone' }));
    expect(input).toHaveFocus();
    input.blur();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Moonstone' }));
    expect(input).toHaveFocus();
  });

  it('sorts results by the shown Spanish name before keeping the first ten', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ id: i + 1, category_id: 1, name: `Zeta ${String(i).padStart(2, '0')}`, is_starter: 0, starter_key: null }));
    many.push({ id: 20, category_id: 1, name: 'White', is_starter: 1, starter_key: 'corr.colors.white' });
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url === '/api/locales/es/ui') return json({});
      if (url === '/api/locales/es/content') return json({ 'corr.colors.white.name': 'Alba' });
      return json(many);
    }));
    render(<I18nProvider language="es"><Harness /></I18nProvider>);
    await settle(10);
    type('z');
    await settle(260);
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names[0]).toBe('Alba');
    expect(names).toHaveLength(10);
  });

  it('says No matches when a search returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    render(<Harness />);
    type('zz');
    await settle(260);
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });

  it('adds the query to its search URL', async () => {
    const fetchMock = vi.fn(async () => json(rows));
    vi.stubGlobal('fetch', fetchMock);
    render(<Harness query="&feasts=1" />);
    type('yu');
    await settle(260);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/correspondences?q=yu&feasts=1');
  });

  it('holds one entry in single mode: the input hides after a pick and comes back after removing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(rows)));
    const onChange = vi.fn();
    render(<Harness single label="Link to a correspondence" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Link to a correspondence'), { target: { value: 'mo' } });
    await settle(260);
    fireEvent.click(screen.getByRole('button', { name: 'Moonstone' }));
    expect(onChange).toHaveBeenLastCalledWith([{ id: 1, name: 'Moonstone' }]);
    expect(screen.queryByLabelText('Link to a correspondence')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Moonwort' })).toBeNull();
    const remove = screen.getByRole('button', { name: 'Remove Moonstone' });
    expect(remove).toHaveFocus();
    fireEvent.click(remove);
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.getByLabelText('Link to a correspondence')).toHaveFocus();
  });
});

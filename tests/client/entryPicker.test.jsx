import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { EntryPicker } from '../../client/src/components/EntryPicker.jsx';

const rows = [
  { id: 1, category_id: 1, name: 'Moonstone', is_starter: 0, starter_key: null },
  { id: 2, category_id: 1, name: 'Moonwort', is_starter: 0, starter_key: null },
  { id: 3, category_id: 1, name: 'Moth', is_starter: 0, starter_key: null },
];
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });

function Harness({ start = [], excludeId, onChange }) {
  const [v, setV] = useState(start);
  return <EntryPicker value={v} excludeId={excludeId} onChange={n => { setV(n); onChange?.(n); }} />;
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

  it('says No matches when a search returns nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([])));
    render(<Harness />);
    type('zz');
    await settle(260);
    expect(screen.getByRole('status')).toHaveTextContent('No matches');
  });
});

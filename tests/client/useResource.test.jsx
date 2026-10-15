import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useResource } from '../../client/src/lib/useResource.js';

// A fetch whose replies we release by hand, in any order.
function manualFetch() {
  const calls = [];
  const fn = vi.fn((url, opts = {}) => new Promise(resolve => {
    calls.push({ url, method: opts.method ?? 'GET', body: opts.body, reply: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) });
  }));
  return { fn, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('useResource', () => {
  it('loads data', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    expect(result.current.loading).toBe(true);
    await act(async () => f.calls[0].reply({ v: 1 }));
    expect(result.current).toMatchObject({ data: { v: 1 }, loading: false, error: null });
  });

  it('ignores a read that started before a save, even if it lands after', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ name: 'first', version: 1 }));
    act(() => { result.current.reload(); });               // slow read #2 starts
    let saving;
    act(() => { saving = result.current.save({ name: 'saved', version: 1 }); });
    await act(async () => { f.calls[2].reply({ name: 'saved', version: 2 }); await saving; });
    await act(async () => f.calls[1].reply({ name: 'stale', version: 1 }));  // old read lands late
    expect(result.current.data).toEqual({ name: 'saved', version: 2 });
  });

  it('ignores an older read when a newer read finishes first', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    act(() => { result.current.reload(); });
    await act(async () => f.calls[1].reply({ n: 2 }));
    await act(async () => f.calls[0].reply({ n: 1 }));
    expect(result.current.data).toEqual({ n: 2 });
  });

  it('drops replies for an old url', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result, rerender } = renderHook(({ url }) => useResource(url), { initialProps: { url: '/api/a' } });
    rerender({ url: '/api/b' });
    expect(result.current.data).toBeNull();
    await act(async () => f.calls[0].reply({ from: 'a' }));
    expect(result.current.data).toBeNull();
    await act(async () => f.calls[1].reply({ from: 'b' }));
    expect(result.current.data).toEqual({ from: 'b' });
  });

  it('shows a plain error when the server is unreachable, and recovers on reload', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    const { result } = renderHook(() => useResource('/api/x'));
    await waitFor(() => expect(result.current.error?.message).toMatch(/Can't reach The Grimoire/));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: 1 }), { status: 200 })));
    await act(async () => { await result.current.reload(); });
    expect(result.current).toMatchObject({ data: { ok: 1 }, error: null });
  });

  it('throws a 409 with the current record from save and keeps the old data', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ name: 'A', version: 1 }));
    let err;
    await act(async () => {
      const p = result.current.save({ name: 'B', version: 1 }).catch(e => { err = e; });
      f.calls[1].reply({ error: 'This was changed somewhere else.', current: { name: 'Z', version: 2 } }, 409);
      await p;
    });
    expect(err.status).toBe(409);
    expect(err.current).toEqual({ name: 'Z', version: 2 });
    expect(result.current.data).toEqual({ name: 'A', version: 1 });
  });

  it('reloads after an action', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/list'));
    await act(async () => f.calls[0].reply([1]));
    await act(async () => {
      const done = result.current.act(() => Promise.resolve('did it'));
      await vi.waitFor(() => expect(f.calls).toHaveLength(2));
      f.calls[1].reply([1, 2]);
      expect(await done).toBe('did it');
    });
    expect(result.current.data).toEqual([1, 2]);
  });

  it('does not let a read released between save start and save reply paint the screen', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ name: 'first', version: 1 }));
    act(() => { result.current.reload(); });
    let saving;
    act(() => { saving = result.current.save({ name: 'saved', version: 1 }); });
    await act(async () => f.calls[1].reply({ name: 'stale', version: 1 }));
    expect(result.current.data).toEqual({ name: 'first', version: 1 });
    await act(async () => { f.calls[2].reply({ name: 'saved', version: 2 }); await saving; });
    expect(result.current.data).toEqual({ name: 'saved', version: 2 });
  });

  it('does not paint a save from the old url onto the new url', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result, rerender } = renderHook(({ url }) => useResource(url), { initialProps: { url: '/api/a' } });
    await act(async () => f.calls[0].reply({ from: 'a' }));
    let saving;
    act(() => { saving = result.current.save({ x: 1 }); });
    rerender({ url: '/api/b' });
    await act(async () => { f.calls[1].reply({ from: 'a-saved' }); expect(await saving).toEqual({ from: 'a-saved' }); });
    expect(result.current.data).toBeNull();
    await act(async () => f.calls[2].reply({ from: 'b' }));
    expect(result.current.data).toEqual({ from: 'b' });
  });

  it('settles loading and reloads when a save fails while a read is in flight', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ v: 1 }));
    act(() => { result.current.reload(); });
    let err;
    let saving;
    act(() => { saving = result.current.save({ v: 9 }).catch(e => { err = e; }); });
    await act(async () => { f.calls[2].reply({ error: 'nope' }, 400); await saving; });
    expect(err.status).toBe(400);
    await vi.waitFor(() => expect(f.calls).toHaveLength(4));
    await act(async () => f.calls[3].reply({ v: 2 }));
    expect(result.current).toMatchObject({ data: { v: 2 }, loading: false });
  });

  it('does not set state after unmount', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ v: 1 }));
    let saving;
    act(() => { result.current.reload(); });
    act(() => { saving = result.current.save({ v: 2 }); });
    unmount();
    await act(async () => {
      f.calls[1].reply({ v: 'late' });
      f.calls[2].reply({ v: 3 });
      await expect(saving).resolves.toEqual({ v: 3 });
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('works under StrictMode and applies only the latest fetch', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'), { reactStrictMode: true });
    await vi.waitFor(() => expect(f.calls.length).toBeGreaterThanOrEqual(2));
    const last = f.calls.length - 1;
    await act(async () => f.calls[last].reply({ v: 'latest' }));
    await act(async () => { for (let i = 0; i < last; i++) f.calls[i].reply({ v: 'old' }); });
    expect(result.current).toMatchObject({ data: { v: 'latest' }, loading: false });
  });

  it('never returns the old url data on the render after a url change', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const seen = [];
    const { rerender } = renderHook(({ url }) => {
      const r = useResource(url);
      seen.push({ url, data: r.data, loading: r.loading });
      return r;
    }, { initialProps: { url: '/api/a' } });
    await act(async () => f.calls[0].reply({ from: 'a' }));
    seen.length = 0;
    rerender({ url: '/api/b' });
    expect(seen.length).toBeGreaterThan(0);
    for (const r of seen) expect(r).toMatchObject({ url: '/api/b', data: null, loading: true });
  });

  it('applies the newest save when replies arrive out of order', async () => {
    const f = manualFetch(); vi.stubGlobal('fetch', f.fn);
    const { result } = renderHook(() => useResource('/api/x'));
    await act(async () => f.calls[0].reply({ v: 0 }));
    let s1, s2;
    act(() => { s1 = result.current.save({ n: 1 }); s2 = result.current.save({ n: 2 }); });
    await act(async () => { f.calls[2].reply({ v: 'second' }); await s2; });
    await act(async () => { f.calls[1].reply({ v: 'first' }); expect(await s1).toEqual({ v: 'first' }); });
    expect(result.current.data).toEqual({ v: 'second' });
  });
});

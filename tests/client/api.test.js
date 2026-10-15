import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { api, ApiError, forgetEpoch } from '../../client/src/lib/api.js';

const reply = (body, status = 200, epoch) => new Response(JSON.stringify(body), { status, headers: epoch ? { 'X-Grimoire-Epoch': epoch } : {} });
const sentEpoch = call => call[1].headers['X-Grimoire-Epoch'];

beforeEach(() => forgetEpoch());
afterEach(() => vi.unstubAllGlobals());

describe('api epoch', () => {
  it('remembers the epoch from the first response and sends it on writes, not reads', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(reply({}, 200, 'aaa'))
      .mockResolvedValueOnce(reply({}, 200, 'bbb'))
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply({}));
    vi.stubGlobal('fetch', fetch);
    await api.get('/api/health');
    await api.get('/api/traditions');
    await api.patch('/api/traditions/1', { name: 'x', version: 1 });
    await api.del('/api/traditions/1');
    expect(sentEpoch(fetch.mock.calls[1])).toBeUndefined();
    expect(sentEpoch(fetch.mock.calls[2])).toBe('aaa');
    expect(sentEpoch(fetch.mock.calls[3])).toBe('aaa');
  });

  it('sends no epoch before the server has named one', async () => {
    const fetch = vi.fn().mockResolvedValue(reply({}));
    vi.stubGlobal('fetch', fetch);
    await api.post('/api/traditions', { name: 'x' });
    expect(sentEpoch(fetch.mock.calls[0])).toBeUndefined();
  });

  it('turns a restored 409 into an error with the message and no conflict copy', async () => {
    const message = 'Your data was restored from a backup in another window. Reload the page to continue.';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply({ error: message, restored: true }, 409, 'new')));
    const err = await api.patch('/api/traditions/1', { version: 1 }).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.message).toBe(message);
    expect(err.current).toBeNull();
    expect(err.restored).toBe(true);
  });
});

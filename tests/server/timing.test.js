import { describe, it, expect } from 'vitest';
import * as server from '../../server/services/timing.js';
import * as client from '../../client/src/lib/timing.js';

describe('timing codes', () => {
  it('match between the client and the server', () => {
    expect(client.MOON_PHASES).toEqual(server.MOON_PHASES);
    expect(client.DAYS).toEqual(server.DAYS);
    expect(client.PLANETS).toEqual(server.PLANETS);
    expect(client.TIMING).toEqual(server.TIMING);
  });
});

import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { makeTestContext } from './helpers.js';
import { alreadyRunning } from '../../server/lib/probe.js';

let t, server;
afterEach(async () => {
  await new Promise(r => (server ? server.close(r) : r()));
  server = null;
  t?.cleanup();
});

const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(s.address().port)));

describe('startup probe', () => {
  it('sees a Grimoire already answering on the port', async () => {
    t = makeTestContext();
    server = t.app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    expect(await alreadyRunning(server.address().port)).toBe(true);
  });
  it('says no when nothing answers', async () => {
    const probe = net.createServer();
    const port = await listen(probe);
    await new Promise(r => probe.close(r));
    expect(await alreadyRunning(port)).toBe(false);
  });
  it('gives up after the timeout when the port never answers', async () => {
    const sockets = [];
    server = net.createServer(socket => sockets.push(socket));
    const port = await listen(server);
    const started = Date.now();
    expect(await alreadyRunning(port, 300)).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
    for (const socket of sockets) socket.destroy();
  });
});

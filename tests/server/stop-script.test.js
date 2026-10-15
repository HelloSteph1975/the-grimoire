import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { resolvePort, stopServer } from '../../scripts/stop.js';
import { makeTestContext } from './helpers.js';

let t, server;
afterEach(() => { server?.close(); t?.cleanup(); });

describe('stop script', () => {
  it('defaults to 4209', () => {
    expect(resolvePort(fs.mkdtempSync(path.join(os.tmpdir(), 'grim-stop-')), {})).toBe(4209);
  });
  it('uses GRIMOIRE_PORT, then config.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'grim-stop-'));
    fs.writeFileSync(path.join(root, 'config.json'), JSON.stringify({ port: 4300 }));
    expect(resolvePort(root, {})).toBe(4300);
    expect(resolvePort(root, { GRIMOIRE_PORT: '4400' })).toBe(4400);
  });
  it('says not-running when nothing listens', async () => {
    // Port 1 is blocked by fetch ("bad port"), so use a port that was just free.
    const probe = net.createServer();
    await new Promise(r => probe.listen(0, '127.0.0.1', r));
    const { port } = probe.address();
    await new Promise(r => probe.close(r));
    expect(await stopServer(port, 2000, { settleMs: 10 })).toBe('not-running');
  });
  it('stops a running server', async () => {
    let stopped = false;
    t = makeTestContext({ onShutdown: () => { stopped = true; server.close(); } });
    server = t.app.listen(0, '127.0.0.1');
    await new Promise(r => server.once('listening', r));
    expect(await stopServer(server.address().port, 5000, { settleMs: 50 })).toBe('stopped');
    expect(stopped).toBe(true);
  });
});

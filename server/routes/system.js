import { Router } from 'express';
import { spawn } from 'node:child_process';
import { localOnly } from '../http.js';
import { backupNow, listBackups, rotateBackups, restoreBackup } from '../services/backup.js';
import { check } from '../validate.js';

export function systemRouter(ctx, { onShutdown }) {
  const r = Router();
  r.get('/backups', localOnly, (req, res) => res.json(listBackups(ctx.config.dataDir)));
  r.post('/backups', localOnly, (req, res) => {
    const b = backupNow(ctx.db, ctx.config.dataDir);
    rotateBackups(ctx.config.dataDir);
    res.status(201).json({ name: b.name });
  });
  r.post('/backups/restore', localOnly, (req, res) => {
    const { name } = check({ name: 'string!' }, req.body);
    const out = restoreBackup(ctx, name);
    res.set('X-Grimoire-Epoch', ctx.epoch); // the restore just changed it
    res.json(out);
  });
  r.get('/data-folder', localOnly, (req, res) => res.json({ path: ctx.config.dataDir }));
  r.post('/data-folder/open', localOnly, (req, res) => {
    if (process.platform === 'win32') spawn('explorer.exe', [ctx.config.dataDir], { detached: true, stdio: 'ignore' }).unref();
    res.json({ path: ctx.config.dataDir, opened: process.platform === 'win32' });
  });
  r.post('/shutdown', localOnly, (req, res) => {
    try {
      backupNow(ctx.db, ctx.config.dataDir);
      rotateBackups(ctx.config.dataDir);
    } catch (err) {
      console.error('Backup before shutdown failed:', err);
    }
    res.json({ ok: true });
    setImmediate(onShutdown);
  });
  return r;
}

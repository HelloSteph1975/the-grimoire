import { Router } from 'express';
import { HttpError } from '../http.js';
import { traditionsRouter } from './traditions.js';
import { trashRouter } from './trash.js';
import { systemRouter } from './system.js';
import { settingsRouter } from './settings.js';
import { localesRouter } from './locales.js';

export function apiRouter(ctx, { onShutdown }) {
  const r = Router();
  r.get('/health', (req, res) => res.json({ ok: true, version: '0.1.0', demo: ctx.config.demo }));
  r.use('/traditions', traditionsRouter(ctx));
  r.use('/trash', trashRouter(ctx));
  r.use('/settings', settingsRouter(ctx));
  r.use('/locales', localesRouter(ctx));
  r.use(systemRouter(ctx, { onShutdown }));
  r.use((req, res, next) => next(new HttpError(404, 'No such API route', undefined, { code: 'not_found' })));
  return r;
}

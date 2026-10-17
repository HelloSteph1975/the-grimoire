import { Router } from 'express';
import { HttpError } from '../http.js';
import { traditionsRouter } from './traditions.js';
import { categoriesRouter } from './categories.js';
import { correspondencesRouter } from './correspondences.js';
import { spellKindsRouter } from './spellKinds.js';
import { spellsRouter } from './spells.js';
import { ownDatesRouter } from './ownDates.js';
import { ritualsRouter } from './rituals.js';
import { followupsRouter } from './followups.js';
import { calendarRouter } from './calendar.js';
import { trashRouter } from './trash.js';
import { systemRouter } from './system.js';
import { settingsRouter } from './settings.js';
import { localesRouter } from './locales.js';

export function apiRouter(ctx, { onShutdown }) {
  const r = Router();
  r.get('/health', (req, res) => res.json({ ok: true, version: '0.1.0', demo: ctx.config.demo }));
  r.use('/traditions', traditionsRouter(ctx));
  r.use('/categories', categoriesRouter(ctx));
  r.use('/correspondences', correspondencesRouter(ctx));
  r.use('/spell-kinds', spellKindsRouter(ctx));
  r.use('/spells', spellsRouter(ctx));
  r.use('/own-dates', ownDatesRouter(ctx));
  r.use('/rituals', ritualsRouter(ctx));
  r.use('/followups', followupsRouter(ctx));
  r.use(calendarRouter(ctx));
  r.use('/trash', trashRouter(ctx));
  r.use('/settings', settingsRouter(ctx));
  r.use('/locales', localesRouter(ctx));
  r.use(systemRouter(ctx, { onShutdown }));
  r.use((req, res, next) => next(new HttpError(404, 'No such API route', undefined, { code: 'not_found' })));
  return r;
}

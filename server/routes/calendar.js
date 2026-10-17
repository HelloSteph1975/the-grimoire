import { Router } from 'express';
import { calendarItems, checkRange } from '../services/calendar.js';
import { todayPage } from '../services/today.js';
import { getSettings } from '../services/settings.js';

export function calendarRouter(ctx) {
  const r = Router();
  r.get('/calendar', (req, res) => res.json({ items: calendarItems(ctx.db, checkRange(req.query), getSettings(ctx.db)) }));
  r.get('/today', (req, res) => res.json(todayPage(ctx.db, ctx.now(), getSettings(ctx.db))));
  return r;
}

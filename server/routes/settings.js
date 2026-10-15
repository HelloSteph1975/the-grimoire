import { Router } from 'express';
import { getSettings, saveSettings } from '../services/settings.js';
import { listLocales } from '../services/locales.js';

export function settingsRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(getSettings(ctx.db)));
  r.put('/', (req, res) => {
    const languages = listLocales(ctx.config.dataDir).map(l => l.code);
    res.json(saveSettings(ctx.db, req.body, { languages }));
  });
  return r;
}

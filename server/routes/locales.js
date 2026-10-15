import { Router } from 'express';
import { listLocales, readPack } from '../services/locales.js';

export function localesRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listLocales(ctx.config.dataDir)));
  r.get('/:code/:part', (req, res) => res.json(readPack(ctx.config.dataDir, req.params.code, req.params.part)));
  return r;
}

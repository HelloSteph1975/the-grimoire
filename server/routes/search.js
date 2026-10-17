import { Router } from 'express';
import { searchAll } from '../services/search.js';

export function searchRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(searchAll(ctx.db, ctx.config.dataDir, req.query.q)));
  return r;
}

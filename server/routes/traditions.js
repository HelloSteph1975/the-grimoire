import { Router } from 'express';
import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';
import { idParam } from '../http.js';
import { reorder, reorderItems } from '../services/reorder.js';
import { traditionUsage } from '../services/correspondences.js';
import { deleteTradition, restoreTradition } from '../services/traditions.js';

export const TRADITION_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  description: { type: 'string', maxLength: 600 },
  color: { type: 'string', pattern: /^#[0-9a-f]{6}$/i, patternHint: 'Use a color like #6e1f24', hintKey: 'color' },
  sort_order: { type: 'int', min: 0, max: 10000 },
};

export function traditionsRouter(ctx) {
  const r = Router();
  r.post('/reorder', (req, res) => { reorder(ctx.db, 'traditions', reorderItems(req.body)); res.json(repos(ctx.db).traditions.list()); });
  r.get('/:id/usage', (req, res) => res.json(traditionUsage(ctx.db, idParam(req))));
  r.use(crudRouter(ctx, {
    repo: db => repos(db).traditions,
    schema: TRADITION_SCHEMA,
    starter: true,
    remove: (c, id) => deleteTradition(c.db, id),
    restore: (c, id) => restoreTradition(c.db, id),
  }));
  return r;
}

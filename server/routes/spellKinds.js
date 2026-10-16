import { Router } from 'express';
import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';
import { idParam } from '../http.js';
import { reorder, reorderItems } from '../services/reorder.js';
import { kindUsage, deleteKind, restoreKind } from '../services/spellKinds.js';

export const SPELL_KIND_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  sort_order: { type: 'int', min: 0, max: 10000 },
};

export function spellKindsRouter(ctx) {
  const r = Router();
  r.post('/reorder', (req, res) => { reorder(ctx.db, 'spell_kinds', reorderItems(req.body)); res.json(repos(ctx.db).spellKinds.list()); });
  r.get('/:id/usage', (req, res) => res.json(kindUsage(ctx.db, idParam(req))));
  r.use(crudRouter(ctx, {
    repo: db => repos(db).spellKinds,
    schema: SPELL_KIND_SCHEMA,
    starter: true,
    remove: (c, id) => deleteKind(c.db, id),
    restore: (c, id) => restoreKind(c.db, id),
  }));
  return r;
}

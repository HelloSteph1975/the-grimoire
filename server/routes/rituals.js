import { Router } from 'express';
import { idParam, notFound } from '../http.js';
import { versionOf } from './crud.js';
import { listRituals, getRitual, createRitual, updateRitual, deleteRitual, restoreRitual } from '../services/rituals.js';

export function ritualsRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listRituals(ctx.db, req.query, ctx.now())));
  r.get('/:id', (req, res) => {
    const ritual = getRitual(ctx.db, idParam(req));
    if (!ritual) throw notFound();
    res.json(ritual);
  });
  r.post('/', (req, res) => res.status(201).json(createRitual(ctx.db, req.body)));
  r.patch('/:id', (req, res) => res.json(updateRitual(ctx.db, idParam(req), req.body, versionOf(req.body))));
  r.delete('/:id', (req, res) => { deleteRitual(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreRitual(ctx.db, idParam(req))));
  return r;
}

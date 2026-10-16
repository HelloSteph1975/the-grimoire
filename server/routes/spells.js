import { Router } from 'express';
import { idParam, notFound, queryId } from '../http.js';
import { versionOf } from './crud.js';
import { listSpells, getSpell, createSpell, updateSpell, deleteSpell, restoreSpell } from '../services/spells.js';

export function spellsRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listSpells(ctx.db, {
    kind: queryId(req.query.kind),
    tradition: queryId(req.query.tradition),
    q: typeof req.query.q === 'string' ? req.query.q : '',
  })));
  r.get('/:id', (req, res) => {
    const spell = getSpell(ctx.db, idParam(req));
    if (!spell) throw notFound();
    res.json(spell);
  });
  r.post('/', (req, res) => res.status(201).json(createSpell(ctx.db, req.body)));
  r.patch('/:id', (req, res) => {
    const id = idParam(req);
    res.json(updateSpell(ctx.db, id, req.body, versionOf(req.body)));
  });
  r.delete('/:id', (req, res) => { deleteSpell(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreSpell(ctx.db, idParam(req))));
  return r;
}

import { Router } from 'express';
import { idParam, notFound, queryId } from '../http.js';
import { versionOf } from './crud.js';
import { listEntries, getEntry, createEntry, updateEntry, deleteEntry, restoreEntry, usedInSpells } from '../services/correspondences.js';

export function correspondencesRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listEntries(ctx.db, ctx.config.dataDir, {
    category: queryId(req.query.category),
    tradition: queryId(req.query.tradition),
    feasts: req.query.feasts === '1',
    q: typeof req.query.q === 'string' ? req.query.q : '',
  })));
  r.get('/:id', (req, res) => {
    const entry = getEntry(ctx.db, idParam(req));
    if (!entry) throw notFound();
    res.json(entry);
  });
  r.get('/:id/spells', (req, res) => res.json(usedInSpells(ctx.db, idParam(req))));
  r.post('/', (req, res) => res.status(201).json(createEntry(ctx.db, req.body)));
  r.patch('/:id', (req, res) => {
    const id = idParam(req);
    res.json(updateEntry(ctx.db, id, req.body, versionOf(req.body)));
  });
  r.delete('/:id', (req, res) => { deleteEntry(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreEntry(ctx.db, idParam(req))));
  return r;
}

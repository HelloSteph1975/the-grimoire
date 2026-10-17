import { Router } from 'express';
import { idParam, notFound } from '../http.js';
import { versionOf } from './crud.js';
import { listJournal, journalTags, getJournal, createJournal, updateJournal, deleteJournal, restoreJournal } from '../services/journal.js';

export function journalRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listJournal(ctx.db, req.query)));
  r.get('/tags', (req, res) => res.json(journalTags(ctx.db)));
  r.get('/:id', (req, res) => {
    const entry = getJournal(ctx.db, idParam(req));
    if (!entry) throw notFound();
    res.json(entry);
  });
  r.post('/', (req, res) => res.status(201).json(createJournal(ctx.db, req.body)));
  r.patch('/:id', (req, res) => res.json(updateJournal(ctx.db, idParam(req), req.body, versionOf(req.body))));
  r.delete('/:id', (req, res) => { deleteJournal(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreJournal(ctx.db, idParam(req))));
  return r;
}

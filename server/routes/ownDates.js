import { Router } from 'express';
import { idParam, notFound } from '../http.js';
import { versionOf } from './crud.js';
import { listOwnDates, getOwnDate, createOwnDate, updateOwnDate, deleteOwnDate, restoreOwnDate } from '../services/ownDates.js';

export function ownDatesRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listOwnDates(ctx.db)));
  r.get('/:id', (req, res) => {
    const date = getOwnDate(ctx.db, idParam(req));
    if (!date) throw notFound();
    res.json(date);
  });
  r.post('/', (req, res) => res.status(201).json(createOwnDate(ctx.db, req.body)));
  r.patch('/:id', (req, res) => res.json(updateOwnDate(ctx.db, idParam(req), req.body, versionOf(req.body))));
  r.delete('/:id', (req, res) => { deleteOwnDate(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreOwnDate(ctx.db, idParam(req))));
  return r;
}

import { Router } from 'express';
import { idParam, queryId } from '../http.js';
import { versionOf } from './crud.js';
import { listFollowups, createFollowup, updateFollowup, deleteFollowup, restoreFollowup } from '../services/followups.js';

export function followupsRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listFollowups(ctx.db, queryId(req.query.ritual))));
  r.post('/', (req, res) => res.status(201).json(createFollowup(ctx.db, req.body)));
  r.patch('/:id', (req, res) => res.json(updateFollowup(ctx.db, idParam(req), req.body, versionOf(req.body))));
  r.delete('/:id', (req, res) => { deleteFollowup(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreFollowup(ctx.db, idParam(req))));
  return r;
}

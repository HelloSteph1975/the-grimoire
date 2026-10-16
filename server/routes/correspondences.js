import { Router } from 'express';
import { HttpError, idParam, notFound } from '../http.js';
import { versionOf } from './crud.js';
import { listEntries, getEntry, createEntry, updateEntry, deleteEntry, restoreEntry } from '../services/correspondences.js';

// An optional id in the query string: absent or empty means no filter.
function queryId(v) {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  if (typeof v !== 'string' || !Number.isInteger(n) || n < 1) throw new HttpError(400, 'Bad id', undefined, { code: 'bad_id' });
  return n;
}

export function correspondencesRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listEntries(ctx.db, ctx.config.dataDir, {
    category: queryId(req.query.category),
    tradition: queryId(req.query.tradition),
    q: typeof req.query.q === 'string' ? req.query.q : '',
  })));
  r.get('/:id', (req, res) => {
    const entry = getEntry(ctx.db, idParam(req));
    if (!entry) throw notFound();
    res.json(entry);
  });
  r.post('/', (req, res) => res.status(201).json(createEntry(ctx.db, req.body)));
  r.patch('/:id', (req, res) => {
    const id = idParam(req);
    res.json(updateEntry(ctx.db, id, req.body, versionOf(req.body)));
  });
  r.delete('/:id', (req, res) => { deleteEntry(ctx.db, idParam(req)); res.json({ ok: true }); });
  r.post('/:id/restore', (req, res) => res.json(restoreEntry(ctx.db, idParam(req))));
  return r;
}

import { Router } from 'express';
import { check } from '../validate.js';
import { HttpError, idParam, notFound } from '../http.js';
import { transaction } from '../db/connection.js';

export function versionOf(body) {
  const v = body?.version;
  if (!Number.isInteger(v) || v < 1) throw new HttpError(400, 'Please reload and try again.', { version: 'Missing version' }, { code: 'missing_version' });
  return v;
}

// Shared routes for one kind of record. `starter: true` drops the Starter tag on edit.
// `remove(ctx, id)` and `restore(ctx, id)` replace the plain soft delete and restore; each runs its own transaction.
export function crudRouter(ctx, { repo, schema, starter = false, beforeDelete, remove, restore }) {
  const r = Router();
  const R = () => repo(ctx.db);

  r.get('/', (req, res) => res.json(R().list()));

  r.get('/:id', (req, res) => {
    const row = R().get(idParam(req));
    if (!row) throw notFound();
    res.json(row);
  });

  r.post('/', (req, res) => {
    const data = check(schema, req.body);
    res.status(201).json(transaction(ctx.db, () => R().create(data)));
  });

  r.patch('/:id', (req, res) => {
    const id = idParam(req);
    const version = versionOf(req.body);
    const data = check(schema, req.body, { partial: true });
    const row = transaction(ctx.db, () => {
      // A save that changes nothing keeps the Starter tag.
      if (starter) {
        const stored = R().get(id);
        if (stored && Object.keys(data).some(k => data[k] !== stored[k])) data.is_starter = 0;
      }
      return R().update(id, data, version);
    });
    if (!row) throw notFound();
    res.json(row);
  });

  r.delete('/:id', (req, res) => {
    const id = idParam(req);
    if (remove) { remove(ctx, id); return res.json({ ok: true }); }
    transaction(ctx.db, () => {
      const row = R().get(id);
      if (!row) throw notFound();
      beforeDelete?.(ctx, row);
      R().remove(id);
    });
    res.json({ ok: true });
  });

  r.post('/:id/restore', (req, res) => {
    const id = idParam(req);
    if (restore) return res.json(restore(ctx, id));
    const ok = transaction(ctx.db, () => R().restore(id));
    if (!ok) throw notFound('Nothing to restore');
    res.json(R().get(id));
  });

  return r;
}

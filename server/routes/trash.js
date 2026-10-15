import { Router } from 'express';
import { idParam, localOnly } from '../http.js';
import { listTrash, restoreFromTrash, deleteForever, emptyTrash } from '../services/trash.js';

export function trashRouter(ctx) {
  const r = Router();
  r.get('/', (req, res) => res.json(listTrash(ctx.db)));
  r.post('/empty', localOnly, (req, res) => res.json(emptyTrash(ctx)));
  r.post('/:type/:id/restore', (req, res) => res.json(restoreFromTrash(ctx.db, req.params.type, idParam(req))));
  r.delete('/:type/:id', (req, res) => res.json({ ok: deleteForever(ctx.db, req.params.type, idParam(req)) }));
  return r;
}

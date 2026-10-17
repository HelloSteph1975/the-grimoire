import { Router } from 'express';
import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';
import { idParam } from '../http.js';
import { reorder, reorderItems } from '../services/reorder.js';
import { KIND_SCHEMA } from '../services/kinds.js';
import { journalKindUsage, deleteJournalKind, restoreJournalKind } from '../services/journalKinds.js';

export function journalKindsRouter(ctx) {
  const r = Router();
  r.post('/reorder', (req, res) => { reorder(ctx.db, 'journal_kinds', reorderItems(req.body)); res.json(repos(ctx.db).journalKinds.list()); });
  r.get('/:id/usage', (req, res) => res.json(journalKindUsage(ctx.db, idParam(req))));
  r.use(crudRouter(ctx, {
    repo: db => repos(db).journalKinds,
    schema: KIND_SCHEMA,
    starter: true,
    remove: (c, id) => deleteJournalKind(c.db, id),
    restore: (c, id) => restoreJournalKind(c.db, id),
  }));
  return r;
}

import { Router } from 'express';
import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';
import { idParam } from '../http.js';
import { reorder, reorderItems } from '../services/reorder.js';
import { categoryUsage, deleteCategory, restoreCategory } from '../services/categories.js';

export const CATEGORY_ICONS = ['gem', 'palette', 'calendar-days', 'orbit', 'flame', 'moon', 'sparkles', 'cross', 'sun', 'leaf', 'book-open', 'star'];

export const CATEGORY_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  icon: { type: CATEGORY_ICONS, nullable: false },
};

export function categoriesRouter(ctx) {
  const r = Router();
  r.post('/reorder', (req, res) => { reorder(ctx.db, 'categories', reorderItems(req.body)); res.json(repos(ctx.db).categories.list()); });
  r.get('/:id/usage', (req, res) => res.json(categoryUsage(ctx.db, idParam(req))));
  r.use(crudRouter(ctx, {
    repo: db => repos(db).categories,
    schema: CATEGORY_SCHEMA,
    starter: true,
    remove: (c, id) => deleteCategory(c.db, id),
    restore: (c, id) => restoreCategory(c.db, id),
  }));
  return r;
}

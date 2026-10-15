import { crudRouter } from './crud.js';
import { repos } from '../db/repos.js';

export const TRADITION_SCHEMA = {
  name: { type: 'string!', maxLength: 60 },
  description: { type: 'string', maxLength: 600 },
  color: { type: 'string', pattern: /^#[0-9a-f]{6}$/i, patternHint: 'Use a color like #6e1f24', hintKey: 'color' },
  sort_order: { type: 'int', min: 0, max: 10000 },
};

export const traditionsRouter = ctx => crudRouter(ctx, { repo: db => repos(db).traditions, schema: TRADITION_SCHEMA, starter: true });

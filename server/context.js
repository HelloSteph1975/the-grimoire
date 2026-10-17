import { openDb } from './db/connection.js';
import { seedStarter } from './services/starter.js';
import { readEpoch } from './services/epoch.js';

// Opening (and reopening after a restore) always tops up starter content.
function open(dataDir, contentDir) {
  const db = openDb(dataDir);
  seedStarter(db, contentDir ? { content: contentDir } : undefined);
  return db;
}

export function createContext(config) {
  const ctx = {
    config,
    now: config.now ?? (() => new Date()),
    db: open(config.dataDir, config.contentDir),
    epoch: readEpoch(config.dataDir),
    reopen() { ctx.db = open(config.dataDir, config.contentDir); return ctx.db; },
  };
  return ctx;
}

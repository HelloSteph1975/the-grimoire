import { openDb } from './db/connection.js';
import { seedStarter } from './services/starter.js';
import { readEpoch } from './services/epoch.js';

// Opening (and reopening after a restore) always tops up starter content.
function open(dataDir) {
  const db = openDb(dataDir);
  seedStarter(db);
  return db;
}

export function createContext(config) {
  const ctx = {
    config,
    db: open(config.dataDir),
    epoch: readEpoch(config.dataDir),
    reopen() { ctx.db = open(config.dataDir); return ctx.db; },
  };
  return ctx;
}

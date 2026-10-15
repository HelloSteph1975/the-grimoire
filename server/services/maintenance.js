import { ensureTodayBackup, rotateBackups } from './backup.js';

// Startup housekeeping. A failed step is logged and the app still runs.
export function runMaintenance(ctx) {
  const steps = [
    ['Start-of-day backup', () => ensureTodayBackup(ctx.db, ctx.config.dataDir)],
    ['Tidying old backups', () => rotateBackups(ctx.config.dataDir)],
  ];
  for (const [label, fn] of steps) {
    try { fn(); } catch (err) { console.error(`${label} failed (the app will still run):`, err); }
  }
}

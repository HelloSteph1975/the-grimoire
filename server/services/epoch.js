import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// The data "epoch" changes on every restore. It lives outside the database, so restoring
// a backup can never roll it back. Pages send it with every write; a page loaded before a
// restore sends the old one and is told to reload instead of saving over different records.
const fileOf = dataDir => path.join(dataDir, 'epoch.txt');

export function newEpoch(dataDir) {
  const epoch = randomBytes(16).toString('hex');
  try {
    fs.writeFileSync(fileOf(dataDir), epoch);
  } catch (err) {
    // The new value still guards open pages until the app restarts.
    console.error('Could not save epoch.txt:', err.message);
  }
  return epoch;
}

export function readEpoch(dataDir) {
  let epoch = '';
  try { epoch = fs.readFileSync(fileOf(dataDir), 'utf8').trim(); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  return epoch || newEpoch(dataDir);
}

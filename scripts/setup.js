// Run via "npm run setup" (installs, builds, then this). Add "-- --windows" (or use
// "npm run install-windows") to also register the scheduled tasks and Desktop shortcut.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { defaultDataDir, DEFAULT_PORT, readConfigFile } from '../server/config.js';
import { ensureDataDirs } from '../server/db/connection.js';

const root = path.resolve(import.meta.dirname, '..');
const cfgPath = path.join(root, 'config.json');
if (!fs.existsSync(cfgPath)) {
  fs.writeFileSync(cfgPath, JSON.stringify({ dataDir: defaultDataDir(false), port: DEFAULT_PORT }, null, 2));
  console.log(`Wrote ${cfgPath}`);
}
let dataDir;
try {
  dataDir = readConfigFile(cfgPath).dataDir || defaultDataDir(false);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
ensureDataDirs(dataDir);
console.log(`Data folder ready: ${dataDir}`);

if (process.argv.includes('--windows')) {
  if (process.platform !== 'win32') {
    console.error('--windows only works on Windows.');
    process.exit(1);
  }
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'windows', 'install-windows.ps1')], { stdio: 'inherit' });
} else if (process.platform === 'win32') {
  console.log('Next step: run "npm run install-windows" to add the 5:30 AM / 9 PM schedule and the Desktop shortcut.');
} else {
  console.log(`Start the app with "npm start" and open http://localhost:${DEFAULT_PORT}.`);
}

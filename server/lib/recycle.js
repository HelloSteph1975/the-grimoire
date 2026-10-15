import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Sends a file to the Windows Recycle Bin so it can be brought back. If that isn't
// possible (another OS, or PowerShell is blocked), moves it to backups\_old instead.
// The path goes through an environment variable, never into the command text.
export function sendToRecycleBin(file, { dataDir }) {
  if (process.platform === 'win32') {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($env:GRIMOIRE_RECYCLE, 'OnlyErrorDialogs', 'SendToRecycleBin')"],
      { env: { ...process.env, GRIMOIRE_RECYCLE: file }, stdio: 'ignore', timeout: 30000 });
      if (!fs.existsSync(file)) return 'recycled';
    } catch (err) {
      console.error('Could not send a backup to the Recycle Bin; moving it to backups\\_old instead:', err.message);
    }
  }
  const old = path.join(dataDir, 'backups', '_old');
  fs.mkdirSync(old, { recursive: true });
  fs.renameSync(file, path.join(old, path.basename(file)));
  return 'moved';
}

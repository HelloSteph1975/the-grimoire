import { execSync } from 'node:child_process';

export default function globalSetup() {
  execSync('npx vite build --outDir dist-test', { stdio: 'inherit' });
}

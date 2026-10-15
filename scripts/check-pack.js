import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.js';

const APP_ROOT = path.join(import.meta.dirname, '..');

const readJson = (file, fallback) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);

// The content keys a starter row needs in content.json.
function expectedContentKeys(root) {
  const dir = path.join(root, 'server', 'content');
  const keys = [];
  const add = (rows, fields) => {
    for (const r of rows) if (r.starter_key) for (const f of fields) keys.push(`${r.starter_key}.${f}`);
  };
  add(readJson(path.join(dir, 'traditions.json'), []), ['name', 'description']);
  add(readJson(path.join(dir, 'categories.json'), []), ['name']);
  const folder = path.join(dir, 'correspondences');
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter(f => f.endsWith('.json')).sort() : [];
  for (const f of files) add(readJson(path.join(folder, f), []), ['name', 'summary', 'body', 'keywords']);
  return keys;
}

export function checkPack({ dataDir, code, root = APP_ROOT }) {
  const packDir = path.join(dataDir, 'locales', code);
  const ui = readJson(path.join(packDir, 'ui.json'), {});
  const content = readJson(path.join(packDir, 'content.json'), {});
  const en = readJson(path.join(root, 'client', 'src', 'i18n', 'en.json'), {});
  const enKeys = Object.keys(en).filter(k => k !== '_name');
  const wanted = expectedContentKeys(root);
  const enSet = new Set(enKeys);
  const wantedSet = new Set(wanted);
  return {
    missingUi: enKeys.filter(k => !(k in ui)),
    missingContent: wanted.filter(k => !(k in content)),
    extra: [
      ...Object.keys(ui).filter(k => k !== '_name' && !enSet.has(k)),
      ...Object.keys(content).filter(k => !wantedSet.has(k)),
    ],
  };
}

function main() {
  const code = process.argv[2];
  if (!code) {
    console.log('Usage: npm run check-pack -- <language code>, for example: npm run check-pack -- es');
    process.exit(1);
  }
  const { dataDir } = loadConfig({ root: APP_ROOT });
  const packDir = path.join(dataDir, 'locales', code);
  if (!fs.existsSync(packDir)) {
    console.log(`No language pack found at ${packDir}`);
    process.exit(1);
  }
  const r = checkPack({ dataDir, code });
  const show = (title, list) => {
    console.log(`${title}: ${list.length}`);
    for (const k of list.slice(0, 50)) console.log(`  ${k}`);
    if (list.length > 50) console.log(`  ...and ${list.length - 50} more`);
  };
  show('Missing from ui.json', r.missingUi);
  show('Missing from content.json', r.missingContent);
  show('Not used by the app', r.extra);
  process.exit(r.missingUi.length || r.missingContent.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

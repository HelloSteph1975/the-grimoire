import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../server/config.js';
import { CODE } from '../server/services/locales.js';

const APP_ROOT = path.join(import.meta.dirname, '..');

class BadJson extends Error {}
function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new BadJson(`${file} is not valid JSON`); }
}
// Every value must be text with something in it (content keywords are one comma-separated string).
const badValues = obj => Object.entries(obj).filter(([k, v]) => k !== '_name' && (typeof v !== 'string' || !v.trim())).map(([k]) => k);

// The content keys a starter row needs in content.json.
function expectedContentKeys(root) {
  const dir = path.join(root, 'server', 'content');
  const keys = [];
  const add = (rows, fields) => {
    for (const r of rows) if (r.starter_key) for (const f of fields) keys.push(`${r.starter_key}.${f}`);
  };
  add(readJson(path.join(dir, 'traditions.json'), []), ['name', 'description']);
  add(readJson(path.join(dir, 'categories.json'), []), ['name']);
  add(readJson(path.join(dir, 'spell-kinds.json'), []), ['name']);
  const folder = path.join(dir, 'correspondences');
  const files = fs.existsSync(folder) ? fs.readdirSync(folder).filter(f => f.endsWith('.json')).sort() : [];
  for (const f of files) add(readJson(path.join(folder, f), []), ['name', 'summary', 'body', 'keywords']);
  return keys;
}

// A pack may add plural forms (`<key>.one`, `<key>.other`) to any key the app uses.
const PLURAL = /\.(one|other)$/;

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
      ...Object.keys(ui).filter(k => k !== '_name' && !enSet.has(k) && !enSet.has(k.replace(PLURAL, ''))),
      ...Object.keys(content).filter(k => !wantedSet.has(k)),
    ],
    bad: [...badValues(ui), ...badValues(content)],
  };
}

function main() {
  const code = process.argv[2];
  if (!code) {
    console.log('Usage: npm run check-pack -- <language code>, for example: npm run check-pack -- es');
    process.exit(1);
  }
  if (!CODE.test(code)) {
    console.log(`"${code}" is not a language code. Use one like es or pt-BR.`);
    process.exit(1);
  }
  const { dataDir } = loadConfig({ root: APP_ROOT });
  const packDir = path.join(dataDir, 'locales', code);
  if (!fs.existsSync(packDir)) {
    console.log(`No language pack found at ${packDir}`);
    process.exit(1);
  }
  let r;
  try {
    r = checkPack({ dataDir, code });
  } catch (err) {
    if (!(err instanceof BadJson)) throw err;
    console.log(err.message);
    process.exit(1);
  }
  const show = (title, list) => {
    console.log(`${title}: ${list.length}`);
    for (const k of list.slice(0, 50)) console.log(`  ${k}`);
    if (list.length > 50) console.log(`  ...and ${list.length - 50} more`);
  };
  show('Missing from ui.json', r.missingUi);
  show('Missing from content.json', r.missingContent);
  show('Not used by the app', r.extra);
  show('Empty or not text', r.bad);
  process.exit(r.missingUi.length || r.missingContent.length || r.bad.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

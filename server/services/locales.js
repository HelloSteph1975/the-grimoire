import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../http.js';

export const CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;
const PARTS = new Set(['ui', 'content']);
const dirOf = dataDir => path.join(dataDir, 'locales');

function readJson(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('must hold a JSON object');
  return data;
}

// English is built in. A pack counts only if its folder name is a language code and
// its ui.json parses and names the language in "_name". Broken packs are skipped.
export function listLocales(dataDir) {
  const out = [{ code: 'en', name: 'English' }];
  const dir = dirOf(dataDir);
  if (!fs.existsSync(dir)) return out;
  for (const code of fs.readdirSync(dir).sort()) {
    if (!CODE.test(code) || code === 'en') continue;
    const file = path.join(dir, code, 'ui.json');
    if (!fs.existsSync(file)) continue;
    try {
      const ui = readJson(file);
      if (typeof ui._name !== 'string' || !ui._name.trim()) throw new Error('"_name" is missing');
      out.push({ code, name: ui._name.trim() });
    } catch (err) {
      console.warn(`Skipping the language pack in ${path.join(dir, code)}: ${err.message}`);
    }
  }
  return out;
}

export function readPack(dataDir, code, part) {
  if (!PARTS.has(part) || code === 'en' || !listLocales(dataDir).some(l => l.code === code)) throw new HttpError(404, 'No such language pack', undefined, { code: 'not_found' });
  const file = path.join(dirOf(dataDir), code, `${part}.json`);
  if (!fs.existsSync(file)) return {};
  try {
    return readJson(file);
  } catch (err) {
    console.warn(`Could not read ${file}: ${err.message}`);
    return {};
  }
}

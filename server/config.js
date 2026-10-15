import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PORT = 4209;
export const DEMO_PORT = 4211;

export function defaultDataDir(demo = false) {
  return path.join(os.homedir(), 'Documents', demo ? 'The Grimoire Demo Data' : 'The Grimoire Data');
}

export function parsePort(value, source) {
  const s = String(value).trim();
  const n = /^\d+$/.test(s) ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`The port in ${source} must be a whole number from 1 to 65535 (got ${JSON.stringify(value)}).`);
  }
  return n;
}

export function readConfigFile(file) {
  if (!fs.existsSync(file)) return {};
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${file} is not valid JSON (${err.message}). If it has a Windows path, use double backslashes (\\\\), like "D:\\\\Grimoire Data".`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`${file} must hold a JSON object, like { "port": 4209 }.`);
  return data;
}

export function loadConfig({ env = process.env, root = process.cwd(), demo = false } = {}) {
  if (demo) {
    const port = env.GRIMOIRE_DEMO_PORT ? parsePort(env.GRIMOIRE_DEMO_PORT, 'GRIMOIRE_DEMO_PORT') : DEMO_PORT;
    return { dataDir: env.GRIMOIRE_DEMO_DATA_DIR || defaultDataDir(true), port, demo: true };
  }
  const p = path.join(root, 'config.json');
  const file = readConfigFile(p);
  let port = DEFAULT_PORT;
  if (env.GRIMOIRE_PORT) port = parsePort(env.GRIMOIRE_PORT, 'GRIMOIRE_PORT');
  else if (file.port !== undefined && file.port !== null) port = parsePort(file.port, p);
  return { dataDir: env.GRIMOIRE_DATA_DIR || file.dataDir || defaultDataDir(false), port, demo: false };
}

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import pngToIco from 'png-to-ico';

const root = path.resolve(import.meta.dirname, '..');
const svg = fs.readFileSync(path.join(root, 'client/public/favicon.svg'), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
const pngs = [];
for (const size of [16, 32, 48, 256]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg', `<svg width="${size}" height="${size}"`)}</body></html>`);
  pngs.push(await page.screenshot({ omitBackground: true }));
}
await browser.close();
fs.writeFileSync(path.join(root, 'windows/the-grimoire.ico'), await pngToIco(pngs));
console.log('Wrote windows/the-grimoire.ico');

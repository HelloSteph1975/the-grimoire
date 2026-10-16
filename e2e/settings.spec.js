import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => {
  dir = freshDataDir();
  const es = path.join(dir, 'locales', 'es');
  fs.mkdirSync(es, { recursive: true });
  fs.writeFileSync(path.join(es, 'ui.json'), JSON.stringify({ _name: 'Español', 'nav.today': 'Hoy', 'nav.settings': 'Ajustes', 'common.save': 'Guardar', 'settings.language': 'Idioma' }));
  fs.writeFileSync(path.join(es, 'content.json'), JSON.stringify({ 'tradition.wiccan.name': 'Wicca' }));
  proc = await startServer(dir);
});
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

test('switching to Book & Folk and Spanish sticks after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByLabel('Language').selectOption('es');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('link', { name: 'Hoy' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await expect(page.locator('.papel-picado')).toBeVisible();
  await expect(page.getByText('Wicca', { exact: true })).toBeVisible();

  await stopServer(proc);
  proc = await startServer(dir);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Ajustes' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await page.screenshot({ path: 'test-results/book-folk-es.png', fullPage: true });
});

test('Settings rows wrap on a phone: nothing sticks out or overlaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Traditions' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categories' })).toBeVisible();
  const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(widths.page).toBeLessThanOrEqual(widths.screen);
  // Evidence for the PR: docs/evidence/stage-3/settings-rows-phone-<before|after>.png.
  // Only Traditions through Spell kinds: Backups shows the data folder path, which can hold a user name.
  const out = process.env.EVIDENCE_SHOT;
  if (out) {
    await expect(page.getByRole('heading', { name: 'Spell kinds' })).toBeVisible();
    const clip = await page.evaluate(() => {
      const section = name => [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent === name).getBoundingClientRect();
      const top = section('Traditions').top + window.scrollY - 8;
      const bottom = section('Spell kinds').bottom + window.scrollY + 8;
      return { x: 0, y: top, width: window.innerWidth, height: bottom - top };
    });
    await page.screenshot({ path: out, fullPage: true, clip });
  }
});

test('Old Book is the default look', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'old-book');
  await expect(page.locator('.papel-picado')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/old-book-en.png', fullPage: true });
});

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

test('Old Book is the default look', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'old-book');
  await expect(page.locator('.papel-picado')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/old-book-en.png', fullPage: true });
});

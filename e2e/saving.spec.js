import { test, expect } from '@playwright/test';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

const restart = async () => { await stopServer(proc); proc = await startServer(dir); };

test('a new tradition and an edit survive a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Kitchen witchery');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Kitchen witchery')).toBeVisible();

  const row = page.locator('li', { hasText: 'Kitchen witchery' });
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Description').fill('Stove and table');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Stove and table')).toBeVisible();

  await restart();
  await page.reload();
  await expect(page.locator('li', { hasText: 'Kitchen witchery' })).toContainText('Stove and table');
});

test('delete, restore from the Trash, and it is still there after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Moved Wiccan to the Trash.')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Wiccan' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Trash' }).click();
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
  await restart();
  await page.goto('/settings');
  await expect(page.locator('li', { hasText: 'Wiccan' })).toBeVisible();
});

test('a starter tradition deleted forever stays gone after a restart', async ({ page }) => {
  await page.goto('/settings');
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('link', { name: 'Trash' }).click();
  await page.locator('li', { hasText: 'Wiccan' }).getByRole('button', { name: 'Delete forever' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete forever' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
  await restart();
  await page.goto('/settings');
  await expect(page.getByText('Eclectic')).toBeVisible();
  await expect(page.locator('li', { hasText: 'Wiccan' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
});

test('back up, change something, restore, and the change is gone', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText(/Backup made/)).toBeVisible();
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('After the backup');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('After the backup')).toBeVisible();
  await page.locator('li', { hasText: /^grimoire-/ }).first().getByRole('button', { name: 'Restore' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('li', { hasText: /^pre-restore-/ }).first()).toBeVisible();
  await expect(page.getByText('Eclectic')).toBeVisible();
  await expect(page.getByText('After the backup')).toHaveCount(0);
});

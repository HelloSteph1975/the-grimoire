import { test, expect } from '@playwright/test';
import { startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

test('two windows: the second save gets the conflict dialog, and Keep mine wins', async ({ browser }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const p of [a, b]) {
    await p.goto('/settings');
    await p.locator('li', { hasText: 'Eclectic' }).getByRole('button', { name: 'Edit' }).click();
  }
  await a.getByLabel('Description').fill('From window A');
  await a.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(a.getByText('From window A')).toBeVisible();

  await b.getByLabel('Description').fill('From window B');
  await b.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(b.getByText('This was changed somewhere else')).toBeVisible();
  await b.getByRole('button', { name: 'Keep mine and save over it' }).click();
  await expect(b.getByText('From window B')).toBeVisible();
  await a.reload();
  await expect(a.getByText('From window B')).toBeVisible();
});

test('an unsaved change asks before leaving', async ({ page }) => {
  await page.goto('/settings');
  await page.getByLabel('Hemisphere').selectOption('south');
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Today' }).click();
  await expect(page.getByText('Leave without saving?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel('Hemisphere')).toHaveValue('south');
});

test('a late, out-of-date list reply does not hide a new tradition', async ({ page }) => {
  let first = true;
  await page.route('**/api/traditions', async route => {
    if (route.request().method() === 'GET' && first) {
      first = false;
      const res = await route.fetch();
      await new Promise(r => setTimeout(r, 2500)); // the first load lands after the save
      return route.fulfill({ response: res });
    }
    return route.continue();
  });
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Arrived during a slow load');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Arrived during a slow load')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByText('Arrived during a slow load')).toBeVisible();
  expect(first).toBe(false); // the delayed first load really happened
});

test('when the server is closed, loads say so and Try again works once it is back', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Eclectic')).toBeVisible();
  await stopServer(proc);
  await page.getByRole('link', { name: 'Trash' }).click();
  await expect(page.getByText(/Can't reach The Grimoire/)).toBeVisible();
  proc = await startServer(dir);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();
});

test('when the server is closed, a save keeps the form filled in', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Add a tradition' }).click();
  await page.getByLabel('Name').fill('Not lost');
  await stopServer(proc);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('alert')).toContainText("Can't reach The Grimoire");
  await expect(page.getByLabel('Name')).toHaveValue('Not lost');
  proc = await startServer(dir);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('li', { hasText: 'Not lost' })).toBeVisible();
});

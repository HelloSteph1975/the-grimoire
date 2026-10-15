import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { BASE, startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

const restart = async () => { await stopServer(proc); proc = await startServer(dir); };

// Starter entries are empty, but the starter categories and traditions exist. Tests make their own entries (and extra categories) through the API.
async function call(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const makeCategory = (name, icon = 'star') => call('POST', '/api/categories', { name, icon });
const makeEntry = (category_id, name, extra = {}) => call('POST', '/api/correspondences', { category_id, name, ...extra });

test('add an entry, link it, restart, and both pages show it', async ({ page }) => {
  const colors = (await call('GET', '/api/categories')).find(c => c.name === 'Colors');
  const other = await makeEntry(colors.id, 'Indigo', { summary: 'A deep blue' });

  await page.goto('/correspondences');
  await page.getByRole('link', { name: 'Add an entry' }).click();
  await page.getByLabel('Name').fill('Crimson');
  await page.getByLabel('Category').selectOption({ label: 'Colors' });
  await page.getByLabel('Summary').fill('A warm red');
  const keywords = page.getByRole('textbox', { name: 'Keywords' });
  await keywords.fill('red');
  await keywords.press('Enter');
  await keywords.fill('warmth');
  await keywords.press('Enter');
  await page.getByLabel('Month').selectOption('12');
  await page.getByLabel('Day').selectOption('12');
  await page.getByLabel('Wiccan').check();
  await page.getByLabel('Find an entry to link').fill('Indigo');
  await page.getByRole('button', { name: 'Indigo' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Crimson' })).toBeVisible();

  await restart();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Crimson' })).toBeVisible();
  await expect(page.getByText('A warm red')).toBeVisible();
  await expect(page.getByText('Colors')).toBeVisible();
  await expect(page.getByText('December 12')).toBeVisible();
  await expect(page.getByText('Wiccan')).toBeVisible();
  await expect(page.getByText('warmth')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Indigo' })).toBeVisible();

  await page.goto(`/correspondences/${other.id}`);
  await expect(page.getByRole('link', { name: 'Crimson' })).toBeVisible();
});

test('search finds an entry by keyword, and Back keeps the query', async ({ page }) => {
  const herbs = await makeCategory('Herbs', 'leaf');
  await makeEntry(herbs.id, 'Rosemary', { keywords: ['remembrance'] });
  await makeEntry(herbs.id, 'Sage', { keywords: ['cleansing'] });

  await page.goto('/correspondences');
  const box = page.getByRole('searchbox', { name: 'Search correspondences' });
  await box.fill('remembrance');
  await expect(page.getByRole('link', { name: /Rosemary/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sage/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Rosemary/ }).click();
  await expect(page.getByRole('heading', { name: 'Rosemary' })).toBeVisible();
  await page.goBack();
  await expect(box).toHaveValue('remembrance');
  await expect(page.getByRole('link', { name: /Rosemary/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Sage/ })).toHaveCount(0);
});

test('deleting a category takes its entries along, and restoring brings them back', async ({ page }) => {
  const cat = await makeCategory('Test shelf', 'gem');
  await makeEntry(cat.id, 'Quartz');
  await makeEntry(cat.id, 'Amber');

  await page.goto('/settings');
  await page.locator('li', { hasText: 'Test shelf' }).getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('Move Test shelf and its 2 entries to the Trash?');
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('li', { hasText: 'Test shelf' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Trash' }).click();
  const row = page.locator('li', { hasText: 'Test shelf' });
  // The Trash words this "Entries in the Trash with it: 2" (the brief said "and 2 entries").
  await expect(row).toContainText('with it: 2');
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();

  await restart();
  await page.goto('/correspondences');
  await expect(page.getByRole('button', { name: 'Test shelf' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Quartz/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Amber/ })).toBeVisible();
});

test('the order of traditions and categories holds after a restart', async ({ page }) => {
  await makeCategory('Aaa', 'star');
  await makeCategory('Bbb', 'moon');
  const order = async title => {
    const section = page.locator('section', { has: page.getByRole('heading', { name: title }) }).last();
    return section.locator('li strong').allTextContents();
  };

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Move Bbb up' })).toBeVisible();
  const categoriesBefore = await order('Categories');
  const lastCat = categoriesBefore.at(-1);
  const wantCats = [...categoriesBefore.slice(0, -2), lastCat, categoriesBefore.at(-2)];
  const traditionsBefore = await order('Traditions');
  const last = traditionsBefore.at(-1);
  await page.getByRole('button', { name: `Move ${last} up` }).click();
  await page.getByRole('button', { name: `Move ${lastCat} up` }).click();
  const traditionsAfter = [...traditionsBefore.slice(0, -2), last, traditionsBefore.at(-2)];
  await expect.poll(() => order('Traditions')).toEqual(traditionsAfter);
  await expect.poll(() => order('Categories')).toEqual(wantCats);

  await restart();
  await page.reload();
  await expect.poll(() => order('Traditions')).toEqual(traditionsAfter);
  await expect.poll(() => order('Categories')).toEqual(wantCats);
});

test('a link removed in another window makes a stale edit conflict', async ({ page, context }) => {
  const cat = await makeCategory('Stones', 'gem');
  const y = await makeEntry(cat.id, 'Yarrow');
  const x = await makeEntry(cat.id, 'Xenolith', { links: [y.id] });

  const a = page;
  await a.goto(`/correspondences/${y.id}/edit`);
  await expect(a.getByLabel('Name')).toHaveValue('Yarrow');
  await expect(a.locator('.entry-picker').getByText('Xenolith')).toBeVisible();

  const b = await context.newPage();
  await b.goto(`/correspondences/${x.id}/edit`);
  await expect(b.locator('.entry-picker').getByText('Yarrow')).toBeVisible();
  await b.getByRole('button', { name: 'Remove Yarrow' }).click();
  await b.getByRole('button', { name: 'Save' }).click();
  await expect(b.getByRole('heading', { name: 'Xenolith' })).toBeVisible();

  await a.getByLabel('Summary').fill('Changed in window A');
  await a.getByRole('button', { name: 'Save' }).click();
  await expect(a.getByRole('dialog')).toContainText('This was changed somewhere else');
});

test('a required-field error shows in Spanish', async ({ page }) => {
  const es = path.join(dir, 'locales', 'es');
  fs.mkdirSync(es, { recursive: true });
  fs.writeFileSync(path.join(es, 'ui.json'), JSON.stringify({
    _name: 'Español', 'error.required': 'Obligatorio', 'corr.new': 'Nueva entrada', 'corr.name': 'Nombre', 'corr.category': 'Categoría', 'common.save': 'Guardar',
  }));
  fs.writeFileSync(path.join(es, 'content.json'), JSON.stringify({}));
  await restart();
  const cat = (await call('GET', '/api/categories'))[0];

  await page.goto('/settings');
  await page.getByLabel('Language').selectOption('es');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Guardar' }).first()).toBeVisible();

  const entry = await makeEntry(cat.id, 'Azul');
  await page.goto(`/correspondences/${entry.id}/edit`);
  await expect(page.getByLabel('Nombre')).toHaveValue('Azul');
  await page.getByLabel('Nombre').fill('');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Obligatorio')).toBeVisible();
});

test('screenshots of the list and an entry page, phone and desktop', async ({ page }) => {
  const cat = (await call('GET', '/api/categories')).find(c => c.name === 'Colors');
  const herbs = await makeCategory('Herbs', 'leaf');
  const tr = await call('GET', '/api/traditions');
  const indigo = await makeEntry(cat.id, 'Indigo', { summary: 'A deep blue, the color of late dusk.' });
  const entry = await makeEntry(cat.id, 'Crimson', {
    summary: 'A warm red', body: 'Often placed near the hearth.\n\nA second paragraph about the color.',
    keywords: ['red', 'warmth', 'hearth'], feast_day: '12-12', traditions: [tr[0].id], links: [indigo.id],
  });
  await makeEntry(herbs.id, 'Rosemary', { summary: 'Evergreen and fragrant' });
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1400, height: 900 };
  // Set the size first, then load the page, so the phone layout starts closed like a real visit.
  const shot = async (name, size, url, heading) => {
    await page.setViewportSize(size);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  };
  const list = '/correspondences';
  const entryUrl = `/correspondences/${entry.id}`;

  await shot('corr-list-phone', phone, list, 'Correspondences');
  await shot('corr-list-desktop', desktop, list, 'Correspondences');
  await shot('corr-entry-phone', phone, entryUrl, 'Crimson');
  await shot('corr-entry-desktop', desktop, entryUrl, 'Crimson');

  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await shot('corr-list-phone-book-folk', phone, list, 'Correspondences');
  await shot('corr-entry-desktop-book-folk', desktop, entryUrl, 'Crimson');
});

import { test, expect } from '@playwright/test';
import { BASE, startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

let dir, proc;
test.beforeEach(async () => { dir = freshDataDir(); proc = await startServer(dir); });
test.afterEach(async () => { await stopServer(proc); removeDataDir(dir); });

const restart = async () => { await stopServer(proc); proc = await startServer(dir); };

async function call(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}
const colors = async () => (await call('GET', '/api/categories')).find(c => c.name === 'Colors');
const makeEntry = async (name, extra = {}) => call('POST', '/api/correspondences', { category_id: (await colors()).id, name, ...extra });
const makeSpell = body => call('POST', '/api/spells', body);
const kindId = async name => (await call('GET', '/api/spell-kinds')).find(k => k.name === name).id;

test('add a spell with lines, steps and timing, reorder, restart, and everything is in the new order', async ({ page }) => {
  const rosemary = await makeEntry('Rosemary', { summary: 'Evergreen and fragrant' });
  await makeEntry('Midsummer', { feast_day: '06-21' });

  await page.goto('/spells');
  await page.getByRole('link', { name: 'Add a spell' }).first().click();
  await page.getByLabel('Title').fill('Hearth blessing');
  await page.getByLabel('Purpose').fill('A quiet blessing for the kitchen');
  await page.getByLabel('Kind').selectOption({ label: 'Blessing' });

  const lines = page.getByRole('group', { name: 'Ingredients and tools' });
  await lines.getByRole('button', { name: 'Add an ingredient or tool' }).click();
  await lines.locator('.list-row').nth(0).getByLabel('Name').fill('Salt');
  await lines.locator('.list-row').nth(0).getByLabel('Amount').fill('1 pinch');
  await lines.getByRole('button', { name: 'Add an ingredient or tool' }).click();
  const second = lines.locator('.list-row').nth(1);
  await second.getByLabel('Name').fill('Rosemary sprig');
  await second.getByLabel('Link to a correspondence').fill('Rosemary');
  await second.locator('.picker-results').getByRole('button', { name: 'Rosemary' }).click();
  // The down button moves the first line below the second.
  await lines.getByRole('button', { name: 'Move Salt down' }).click();
  await expect(lines.locator('.list-row').nth(0).getByLabel('Name')).toHaveValue('Rosemary sprig');
  await expect(lines.locator('.list-row').nth(1).getByLabel('Name')).toHaveValue('Salt');

  const steps = page.getByRole('group', { name: 'Steps' });
  await steps.getByRole('button', { name: 'Add a step' }).click();
  await steps.getByRole('textbox', { name: 'Step 1' }).fill('Light the candle');
  await steps.getByRole('button', { name: 'Add a step' }).click();
  await steps.getByRole('textbox', { name: 'Step 2' }).fill('Breathe slowly');
  // Drag the second step's handle onto the first row.
  await steps.locator('.list-row').nth(1).locator('.list-handle').dragTo(steps.locator('.list-row').nth(0));
  await expect(steps.getByRole('textbox', { name: 'Step 1' })).toHaveValue('Breathe slowly');
  await expect(steps.getByRole('textbox', { name: 'Step 2' })).toHaveValue('Light the candle');

  await page.getByRole('group', { name: 'Moon phases' }).getByRole('button', { name: 'Full moon' }).click();
  await page.getByRole('group', { name: 'Days' }).getByRole('button', { name: 'Friday' }).click();
  const feasts = page.getByRole('group', { name: 'Sabbats and feasts' });
  await feasts.locator('input').fill('Midsummer');
  await feasts.locator('.picker-results').getByRole('button', { name: 'Midsummer' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Hearth blessing' })).toBeVisible();

  const check = async () => {
    await expect(page.getByRole('heading', { name: 'Hearth blessing' })).toBeVisible();
    await expect(page.locator('.spell-ingredients li')).toHaveText(['Rosemary sprig', '1 pinch Salt']);
    await expect(page.locator('.spell-steps li')).toHaveText(['Breathe slowly', 'Light the candle']);
    await expect(page.getByText('Full moon')).toBeVisible();
    await expect(page.getByText('Friday')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Midsummer' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Rosemary sprig' })).toBeVisible();
  };
  await check();
  await restart();
  await page.reload();
  await check();

  await page.goto(`/correspondences/${rosemary.id}`);
  await expect(page.getByRole('heading', { name: 'Used in spells' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Hearth blessing' })).toBeVisible();
});

test('leaving an edit asks first, and a second window gets the conflict dialog', async ({ page, context }) => {
  const spell = await makeSpell({ title: 'Window test', steps: ['First step', 'Second step'] });
  const nav = page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Today' });

  await page.goto(`/spells/${spell.id}/edit`);
  await expect(page.getByRole('textbox', { name: 'Step 1' })).toHaveValue('First step');
  const other = await context.newPage();
  await other.goto(`/spells/${spell.id}/edit`);
  await expect(other.getByRole('textbox', { name: 'Step 1' })).toHaveValue('First step');

  await page.getByRole('textbox', { name: 'Step 1' }).fill('Changed step');
  await nav.click();
  await expect(page.getByText('Leave without saving?')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(/\/edit$/);
  await expect(page.getByRole('textbox', { name: 'Step 1' })).toHaveValue('Changed step');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.spell-steps li').first()).toHaveText('Changed step');
  await restart();
  await page.reload();
  await expect(page.locator('.spell-steps li')).toHaveText(['Changed step', 'Second step']);

  // The other window still holds the old version, so its save is stale.
  await other.getByRole('textbox', { name: 'Step 2' }).fill('From the other window');
  await other.getByRole('button', { name: 'Save' }).click();
  await expect(other.getByText('This was changed somewhere else')).toBeVisible();
  await other.getByRole('button', { name: 'Keep mine and save over it' }).click();
  await expect(other.locator('.spell-steps li')).toHaveText(['First step', 'From the other window']);
  await restart();
  await other.reload();
  await expect(other.locator('.spell-steps li')).toHaveText(['First step', 'From the other window']);

  // Leaving for real drops the unsaved edit.
  await page.goto(`/spells/${spell.id}/edit`);
  await page.getByRole('textbox', { name: 'Step 1' }).fill('Never saved');
  await nav.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(page).not.toHaveURL(/\/spells\//);
  expect((await call('GET', `/api/spells/${spell.id}`)).steps[0]).toBe('First step');
});

test('delete a spell, find it in the Trash, restore it, and its lines are back', async ({ page }) => {
  const spell = await makeSpell({ title: 'Trash trip', ingredients: [{ name: 'Honey', amount: '1 spoon' }, { name: 'Bowl' }], steps: ['Stir'] });
  await page.goto(`/spells/${spell.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/spells$/);
  await expect(page.getByRole('link', { name: /Trash trip/ })).toHaveCount(0);

  await page.goto('/trash');
  const row = page.locator('li', { hasText: 'Trash trip' });
  await expect(row).toContainText('Spell');
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();

  await page.goto(`/spells/${spell.id}`);
  await expect(page.getByRole('heading', { name: 'Trash trip' })).toBeVisible();
  await expect(page.locator('.spell-ingredients li')).toHaveText(['1 spoon Honey', 'Bowl']);
  await expect(page.locator('.spell-steps li')).toHaveText(['Stir']);
});

test('add, rename, reorder and delete a spell kind, and the order holds after a restart', async ({ page }) => {
  const order = () => page.locator('section', { has: page.getByRole('heading', { name: 'Spell kinds' }) }).last().locator('li strong').allTextContents();
  await page.goto('/settings');
  await expect.poll(order).toEqual(['Spell', 'Ritual', 'Blessing', 'Cleansing', 'Other']);

  const spellKinds = page.locator('section', { has: page.getByRole('heading', { name: 'Spell kinds' }) }).last();
  await spellKinds.getByRole('button', { name: 'Add a kind' }).click();
  await page.getByLabel('Name').fill('Charm');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  // A new kind starts at the top, like a new tradition or category.
  await expect.poll(order).toEqual(['Charm', 'Spell', 'Ritual', 'Blessing', 'Cleansing', 'Other']);

  await page.locator('li', { hasText: 'Charm' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Name').fill('Charms');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect.poll(order).toEqual(['Charms', 'Spell', 'Ritual', 'Blessing', 'Cleansing', 'Other']);

  await page.getByRole('button', { name: 'Move Charms down' }).click();
  await expect.poll(order).toEqual(['Spell', 'Charms', 'Ritual', 'Blessing', 'Cleansing', 'Other']);

  await page.locator('li', { hasText: 'Ritual' }).getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  const want = ['Spell', 'Charms', 'Blessing', 'Cleansing', 'Other'];
  await expect.poll(order).toEqual(want);

  await restart();
  await page.reload();
  await expect.poll(order).toEqual(want);
});

test('screenshots of the list, a spell and the form, phone and desktop', async ({ page }) => {
  const dirOut = process.env.EVIDENCE ? 'docs/evidence/stage-3' : 'test-results';
  const traditions = await call('GET', '/api/traditions');
  const rosemary = await makeEntry('Rosemary', { summary: 'Evergreen and fragrant' });
  const midsummer = await makeEntry('Midsummer', { feast_day: '06-21' });
  const spell = await makeSpell({
    title: 'A candle for a calm home', purpose: 'To settle the house at the end of a busy week.',
    kind_id: await kindId('Blessing'), traditions: [traditions[0].id],
    ingredients: [{ name: 'White candle', amount: '1' }, { name: 'Rosemary sprig', amount: '1', correspondence_id: rosemary.id }, { name: 'Small dish of salt', amount: '1 pinch' }],
    steps: ['Tidy the room and set the candle on the table.', 'Light the candle and say what you would like the house to feel like.', 'Sit quietly, then snuff the candle out.'],
    timing: { day: ['mon'], moon: ['full'] }, feasts: [midsummer.id],
    notes: 'Best done after supper, when the kitchen is quiet.\n\nKeep a window open a crack.', source: 'My own',
  });
  await makeSpell({ title: 'Doorway sweep', purpose: 'To clear the front step before guests arrive.', kind_id: await kindId('Cleansing'), steps: ['Sweep toward the step.'] });
  const phone = { width: 390, height: 844 };
  const desktop = { width: 1400, height: 900 };
  const shot = async (name, size, url, heading) => {
    await page.setViewportSize(size);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await page.waitForLoadState('networkidle');
    const widths = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
    expect(widths.page, `${name} is wider than the screen`).toBeLessThanOrEqual(widths.screen);
    await page.screenshot({ path: `${dirOut}/${name}.png`, fullPage: true });
  };

  for (const [tag, size] of [['phone', phone], ['desktop', desktop]]) {
    await shot(`spells-list-${tag}`, size, '/spells', 'Book of Spells');
    await shot(`spell-page-${tag}`, size, `/spells/${spell.id}`, 'A candle for a calm home');
    await shot(`spell-form-${tag}`, size, `/spells/${spell.id}/edit`, 'Edit spell');
  }
  await page.setViewportSize(phone);
  await page.goto('/settings');
  const kinds = page.locator('section', { has: page.getByRole('heading', { name: 'Spell kinds' }) }).last();
  await expect(kinds.getByText('Cleansing')).toBeVisible();
  await kinds.screenshot({ path: `${dirOut}/settings-kinds-phone.png` });

  await page.setViewportSize(desktop);
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');
  await shot('spell-page-desktop-book-folk', desktop, `/spells/${spell.id}`, 'A candle for a calm home');
});

import { test, expect } from '@playwright/test';
import { BASE, REAL_CONTENT, startServer, stopServer, freshDataDir, removeDataDir } from './server.js';

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
const makeFeast = async (name, feast_day) => call('POST', '/api/correspondences', { category_id: (await colors()).id, name, feast_day });
const makeDate = body => call('POST', '/api/own-dates', body);

// Days are worked out from the server's own today, so the tests follow the real clock.
const serverToday = async () => (await call('GET', '/api/today')).day;
const plus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthOf = day => day.slice(0, 7);
const feastOf = day => day.slice(5);

const phone = { width: 390, height: 844 };
const desktop = { width: 1400, height: 900 };
const noSideScroll = async (page, what) => {
  const w = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(w.page, `${what} is wider than the screen`).toBeLessThanOrEqual(w.screen);
};

test('add a yearly date from a calendar day, edit its title, restart, and it is on the month and Today', async ({ page }) => {
  const today = await serverToday();
  const day = plus(today, 2);
  await page.goto(`/calendar?month=${monthOf(day)}&day=${day}`);
  await page.getByRole('link', { name: 'Add a date' }).click();
  await expect(page.getByLabel('Date')).toHaveValue(day);
  await page.getByLabel('Title').fill('Light a candle for the ancestors');
  await page.getByLabel('Repeats every year').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Light a candle for the ancestors' })).toBeVisible();
  await expect(page.getByText('Every year')).toBeVisible();

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('Light a candle for my grandmother');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Light a candle for my grandmother' })).toBeVisible();

  await restart();
  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(page.locator('.cal-grid').getByText('Light a candle for my grandmother')).toBeVisible();
  // A yearly date also shows in the same month of other years.
  const nextYear = `${Number(day.slice(0, 4)) + 1}-${day.slice(5, 7)}`;
  await page.goto(`/calendar?month=${nextYear}`);
  await expect(page.locator('.cal-grid').getByText('Light a candle for my grandmother')).toBeVisible();

  await page.goto('/');
  const coming = page.locator('.today-coming');
  await expect(coming.getByRole('link', { name: 'Light a candle for my grandmother' })).toBeVisible();
  await expect(coming).toContainText('in 2 days');
});

test('hide a feast from its entry page, it leaves the month and Today, show it again, and the choice holds after a restart', async ({ page }) => {
  const today = await serverToday();
  const day = plus(today, 2);
  const feast = await makeFeast('Harvest supper', feastOf(day));
  const grid = page.locator('.cal-grid');
  const coming = page.locator('.today-coming');
  const sw = () => page.getByRole('switch', { name: 'Show on the calendar' });

  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(grid.getByText('Harvest supper')).toBeVisible();
  await page.goto('/');
  await expect(coming.getByRole('link', { name: 'Harvest supper' })).toBeVisible();

  await page.goto(`/correspondences/${feast.id}`);
  await expect(sw()).toHaveAttribute('aria-checked', 'true');
  await sw().click();
  await expect(sw()).toHaveAttribute('aria-checked', 'false');
  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(grid).toBeVisible();
  await expect(grid.getByText('Harvest supper')).toHaveCount(0);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Coming up' })).toBeVisible();
  await expect(page.getByText('Harvest supper')).toHaveCount(0);

  await restart();
  await page.goto(`/correspondences/${feast.id}`);
  await expect(sw()).toHaveAttribute('aria-checked', 'false');
  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(grid.getByText('Harvest supper')).toHaveCount(0);

  await page.goto(`/correspondences/${feast.id}`);
  await sw().click();
  await expect(sw()).toHaveAttribute('aria-checked', 'true');
  await restart();
  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(grid.getByText('Harvest supper')).toBeVisible();
  await page.goto('/');
  await expect(coming.getByRole('link', { name: 'Harvest supper' })).toBeVisible();
});

test('delete an own date, then bring it back from the Trash', async ({ page }) => {
  const today = await serverToday();
  const day = plus(today, 4);
  const date = await makeDate({ title: 'Walk to the old oak', date: day, yearly: true, notes: 'Bring an acorn home.' });
  await page.goto(`/calendar/dates/${date.id}`);
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/calendar\?month=/);
  await expect(page.locator('.cal-grid').getByText('Walk to the old oak')).toHaveCount(0);

  await page.goto('/trash');
  const row = page.locator('li', { hasText: 'Walk to the old oak' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();

  await page.goto(`/calendar?month=${monthOf(day)}`);
  await expect(page.locator('.cal-grid').getByText('Walk to the old oak')).toBeVisible();
  await page.goto(`/calendar/dates/${date.id}`);
  await expect(page.getByRole('heading', { name: 'Walk to the old oak' })).toBeVisible();
  await expect(page.getByText('Bring an acorn home.')).toBeVisible();
});

test('a crowded November at 390 px does not scroll sideways, and opening Nov 2 lists every item', async ({ page }) => {
  const year = Number((await serverToday()).slice(0, 4));
  for (const name of ['All Hallows', 'Day of the Dead', 'Feast of the Departed']) await makeFeast(name, '11-01');
  for (const name of ['All Souls', 'Ancestor supper', 'Bread for the dead', 'Soul cakes', 'Lantern night', 'Quiet vigil']) await makeFeast(name, '11-02');
  await makeDate({ title: 'Light a candle for the ancestors', date: `${year}-11-02`, yearly: true });

  await page.setViewportSize(phone);
  await page.goto(`/calendar?month=${year}-11`);
  await expect(page.getByRole('heading', { name: 'November', exact: false }).first()).toBeVisible();
  await noSideScroll(page, 'the November month');

  const button = page.getByRole('button', { name: /November 2, \d{4}, \d+ items/ });
  const n = Number((await button.getAttribute('aria-label')).match(/(\d+) items/)[1]);
  expect(n).toBeGreaterThanOrEqual(7);
  await button.click();
  const panel = page.locator('.cal-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(n);
  for (const name of ['All Souls', 'Ancestor supper', 'Bread for the dead', 'Soul cakes', 'Lantern night', 'Quiet vigil', 'Light a candle for the ancestors']) {
    await expect(panel.getByRole('link', { name })).toBeVisible();
  }
  await noSideScroll(page, 'the November day panel');
});

test('screenshots of Today, the month, a day and the date form', async ({ page }) => {
  const dirOut = process.env.EVIDENCE ? 'docs/evidence/stage-4' : 'test-results';
  const today = await serverToday();
  const day = plus(today, 2);
  const traditions = await call('GET', '/api/traditions');
  await makeDate({ title: 'Light a candle for the ancestors', date: day, yearly: true, notes: 'Set a small candle in the window at dusk.', traditions: [traditions[0].id] });
  await makeFeast('Harvest supper', feastOf(plus(today, 5)));
  await makeFeast('Apple blessing', feastOf(plus(today, 2)));
  await makeFeast('First frost feast', feastOf(plus(today, 9)));
  await makeDate({ title: 'Visit the old orchard', date: plus(today, 12), yearly: false });

  const shot = async (name, size, url, heading) => {
    await page.setViewportSize(size);
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible();
    if (url.includes('&day=')) await expect(page.locator('.cal-panel')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, name);
    await page.screenshot({ path: `${dirOut}/${name}.png`, fullPage: true });
  };
  const month = `/calendar?month=${monthOf(day)}`;

  // Old Book is the first look.
  await shot('month-desktop-old-book', desktop, month, 'Calendar');
  await shot('month-phone-old-book', phone, month, 'Calendar');

  await page.setViewportSize(desktop);
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');

  await shot('today-desktop-book-folk', desktop, '/', 'Coming up');
  await shot('today-phone-book-folk', phone, '/', 'Coming up');
  await shot('month-desktop-book-folk', desktop, month, 'Calendar');
  await shot('month-phone-book-folk', phone, month, 'Calendar');
  await shot('list-desktop-book-folk', desktop, `${month}&view=list`, 'Calendar');
  await shot('day-desktop-book-folk', desktop, `${month}&day=${day}`, 'Calendar');
  await shot('day-phone-book-folk', phone, `${month}&day=${day}`, 'Calendar');
  await shot('date-form-phone-book-folk', phone, `/calendar/dates/new?date=${day}`, 'New date');
});

test('screenshots of Today and the month with the real starter content', async ({ page }) => {
  const dirOut = process.env.EVIDENCE ? 'docs/evidence/stage-4' : 'test-results';
  await stopServer(proc);
  removeDataDir(dir);
  dir = freshDataDir();
  proc = await startServer(dir, { content: REAL_CONTENT });
  const today = await serverToday();
  // October has Samhain (a sabbat) and San Judas Tadeo (a saint) in the starter book.
  const october = `/calendar?month=${today.slice(0, 4)}-10`;

  await page.setViewportSize(desktop);
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');

  await page.goto('/');
  await expect(page.locator('.today-day')).toContainText('belongs to');
  await expect(page.locator('.today-day')).toContainText(/Its colors? (is|are)/);
  await page.waitForLoadState('networkidle');
  await noSideScroll(page, 'Today with real content');
  await page.screenshot({ path: `${dirOut}/today-real-desktop-book-folk.png`, fullPage: true });

  await page.goto(october);
  await expect(page.getByRole('button', { name: /October 31/ })).toContainText('Samhain');
  await expect(page.getByRole('button', { name: /October 28/ })).toContainText('Jud');
  await page.waitForLoadState('networkidle');
  await noSideScroll(page, 'the October month with real content');
  await page.screenshot({ path: `${dirOut}/month-real-desktop-book-folk.png`, fullPage: true });
});

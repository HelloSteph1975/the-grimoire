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

// Days are worked out from the server's own today, so the tests follow the real clock.
const serverToday = async () => (await call('GET', '/api/today')).day;
const plus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekdayCode = day => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(`${day}T00:00:00Z`).getUTCDay()];
const monthOf = day => day.slice(0, 7);

const phone = { width: 390, height: 844 };
const desktop = { width: 1400, height: 900 };
const noSideScroll = async (page, what) => {
  const w = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(w.page, `${what} is wider than the screen`).toBeLessThanOrEqual(w.screen);
};

// A spell whose only timing is the weekday three days from today, so the first suggestion is that day.
async function makeSpell(today) {
  return call('POST', '/api/spells', {
    title: 'A candle for a calm home',
    purpose: 'To settle the house at the end of a busy week.',
    ingredients: [{ name: 'White candle', amount: '1' }, { name: 'Matches', amount: '1' }, { name: 'Small dish of salt', amount: '1 pinch' }],
    steps: ['Light the candle and say what you would like the house to feel like.'],
    timing: { day: [weekdayCode(plus(today, 3))] },
  });
}

test('plan from a suggestion, tick supplies, log it with a rating and a follow-up, and it all holds after a restart', async ({ page }) => {
  const today = await serverToday();
  const day = plus(today, 3);
  const spell = await makeSpell(today);

  await page.goto(`/spells/${spell.id}`);
  await page.getByRole('link', { name: 'Plan a ritual' }).click();
  await expect(page.getByLabel('Title')).toHaveValue('A candle for a calm home');
  const first = page.locator('.suggestion').first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Date')).toHaveValue(day);
  await page.getByLabel('Reminder').selectOption({ label: '3 days before' });
  await expect(page.getByRole('group', { name: 'Supplies' }).locator('.list-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'A candle for a calm home' })).toBeVisible();
  await expect(page.locator('.entry-meta .tag')).toHaveText('Planned');
  const supplies = page.locator('.ritual-supplies input[type=checkbox]');
  await expect(supplies).toHaveCount(3);
  // Two quick ticks make two saves of this ritual. Wait for both answers before the restart.
  const savePath = `/api${new URL(page.url()).pathname}`;
  const statuses = [];
  const bothSaved = new Promise(resolve => {
    page.on('response', res => {
      if (res.request().method() !== 'PATCH' || new URL(res.url()).pathname !== savePath) return;
      statuses.push(res.status());
      if (statuses.length === 2) resolve();
    });
  });
  await supplies.nth(0).check();
  await supplies.nth(2).check();
  await expect(supplies.nth(0)).toBeChecked();
  await bothSaved;
  expect(statuses).toEqual([200, 200]);

  await restart();
  await page.reload();
  await expect(supplies.nth(0)).toBeChecked();
  await expect(supplies.nth(1)).not.toBeChecked();
  await expect(supplies.nth(2)).toBeChecked();

  // Log it as done with a rating, then add a follow-up.
  await page.getByRole('link', { name: 'Log it' }).click();
  await expect(page.getByRole('heading', { name: 'How did it go?' })).toBeVisible();
  await page.getByLabel('Done').check();
  await page.getByLabel('How it went').fill('The house felt quiet afterwards.');
  await page.getByRole('button', { name: '4 stars' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.entry-meta .tag')).toHaveText('Done');
  await expect(page.getByText('The house felt quiet afterwards.')).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of 5' })).toBeVisible();

  await page.getByRole('button', { name: 'Add a follow-up' }).click();
  await page.getByLabel('Note').fill('Still tidy by the door a week later.');
  await page.locator('.followup-form').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.followup-list')).toContainText('Still tidy by the door a week later.');

  await restart();
  await page.reload();
  await expect(page.locator('.entry-meta .tag')).toHaveText('Done');
  await expect(page.getByText('The house felt quiet afterwards.')).toBeVisible();
  await expect(page.getByRole('img', { name: '4 of 5' })).toBeVisible();
  await expect(page.locator('.followup-list')).toContainText('Still tidy by the door a week later.');
  await expect(supplies.nth(0)).toBeChecked();

  await page.goto('/rituals?tab=log');
  await expect(page.locator('.ritual-list').getByRole('link', { name: /A candle for a calm home/ })).toBeVisible();
});

test('a ritual shows on its spell, the calendar day and Today, with a reminder, and Trash brings its follow-up back', async ({ page }) => {
  const today = await serverToday();
  const day = plus(today, 3);
  const spell = await makeSpell(today);
  const ritual = await call('POST', '/api/rituals', { title: 'Evening candle', spell_id: spell.id, date: day, time: '19:30', reminder_days: 3 });
  await call('POST', '/api/followups', { ritual_id: ritual.id, date: today, text: 'Remember to open the window first.' });

  await page.goto(`/spells/${spell.id}`);
  const section = page.locator('.spell-rituals');
  await expect(section.getByRole('link', { name: 'Evening candle' })).toBeVisible();

  await page.goto(`/calendar?month=${monthOf(day)}&day=${day}`);
  await expect(page.locator('.cal-panel').getByRole('link', { name: 'Evening candle' })).toBeVisible();

  await page.goto('/');
  await expect(page.locator('.today-rituals').first().getByRole('link', { name: 'Evening candle' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Evening candle, in 3 days' })).toBeVisible();

  await page.goto(`/rituals/${ritual.id}`);
  await expect(page.locator('.followup-list')).toContainText('Remember to open the window first.');
  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/rituals$/);
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Evening candle' })).toHaveCount(0);

  await page.goto('/trash');
  const row = page.locator('li', { hasText: 'Evening candle' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();

  await restart();
  await page.goto(`/rituals/${ritual.id}`);
  await expect(page.getByRole('heading', { name: 'Evening candle' })).toBeVisible();
  await expect(page.locator('.followup-list')).toContainText('Remember to open the window first.');
  await page.goto('/');
  await expect(page.locator('.today-rituals').first().getByRole('link', { name: 'Evening candle' })).toBeVisible();
});

test('the ritual pages do not scroll sideways at 390 px', async ({ page }) => {
  const today = await serverToday();
  const spell = await makeSpell(today);
  const ritual = await call('POST', '/api/rituals', {
    title: 'Evening candle', spell_id: spell.id, date: plus(today, 3), reminder_days: 1,
    supplies: [{ name: 'White candle', amount: '1' }], plan_notes: 'Tidy first.',
  });
  await page.setViewportSize(phone);
  for (const url of ['/rituals', `/rituals/${ritual.id}`, `/rituals/${ritual.id}/log`, `/rituals/new?spell=${spell.id}`, '/']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, url);
  }
});

test('screenshots of the Planned tab, the plan form, a logged ritual and Today', async ({ page }) => {
  const dirOut = process.env.EVIDENCE ? 'docs/evidence/stage-5' : 'test-results';
  const today = await serverToday();
  const spell = await makeSpell(today);
  const planned = await call('POST', '/api/rituals', {
    title: 'A candle for a calm home', spell_id: spell.id, date: plus(today, 3), time: '19:30', reminder_days: 3,
    plan_notes: 'Tidy the front room first and open a window while the candle burns.',
    supplies: [{ name: 'White candle', amount: '1', checked: true }, { name: 'Matches', amount: '1' }, { name: 'Small dish of salt', amount: '1 pinch' }],
  });
  const done = await call('POST', '/api/rituals', {
    title: 'Calm home candle, last week', spell_id: spell.id, date: plus(today, -7), time: '20:00', status: 'done', rating: 4,
    changes: 'I used a green candle because the white one had burned down.',
    outcome: 'The house felt quiet afterwards, and we had tea at the table.',
    supplies: [{ name: 'White candle', amount: '1', checked: true }, { name: 'Matches', amount: '1', checked: true }],
  });
  await call('POST', '/api/followups', { ritual_id: done.id, date: plus(today, -4), text: 'Still tidy by the door. I will light it again next week.' });
  await call('POST', '/api/followups', { ritual_id: done.id, date: plus(today, -1), text: 'Lit it again tonight and it felt just as calm.' });

  await page.setViewportSize(desktop);
  await page.goto('/settings');
  await page.getByLabel('Look').selectOption('book-folk');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'book-folk');

  const shot = async (name, size, url, ready) => {
    await page.setViewportSize(size);
    await page.goto(url);
    await ready();
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, name);
    await page.screenshot({ path: `${dirOut}/${name}.png`, fullPage: true });
  };
  const pages = [
    ['planned', '/rituals?tab=planned', () => expect(page.locator('.ritual-list').getByRole('link', { name: /A candle for a calm home/ })).toBeVisible()],
    ['plan-form', `/rituals/new?spell=${spell.id}`, async () => {
      await expect(page.locator('.suggestion').first()).toBeVisible();
      await page.locator('.suggestion').first().click();
      // Picking a day can leave the Time field focused; blur it so the shot shows it at rest.
      await page.getByLabel('Time', { exact: true }).blur();
    }],
    ['logged', `/rituals/${done.id}`, async () => {
      await expect(page.locator('.followup-list li')).toHaveCount(2);
      await expect(page.locator('.ritual-sky')).toBeVisible();
    }],
    ['today', '/', async () => {
      await expect(page.locator('.today-rituals').first().getByRole('link', { name: planned.title })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible();
    }],
  ];
  for (const [name, url, ready] of pages) {
    await shot(`${name}-desktop-book-folk`, desktop, url, ready);
    await shot(`${name}-phone-book-folk`, phone, url, ready);
  }
});

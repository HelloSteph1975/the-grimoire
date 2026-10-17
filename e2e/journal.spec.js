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

const serverToday = async () => (await call('GET', '/api/today')).day;
const plus = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const kindId = async name => (await call('GET', '/api/journal-kinds')).find(k => k.name === name).id;

const phone = { width: 390, height: 844 };
const desktop = { width: 1400, height: 900 };
const noSideScroll = async (page, what) => {
  const w = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, screen: window.innerWidth }));
  expect(w.page, `${what} is wider than the screen`).toBeLessThanOrEqual(w.screen);
};

const TITLE = 'Three cards for the week';
const TEXT = 'A simple pull to set the tone for the days ahead.';

// Writes the tarot entry through the form: two cards (the second reversed) and two tags.
async function writeTarot(page) {
  await page.goto('/journal');
  await page.getByRole('link', { name: 'Write an entry' }).first().click();
  await page.getByLabel('Date').fill('2026-03-14');
  await page.getByLabel('Time', { exact: true }).fill('21:30');
  await page.getByLabel('Kind').selectOption({ label: 'Tarot' });
  await page.getByLabel('Title').fill(TITLE);
  await page.getByLabel('Entry').fill(TEXT);
  const tags = page.getByRole('textbox', { name: 'Tags' });
  await tags.fill('Luna');
  await tags.press('Enter');
  await tags.fill('weekly pull');
  await tags.press('Enter');

  const cards = page.getByRole('group', { name: 'Cards drawn' });
  await cards.getByRole('button', { name: 'Add a card' }).click();
  const first = cards.locator('.list-row').nth(0);
  await first.getByLabel('Card', { exact: true }).fill('The Star');
  await first.getByLabel('Position').fill('The week ahead');
  await cards.getByRole('button', { name: 'Add a card' }).click();
  const second = cards.locator('.list-row').nth(1);
  await second.getByLabel('Card', { exact: true }).fill('Four of Swords');
  await second.getByLabel('Position').fill('What to ease up on');
  await second.getByLabel('Reversed').check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
}

const skyText = page => page.locator('.ritual-sky p').innerText();

async function checkTarotPage(page) {
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
  await expect(page.locator('.entry-meta .tag')).toHaveText('Tarot');
  await expect(page.locator('.entry-meta time').first()).toContainText('March 14, 2026');
  await expect(page.locator('.entry-meta time').nth(1)).toContainText('9:30');
  await expect(page.getByText(TEXT)).toBeVisible();
  await expect(page.locator('.journal-tags .chip')).toHaveText(['Luna', 'weekly pull']);
  const cards = page.locator('.journal-cards li');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText('The Star');
  await expect(cards.nth(0)).toContainText('The week ahead');
  await expect(cards.nth(0)).not.toContainText('Reversed');
  await expect(cards.nth(1)).toContainText('Four of Swords');
  await expect(cards.nth(1)).toContainText('What to ease up on');
  await expect(cards.nth(1)).toContainText('Reversed');
  await expect(page.locator('.ritual-sky p')).toContainText(/% lit\. .+, the day of .+\./);
}

test('write a tarot entry with cards and tags, and every field and the sky hold after a restart', async ({ page }) => {
  await writeTarot(page);
  await checkTarotPage(page);
  const sky = await skyText(page);

  await restart();
  await page.reload();
  await checkTarotPage(page);
  expect(await skyText(page)).toBe(sky);

  // The form brings every field back too.
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByLabel('Date')).toHaveValue('2026-03-14');
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('21:30');
  await expect(page.getByLabel('Kind')).toHaveValue(String(await kindId('Tarot')));
  await expect(page.getByLabel('Title')).toHaveValue(TITLE);
  await expect(page.getByLabel('Entry')).toHaveValue(TEXT);
  const rows = page.getByRole('group', { name: 'Cards drawn' }).locator('.list-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByLabel('Reversed')).toBeChecked();
  await expect(rows.nth(0).getByLabel('Reversed')).not.toBeChecked();
});

test('find an entry from the side bar by a card position, open it, and filter the Journal by a tag', async ({ page }) => {
  await writeTarot(page);
  await call('POST', '/api/journal', { date: '2026-03-15', title: 'A quiet morning', text: 'Tea at the window.', tags: ['morning'] });

  await page.goto('/');
  await page.getByRole('search').getByRole('searchbox').fill('ease up');
  await page.getByRole('search').getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/\/search\?q=ease(\+|%20)up/);
  const group = page.locator('.search-group', { has: page.getByRole('heading', { name: 'Journal' }) });
  await expect(group.getByRole('link')).toHaveCount(1);
  await group.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(page).toHaveURL(/\/journal\/\d+$/);
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();

  await page.goto('/journal');
  await expect(page.locator('.journal-row')).toHaveCount(2);
  await page.getByLabel('Tag').selectOption('weekly pull');
  await expect(page).toHaveURL(/tag=weekly(\+|%20)pull/);
  await expect(page.locator('.journal-row')).toHaveCount(1);
  await expect(page.locator('.journal-row')).toContainText(TITLE);
});

test('a title-only edit keeps the saved sky, and a new date recomputes it', async ({ page }) => {
  await writeTarot(page);
  const id = new URL(page.url()).pathname.split('/').pop();
  const before = (await call('GET', `/api/journal/${id}`)).sky;
  const skyBefore = await skyText(page);

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Title').fill('Three cards, renamed');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Three cards, renamed' })).toBeVisible();
  expect(await skyText(page)).toBe(skyBefore);
  expect((await call('GET', `/api/journal/${id}`)).sky).toEqual(before);

  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Date').fill('2026-03-21');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.entry-meta time').first()).toContainText('March 21, 2026');
  expect((await call('GET', `/api/journal/${id}`)).sky).not.toEqual(before);
});

test('delete an entry, restore it from the Trash, and its cards and tags come back', async ({ page }) => {
  await writeTarot(page);
  const id = new URL(page.url()).pathname.split('/').pop();

  await page.getByRole('button', { name: 'Delete' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.locator('.journal-row')).toHaveCount(0);

  await page.goto('/trash');
  const row = page.locator('li', { hasText: TITLE });
  await expect(row).toContainText('Journal entry');
  await row.getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('The Trash is empty.')).toBeVisible();

  await restart();
  await page.goto(`/journal/${id}`);
  await checkTarotPage(page);
});

test('add a journal kind in Settings and use it on a new entry', async ({ page }) => {
  await page.goto('/settings');
  const kinds = page.locator('section', { has: page.getByRole('heading', { name: 'Journal kinds' }) }).last();
  await kinds.getByRole('button', { name: 'Add a kind' }).click();
  await page.getByLabel('Name').fill('Meditation');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(kinds.getByText('Meditation')).toBeVisible();

  await page.goto('/journal/new');
  await page.getByLabel('Kind').selectOption({ label: 'Meditation' });
  await page.getByLabel('Title').fill('Ten quiet minutes');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Ten quiet minutes' })).toBeVisible();
  await expect(page.locator('.entry-meta .tag')).toHaveText('Meditation');

  await page.goto('/journal');
  await expect(page.locator('.journal-row', { hasText: 'Ten quiet minutes' })).toContainText('Meditation');
});

test('Today offers "Write in the journal" and shows today\'s entry', async ({ page }) => {
  const today = await serverToday();
  await call('POST', '/api/journal', { date: today, time: '09:00', title: 'A heron on the garden wall', kind_id: await kindId('Sign') });
  await call('POST', '/api/journal', { date: plus(today, -1), title: 'Yesterday only' });

  await page.goto('/');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Journal', exact: true }) });
  await expect(section.getByRole('link', { name: 'Write in the journal' })).toBeVisible();
  await expect(section.getByRole('link', { name: 'A heron on the garden wall' })).toBeVisible();
  await expect(section.getByRole('link', { name: 'Yesterday only' })).toHaveCount(0);
  await section.getByRole('link', { name: 'Write in the journal' }).click();
  await expect(page).toHaveURL(/\/journal\/new$/);
});

test('the phone menu with the search box, and the journal pages, do not scroll sideways at 390 px', async ({ page }) => {
  const today = await serverToday();
  const entry = await call('POST', '/api/journal', {
    date: today, time: '20:15', title: 'Three cards for the week', text: TEXT, tags: ['weekly pull', 'Luna'],
    cards: [{ name: 'The Star', position: 'The week ahead' }, { name: 'Four of Swords', position: 'What to ease up on', reversed: true }],
  });
  await page.setViewportSize(phone);
  for (const url of ['/journal', `/journal/${entry.id}`, `/journal/${entry.id}/edit`, '/journal/new', '/search?q=star', '/']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await noSideScroll(page, url);
  }
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Open the menu' }).click();
  const box = page.getByRole('search').getByRole('searchbox');
  await expect(box).toBeVisible();
  await noSideScroll(page, 'the open phone menu');
  // The menu slides in over 0.2 s, so wait until the box has stopped moving.
  const fit = () => page.evaluate(() => {
    const r = document.querySelector('.search-box').getBoundingClientRect();
    return { left: r.left, right: r.right, screen: window.innerWidth };
  });
  await expect.poll(async () => (await fit()).left).toBeGreaterThanOrEqual(0);
  const placed = await fit();
  expect(placed.right).toBeLessThanOrEqual(placed.screen);
  await box.fill('star');
  await box.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=star/);
  await expect(page.getByRole('button', { name: 'Open the menu' })).toBeVisible();
  await noSideScroll(page, 'the search page');
});

test('screenshots of the Journal list, the entry form, an entry page, the search page and Today', async ({ page }) => {
  const dirOut = process.env.EVIDENCE ? 'docs/evidence/stage-6' : 'test-results';
  const today = await serverToday();
  const dream = await kindId('Dream');
  const tarot = await kindId('Tarot');
  const sign = await kindId('Sign');
  await call('POST', '/api/journal', {
    date: plus(today, -2), time: '07:10', kind_id: dream, title: 'The house with the open windows',
    text: 'I walked through a house I did not know, and every window was open. The curtains were moving and I could hear water running somewhere below.\n\nI woke up feeling calm and a little curious.',
    tags: ['water', 'house'],
  });
  const pull = await call('POST', '/api/journal', {
    date: plus(today, -1), time: '20:15', kind_id: tarot, title: 'Three cards for the week',
    text: 'A simple pull to set the tone for the days ahead. The reversed card made me smile, because it is the one I keep meaning to deal with.',
    tags: ['weekly pull', 'Luna'],
    cards: [
      { name: 'The Star', position: 'The week ahead' },
      { name: 'Six of Cups', position: 'What to keep' },
      { name: 'Four of Swords', position: 'What to ease up on', reversed: true },
    ],
  });
  await call('POST', '/api/journal', {
    date: today, time: '09:00', kind_id: sign, title: 'A heron on the garden wall',
    text: 'A grey heron stood on the wall for a full minute this morning, then lifted off without a sound.', tags: ['birds'],
  });

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
    ['journal-list', '/journal', () => expect(page.locator('.journal-row')).toHaveCount(3)],
    ['entry-form', `/journal/${pull.id}/edit`, async () => {
      await expect(page.getByRole('group', { name: 'Cards drawn' }).locator('.list-row')).toHaveCount(3);
      await expect(page.getByLabel('Title')).toHaveValue('Three cards for the week');
    }],
    ['entry-page', `/journal/${pull.id}`, async () => {
      await expect(page.locator('.journal-cards li')).toHaveCount(3);
      await expect(page.locator('.ritual-sky')).toBeVisible();
    }],
    ['search', '/search?q=star', async () => {
      await expect(page.locator('.search-group').first()).toBeVisible();
      await expect(page.locator('.search-group', { has: page.getByRole('heading', { name: 'Journal' }) })).toBeVisible();
    }],
    ['today', '/', async () => {
      await expect(page.getByRole('link', { name: 'A heron on the garden wall' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Write in the journal' })).toBeVisible();
    }],
  ];
  for (const [name, url, ready] of pages) {
    await shot(`${name}-desktop-book-folk`, desktop, url, ready);
    await shot(`${name}-phone-book-folk`, phone, url, ready);
  }

  // The phone menu, open, with the search box.
  await page.setViewportSize(phone);
  await page.goto('/journal');
  await page.getByRole('button', { name: 'Open the menu' }).click();
  await expect(page.getByRole('search').getByRole('searchbox')).toBeVisible();
  await page.getByRole('search').getByRole('searchbox').fill('ease up');
  await page.waitForLoadState('networkidle');
  await noSideScroll(page, 'the open phone menu');
  await page.screenshot({ path: `${dirOut}/phone-menu-search-phone-book-folk.png` });
});

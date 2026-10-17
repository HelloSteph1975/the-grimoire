import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { App } from '../../client/src/App.jsx';

const SETTINGS = { language: 'en', theme: 'book-folk', hemisphere: 'north', time_zone: 'UTC' };
const TODAY = {
  day: '2026-10-16', weekday: 'fri', planets: [], colors: [], coming: [],
  moon: { code: 'new', angle: 0, lit: 0, waxing: true, next: [] },
};
function stubApi(overrides = {}) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    const body = overrides[url] ?? { '/api/settings': SETTINGS, '/api/health': { ok: true, demo: false }, '/api/today': TODAY }[url] ?? [];
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}
afterEach(() => { vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

describe('app shell', () => {
  it('shows the sidebar sections in order', async () => {
    stubApi();
    render(<App />);
    const nav = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(nav).getAllByRole('link').map(a => a.textContent)).toEqual(
      ['Today', 'Book of Spells', 'Correspondences', 'Calendar', 'Rituals', 'Journal', 'Trash', 'Settings']);
  });
  it('has a search box in the sidebar', async () => {
    stubApi();
    render(<App />);
    const search = await screen.findByRole('search');
    expect(search.closest('aside')).not.toBeNull();
    expect(within(search).getByRole('searchbox', { name: 'Search the book' })).toBeInTheDocument();
    expect(within(search).getByRole('button', { name: 'Search' })).toBeInTheDocument();
  });
  it('applies the saved theme to the page', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Sections' });
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('book-folk'));
    expect(document.querySelector('.papel-picado')).not.toBeNull();
  });
  it('shows the Journal list at /journal', async () => {
    stubApi();
    window.history.pushState({}, '', '/journal');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Journal' })).toBeInTheDocument();
    expect(await screen.findByText('The journal is empty. Write down a dream, a pull or a sign.')).toBeInTheDocument();
  });
  it('shows Not found for unknown pages', async () => {
    stubApi();
    window.history.pushState({}, '', '/nope');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('mobile menu and search', () => {
  it('closes the menu after a repeat search on /search', async () => {
    stubApi({ '/api/search?q=a%20b': { q: 'a b', groups: {} } });
    window.history.pushState({}, '', '/search?q=ab');
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Open the menu' }));
    expect(screen.getByRole('button', { name: 'Close the menu' })).toHaveAttribute('aria-expanded', 'true');
    const box = screen.getByRole('searchbox', { name: 'Search the book', hidden: true });
    fireEvent.change(box, { target: { value: 'other' } });
    fireEvent.submit(box.closest('form'));
    await vi.waitFor(() => expect(window.location.search).toBe('?q=other'));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Open the menu' })).toHaveAttribute('aria-expanded', 'false'));
    // The search box is hidden now, so focus moves to the page.
    await vi.waitFor(() => expect(document.querySelector('main')).toHaveFocus());
  });
});

describe('mobile menu focus', () => {
  it('moves focus into the menu, and back to the button on Escape or scrim click', async () => {
    stubApi();
    render(<App />);
    const button = await screen.findByRole('button', { name: 'Open the menu' });
    button.focus();
    fireEvent.click(button);
    await vi.waitFor(() => expect(screen.getByRole('link', { name: 'Today', hidden: true, current: 'page' })).toHaveFocus());
    fireEvent.keyDown(window, { key: 'Escape' });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Open the menu' })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Open the menu' }));
    await vi.waitFor(() => expect(document.querySelector('.scrim')).not.toBeNull());
    fireEvent.click(document.querySelector('.scrim'));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Open the menu' })).toHaveFocus());
  });
});

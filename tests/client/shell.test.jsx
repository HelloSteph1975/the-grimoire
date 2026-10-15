import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { App } from '../../client/src/App.jsx';

const SETTINGS = { language: 'en', theme: 'book-folk', hemisphere: 'north', time_zone: 'UTC' };
function stubApi(overrides = {}) {
  vi.stubGlobal('fetch', vi.fn(async url => {
    const body = overrides[url] ?? { '/api/settings': SETTINGS, '/api/health': { ok: true, demo: false } }[url] ?? [];
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
  it('applies the saved theme to the page', async () => {
    stubApi();
    render(<App />);
    await screen.findByRole('navigation', { name: 'Sections' });
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('book-folk'));
    expect(document.querySelector('.papel-picado')).not.toBeNull();
  });
  it('shows a placeholder for sections built later', async () => {
    stubApi();
    window.history.pushState({}, '', '/rituals');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Rituals' })).toBeInTheDocument();
    expect(screen.getByText(/Stage 5/)).toBeInTheDocument();
  });
  it('shows Not found for unknown pages', async () => {
    stubApi();
    window.history.pushState({}, '', '/nope');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
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

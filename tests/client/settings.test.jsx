import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../client/src/App.jsx';

let saved;
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
function stub({ locales = [{ code: 'en', name: 'English' }, { code: 'es', name: 'Español' }] } = {}) {
  saved = { language: 'en', theme: 'old-book', hemisphere: 'north', time_zone: 'UTC' };
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    if (url === '/api/settings' && opts.method === 'PUT') { saved = { ...saved, ...JSON.parse(opts.body) }; return json(saved); }
    if (url === '/api/settings') return json(saved);
    if (url === '/api/locales') return json(locales);
    if (url.startsWith('/api/locales/')) return json({});
    if (url === '/api/data-folder/open') return json({ error: 'Could not open the folder.' }, 500);
    if (url === '/api/health') return json({ ok: true, demo: false });
    if (url === '/api/data-folder') return json({ path: 'C:\\Data' });
    return json([]);
  }));
}
afterEach(() => { vi.unstubAllGlobals(); window.history.pushState({}, '', '/'); });

describe('Settings', () => {
  it('saves the theme and applies it', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Look'), 'book-folk');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(document.documentElement.dataset.theme).toBe('book-folk'));
    expect(saved.theme).toBe('book-folk');
  });
  it('lists the language packs it finds', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(await screen.findByRole('option', { name: 'Español' })).toBeInTheDocument();
  });
  it('hides the language picker when only English is available', async () => {
    stub({ locales: [{ code: 'en', name: 'English' }] });
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(await screen.findByLabelText('Look')).toBeInTheDocument();
    expect(screen.queryByLabelText('Language')).not.toBeInTheDocument();
  });
  it('still shows the language picker when the saved language is not English', async () => {
    stub({ locales: [{ code: 'en', name: 'English' }] });
    saved.language = 'es';
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(await screen.findByLabelText('Language')).toHaveValue('es');
  });
  it('says so when the data folder will not open', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Open folder' }));
    expect(await screen.findByText('Could not open the folder.')).toBeInTheDocument();
  });
  it('asks before leaving with an unsaved change', async () => {
    stub();
    window.history.pushState({}, '', '/settings');
    render(<App />);
    await userEvent.selectOptions(await screen.findByLabelText('Hemisphere'), 'south');
    await userEvent.click(screen.getAllByRole('link', { name: 'Today' })[0]);
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
  });
  it('shows a saved time zone that is not in the list, and sends only what changed', async () => {
    stub();
    saved.time_zone = 'Mars/Base';
    window.history.pushState({}, '', '/settings');
    render(<App />);
    expect(await screen.findByLabelText('Time zone')).toHaveValue('Mars/Base');
    await userEvent.selectOptions(screen.getByLabelText('Look'), 'book-folk');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(saved.theme).toBe('book-folk'));
    const put = fetch.mock.calls.find(([, o]) => o?.method === 'PUT');
    expect(JSON.parse(put[1].body)).toEqual({ theme: 'book-folk' });
  });
});

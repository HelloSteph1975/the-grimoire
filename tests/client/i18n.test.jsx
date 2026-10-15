import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider, useT } from '../../client/src/i18n/I18nProvider.jsx';

function Show() {
  const { t, tc } = useT();
  return <p>{t('nav.today')} | {t('trash.count', { n: 3 })} | {t('no.such.key')} | {tc('tradition.wiccan', 'name', 'Wiccan')}</p>;
}
afterEach(() => vi.unstubAllGlobals());

describe('translations', () => {
  it('uses English by default and falls back to the key', () => {
    render(<I18nProvider language="en"><Show /></I18nProvider>);
    expect(screen.getByText('Today | 3 items | no.such.key | Wiccan')).toBeInTheDocument();
  });
  it('uses a language pack, falling back to English for missing keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(
      url.endsWith('/ui') ? { _name: 'Español', 'nav.today': 'Hoy' } : { 'tradition.wiccan.name': 'Wicca' },
    ), { status: 200 })));
    render(<I18nProvider language="es"><Show /></I18nProvider>);
    expect(await screen.findByText('Hoy | 3 items | no.such.key | Wicca')).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.lang).toBe('es'));
  });
  it('stays in English if the pack cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    render(<I18nProvider language="es"><Show /></I18nProvider>);
    expect(await screen.findByText('Today | 3 items | no.such.key | Wiccan')).toBeInTheDocument();
  });
});

describe('damaged language packs', () => {
  const stubPack = (ui, content) => vi.stubGlobal('fetch', vi.fn(async url => new Response(JSON.stringify(url.endsWith('/ui') ? ui : content), { status: 200 })));
  it.each([[null, null], [[1, 2], ['x']], [{ 'nav.today': 5, 'nav.trash': 'Papelera' }, { 'tradition.wiccan.name': { a: 1 } }]])(
    'ignores bad entries (%j, %j)', async (ui, content) => {
      stubPack(ui, content);
      render(<I18nProvider language="es"><Show /></I18nProvider>);
      await waitFor(() => expect(document.documentElement.lang).toBe('es'));
      expect(screen.getByText('Today | 3 items | no.such.key | Wiccan')).toBeInTheDocument();
    });
  it('keeps lang as en when the pack fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    render(<I18nProvider language="es"><Show /></I18nProvider>);
    await screen.findByText(/Today/);
    expect(document.documentElement.lang).toBe('en');
  });
});

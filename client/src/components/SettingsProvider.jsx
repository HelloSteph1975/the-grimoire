import { createContext, useCallback, useContext, useEffect } from 'react';
import { useResource } from '../lib/useResource.js';
import { I18nProvider } from '../i18n/I18nProvider.jsx';

const Ctx = createContext({ settings: null, reload: () => {}, save: async () => {} });
export const useSettings = () => useContext(Ctx);

export function SettingsProvider({ children }) {
  const res = useResource('/api/settings');
  const settings = res.data;
  useEffect(() => {
    document.documentElement.dataset.theme = settings?.theme ?? 'old-book';
  }, [settings?.theme]);
  const save = useCallback(values => res.save(values, { method: 'put' }), [res]);
  return (
    <Ctx.Provider value={{ settings, reload: res.reload, save, error: res.error }}>
      <I18nProvider language={settings?.language ?? 'en'}>{children}</I18nProvider>
    </Ctx.Provider>
  );
}

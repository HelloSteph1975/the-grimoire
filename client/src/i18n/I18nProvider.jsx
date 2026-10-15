import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text);
const Ctx = createContext(null);

// A damaged language file must never break the app: keep only plain string entries.
const strings = obj => (obj && typeof obj === 'object' && !Array.isArray(obj)
  ? Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v === 'string')) : {});

export function I18nProvider({ language = 'en', children }) {
  // `for` is the language this pack was loaded for (it stays English if the pack failed).
  const [pack, setPack] = useState({ code: 'en', for: 'en', ui: {}, content: {} });

  useEffect(() => {
    let live = true;
    if (language === 'en') { setPack({ code: 'en', for: 'en', ui: {}, content: {} }); return undefined; }
    const get = part => fetch(`/api/locales/${encodeURIComponent(language)}/${part}`).then(r => (r.ok ? r.json() : {}));
    Promise.all([get('ui'), get('content')]).then(
      ([ui, content]) => live && setPack({ code: language, for: language, ui: strings(ui), content: strings(content) }),
      () => live && setPack({ code: 'en', for: language, ui: {}, content: {} }),
    );
    return () => { live = false; };
  }, [language]);

  useEffect(() => { document.documentElement.lang = pack.code; }, [pack.code]);

  const t = useCallback((key, vars) => fill(pack.ui[key] ?? en[key] ?? key, vars), [pack]);
  const tc = useCallback((starterKey, field, fallback) => (starterKey && pack.content[`${starterKey}.${field}`]) || fallback, [pack]);
  const ready = pack.for === language;
  const value = useMemo(() => ({ t, tc, language: pack.code, ready }), [t, tc, pack.code, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK = { t: (k, v) => fill(en[k] ?? k, v), tc: (s, f, fb) => fb, language: 'en', ready: true };

// Works outside a provider too (tests, early errors): plain English.
export function useT() {
  return useContext(Ctx) ?? FALLBACK;
}

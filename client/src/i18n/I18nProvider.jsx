import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from './en.json';

const fill = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : text);
const Ctx = createContext(null);

// Simple plurals: with a number `n`, `<key>.one` is used when n is 1, otherwise `<key>.other`
// or `<key>`. The forms all come from the pack when it has any of them, so a pack without a
// `.one` form never borrows the English one.
const FORMS = ['', '.one', '.other'];
function pickText(ui, key, vars) {
  const source = FORMS.some(f => ui[key + f] !== undefined) ? ui : en;
  const n = vars?.n;
  if (typeof n === 'number') {
    const text = (n === 1 && source[`${key}.one`]) || source[`${key}.other`] || source[key];
    if (text !== undefined) return text;
  }
  return source[key] ?? en[key] ?? key;
}
export const translate = (ui, key, vars) => fill(pickText(ui, key, vars), vars);

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

  const t = useCallback((key, vars) => translate(pack.ui, key, vars), [pack]);
  const tc = useCallback((starterKey, field, fallback) => (starterKey && pack.content[`${starterKey}.${field}`]) || fallback, [pack]);
  const ready = pack.for === language;
  const value = useMemo(() => ({ t, tc, language: pack.code, ready }), [t, tc, pack.code, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK = { t: (k, v) => translate({}, k, v), tc: (s, f, fb) => fb, language: 'en', ready: true };

// Works outside a provider too (tests, early errors): plain English.
export function useT() {
  return useContext(Ctx) ?? FALLBACK;
}

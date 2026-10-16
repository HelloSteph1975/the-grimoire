import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { errorText } from '../lib/errors.js';
import { sortByName } from '../lib/collate.js';
import { useT } from '../i18n/I18nProvider.jsx';

// `query` is added to the search URL (for example '&feasts=1'). In `single` mode the picker holds
// at most one entry and hides the search box while one is chosen.
export function EntryPicker({ value = [], onChange, excludeId, query = '', single = false, label, placeholder }) {
  const { t, tc, language } = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const inputRef = useRef(null);
  const removeRef = useRef(null);
  // In single mode the input and the chip swap places, so focus moves after the render.
  const focusNext = useRef(null);
  const [done, setDone] = useState(false);
  const full = single && value.length > 0;

  useEffect(() => {
    const want = focusNext.current;
    focusNext.current = null;
    if (want === 'input') inputRef.current?.focus();
    else if (want === 'remove') removeRef.current?.focus();
  });

  useEffect(() => {
    const term = q.trim();
    const mine = ++seq.current;
    setDone(false);
    if (!term) { setResults([]); setError(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const rows = await api.get(`/api/correspondences?q=${encodeURIComponent(term)}${query}`);
        if (mine !== seq.current) return;
        setResults(rows);
        setError(null);
        setDone(true);
      } catch (err) {
        if (mine !== seq.current) return;
        setResults([]);
        setError(errorText(err, t));
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, t, query]);

  const chosen = new Set(value.map(v => v.id));
  const nameOf = r => tc(r.is_starter ? r.starter_key : null, 'name', r.name);
  const shown = sortByName(results.filter(r => r.id !== excludeId && !chosen.has(r.id)), nameOf, language).slice(0, 10);

  function add(r) {
    onChange(single ? [{ id: r.id, name: nameOf(r) }] : [...value, { id: r.id, name: nameOf(r) }]);
    setQ('');
    setResults([]);
    if (single) focusNext.current = 'remove';
    else inputRef.current?.focus();
  }

  function remove(id) {
    onChange(value.filter(x => x.id !== id));
    if (single) focusNext.current = 'input';
    else inputRef.current?.focus();
  }

  return (
    <div className="entry-picker">
      {value.length > 0 && (
        <ul className="chips">
          {value.map(v => (
            <li key={v.id} className="chip">
              <span>{v.name}</span>
              <button ref={removeRef} type="button" className="chip-remove" aria-label={t('chips.remove', { item: v.name })}
                onClick={() => remove(v.id)}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && <input ref={inputRef} type="text" className="input" aria-label={label ?? t('picker.search')} placeholder={placeholder} value={q} onChange={e => setQ(e.target.value)} />}
      {!full && error && <small className="field-error" role="alert">{error}</small>}
      <div role="status" className="picker-none">{!full && !error && done && shown.length === 0 ? t('picker.none') : null}</div>
      {!full && shown.length > 0 && (
        <ul className="picker-results">
          {shown.map(r => (
            <li key={r.id}><button type="button" className="btn-link" onClick={() => add(r)}>{nameOf(r)}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../lib/api.js';
import { errorText } from '../lib/errors.js';
import { useT } from '../i18n/I18nProvider.jsx';

export function EntryPicker({ value = [], onChange, excludeId }) {
  const { t, tc } = useT();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const inputRef = useRef(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const term = q.trim();
    const mine = ++seq.current;
    setDone(false);
    if (!term) { setResults([]); setError(null); return undefined; }
    const timer = setTimeout(async () => {
      try {
        const rows = await api.get(`/api/correspondences?q=${encodeURIComponent(term)}`);
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
  }, [q, t]);

  const chosen = new Set(value.map(v => v.id));
  const shown = results.filter(r => r.id !== excludeId && !chosen.has(r.id)).slice(0, 10);
  const nameOf = r => tc(r.is_starter ? r.starter_key : null, 'name', r.name);

  function add(r) {
    onChange([...value, { id: r.id, name: nameOf(r) }]);
    setQ('');
    setResults([]);
    inputRef.current?.focus();
  }

  return (
    <div className="entry-picker">
      {value.length > 0 && (
        <ul className="chips">
          {value.map(v => (
            <li key={v.id} className="chip">
              <span>{v.name}</span>
              <button type="button" className="chip-remove" aria-label={t('chips.remove', { item: v.name })}
                onClick={() => { onChange(value.filter(x => x.id !== v.id)); inputRef.current?.focus(); }}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input ref={inputRef} type="text" className="input" aria-label={t('picker.search')} value={q} onChange={e => setQ(e.target.value)} />
      {error && <small className="field-error" role="alert">{error}</small>}
      <div role="status" className="picker-none">{!error && done && results.length === 0 ? t('picker.none') : null}</div>
      {shown.length > 0 && (
        <ul className="picker-results">
          {shown.map(r => (
            <li key={r.id}><button type="button" className="btn-link" onClick={() => add(r)}>{nameOf(r)}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

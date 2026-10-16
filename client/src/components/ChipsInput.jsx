import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';

export function ChipsInput({ id, value = [], onChange, max = 20, maxLength = 30, label, pending, onPendingChange }) {
  const { t } = useT();
  // A parent that passes `pending` owns the unconfirmed text, so it can count it as a change.
  const [own, setOwn] = useState('');
  const controlled = pending !== undefined;
  const text = controlled ? pending : own;
  const setText = next => { setOwn(next); onPendingChange?.(next); };
  const inputRef = useRef(null);
  const full = value.length >= max;

  function commit(raw) {
    const word = raw.trim().toLowerCase();
    if (!word || word.length > maxLength || full || value.includes(word)) return false;
    onChange([...value, word]);
    return true;
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (commit(text)) setText('');
    } else if (e.key === 'Backspace' && text === '' && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="chips-input">
      <ul className="chips">
        {value.map(item => (
          <li key={item} className="chip">
            <span>{item}</span>
            <button type="button" className="chip-remove" aria-label={t('chips.remove', { item })}
              onClick={() => { onChange(value.filter(v => v !== item)); inputRef.current?.focus(); }}>
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <input ref={inputRef} id={id} type="text" className="input" aria-label={label} value={text} maxLength={maxLength + 1}
        onChange={e => setText(e.target.value.replace(/,/g, ''))} onKeyDown={onKeyDown}
        onBlur={() => { if (text && commit(text)) setText(''); }} />
      {text.trim() && <small className="field-hint">{t('chips.hint')}</small>}
      <small className="field-hint">{t('chips.limit', { max })}</small>
    </div>
  );
}

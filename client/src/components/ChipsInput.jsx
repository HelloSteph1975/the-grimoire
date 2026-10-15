import { useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';

export function ChipsInput({ id, value = [], onChange, max = 20, maxLength = 30, label }) {
  const { t } = useT();
  const [text, setText] = useState('');
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
              onClick={() => onChange(value.filter(v => v !== item))}>
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <input id={id} type="text" className="input" aria-label={label} value={text} maxLength={maxLength + 1}
        onChange={e => setText(e.target.value.replace(/,/g, ''))} onKeyDown={onKeyDown} disabled={full} />
      <small className="field-hint">{t('chips.limit', { max })}</small>
    </div>
  );
}

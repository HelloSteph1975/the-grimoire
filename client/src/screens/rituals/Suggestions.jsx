import { LoadState } from '../../components/LoadState.jsx';
import { useResource } from '../../lib/useResource.js';
import { formatDay } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

const LONG = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

// The days that suit a spell, as buttons that set the ritual's date. `spell` is the spell's
// full record (for its feast names), or null while it loads; `spellError` is why it didn't.
export function Suggestions({ spellId, spell, spellError, onSpellRetry, date, onPick }) {
  const { t, tc, language } = useT();
  const list = useResource(`/api/spells/${spellId}/suggestions`);
  const feastById = new Map((spell?.feasts ?? []).map(f => [f.id, f]));
  const metText = met => {
    const labels = [
      ...(met.moon ?? []).map(c => t(`timing.moon.${c}`)),
      ...(met.days ?? []).map(c => t(`timing.day.${c}`)),
      ...(met.planets ?? []).map(c => t(`timing.planet.${c}`)),
      ...(met.feasts ?? []).filter(id => feastById.has(id)).map(id => {
        const f = feastById.get(id);
        return starterText(tc, f, 'name', f.name);
      }),
    ];
    return t('rituals.met', { list: new Intl.ListFormat(language, { type: 'conjunction' }).format(labels) });
  };
  const items = list.data?.suggestions;
  // An empty list means either no timing at all or no day that matches it.
  const timing = spell?.timing ?? {};
  const timed = ['moon', 'day', 'planet'].some(k => timing[k]?.length > 0) || (spell?.feasts?.length ?? 0) > 0;
  const retry = () => { list.reload(); if (spellError) onSpellRetry(); };

  return (
    <fieldset className="field field-group ritual-suggestions">
      <legend>{t('rituals.suggestions')}</legend>
      <LoadState loading={!items || !spell} error={list.error ?? spellError} onRetry={retry}>
        {items?.length === 0 && <p className="muted">{timed ? t('rituals.noMatches') : t('rituals.noSuggestions')}</p>}
        {items?.length > 0 && (
          <div className="suggestion-list">
            {items.map(s => (
              <button key={s.day} type="button" className="suggestion" aria-pressed={date === s.day} onClick={() => onPick(s.day)}>
                <span>{formatDay(s.day, language, LONG)}</span>
                <small>{metText(s.met)}</small>
              </button>
            ))}
          </div>
        )}
      </LoadState>
    </fieldset>
  );
}

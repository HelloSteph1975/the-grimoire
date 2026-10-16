import { ToggleGroup } from '../../components/ToggleGroup.jsx';
import { EntryPicker } from '../../components/EntryPicker.jsx';
import { TIMING } from '../../lib/timing.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const GROUPS = [
  { key: 'moon', label: 'spells.moon' },
  { key: 'day', label: 'spells.days' },
  { key: 'planet', label: 'spells.planets' },
];

// Moon phases, days and planets as toggle rows, then the sabbats and feasts picker
// (entries with a feast day, or sabbat entries).
export function TimingFields({ timing, onTimingChange, feasts, onFeastsChange, errors }) {
  const { t } = useT();
  const note = key => errors[key] && <small className="field-error" role="alert">{errors[key]}</small>;
  return (
    <fieldset className="field field-group spell-timing">
      <legend>{t('spells.timing')}</legend>
      {note('timing')}
      {GROUPS.map(g => (
        <div key={g.key} className="field">
          {/* The group itself carries the label for screen readers. */}
          <span className="spell-timing-label" aria-hidden="true">{t(g.label)}</span>
          <ToggleGroup label={t(g.label)} value={timing[g.key]}
            options={TIMING[g.key].map(code => ({ value: code, label: t(`timing.${g.key}.${code}`) }))}
            onChange={list => onTimingChange({ ...timing, [g.key]: list })} />
          {note(`timing.${g.key}`)}
        </div>
      ))}
      <fieldset className="field field-group">
        <legend className="spell-timing-label">{t('spells.feasts')}</legend>
        <EntryPicker query="&feasts=1" label={t('spells.feastPick')} placeholder={t('spells.feastPick')} value={feasts} onChange={onFeastsChange} />
        {note('feasts')}
      </fieldset>
    </fieldset>
  );
}

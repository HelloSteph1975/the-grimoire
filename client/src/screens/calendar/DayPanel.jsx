import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { MoonIcon } from '../../components/MoonIcon.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { formatDay, formatTime } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { QUARTER_MOON, itemKey, itemName, itemPath, markClass } from './items.js';

const LONG = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

// A quarter's moment in the owner's time zone. A zone the browser doesn't know falls back to
// the browser's own.
function moonTime(at, language, zone) {
  const options = { hour: 'numeric', minute: '2-digit' };
  try {
    return new Intl.DateTimeFormat(language, { ...options, timeZone: zone }).format(new Date(at));
  } catch {
    return new Intl.DateTimeFormat(language, options).format(new Date(at));
  }
}

// One day's items: the moon first, then the rest by shown name, each with its kind.
export function ItemList({ day }) {
  const { t, tc, language } = useT();
  const { settings } = useSettings();
  return (
    <ul className="cal-items">
      {day.moon.map(item => (
        <li key={itemKey(item)} className="cal-item">
          <MoonIcon {...QUARTER_MOON[item.quarter]} size={20} />
          <span>{itemName(item, t, tc)}</span>
          <span className="muted">{t('calendar.at', { time: moonTime(item.at, language, settings?.time_zone) })}</span>
        </li>
      ))}
      {day.marks.map(item => (
        <li key={itemKey(item)} className={`cal-item ${markClass(item)}`}>
          {item.kind === 'ritual' ? <Flame className="cal-flame" size={16} aria-hidden="true" /> : <span className="cal-dot" aria-hidden="true" />}
          <Link to={itemPath(item)}>{itemName(item, t, tc)}</Link>
          {item.kind === 'ritual' && item.ritual.time && <span className="muted">{formatTime(item.ritual.time, language)}</span>}
          {item.kind === 'ritual' && <span className="tag">{t(`rituals.status.${item.ritual.status}`)}</span>}
          <span className="cal-kind">{t(`calendar.kind.${item.kind}`)}</span>
        </li>
      ))}
    </ul>
  );
}

export function DayPanel({ day, items }) {
  const { t, language } = useT();
  const title = formatDay(day, language, LONG);
  const empty = !items || (items.moon.length === 0 && items.marks.length === 0);
  return (
    <section className="cal-panel" aria-label={title}>
      <h2>{title}</h2>
      {empty ? <p className="muted">{t('calendar.empty')}</p> : <ItemList day={items} />}
    </section>
  );
}

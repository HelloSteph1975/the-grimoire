import { formatDay, monthOf } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { ItemList } from './DayPanel.jsx';

// The shown month's days that have something on them, in date order.
export function CalendarList({ month, days }) {
  const { t, language } = useT();
  const inMonth = [...days].filter(([day]) => monthOf(day) === month);
  if (inMonth.length === 0) return <p className="muted">{t('calendar.monthEmpty')}</p>;
  return (
    <ol className="cal-list">
      {inMonth.map(([day, items]) => (
        <li key={day}>
          <h3>{formatDay(day, language, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
          <ItemList day={items} />
        </li>
      ))}
    </ol>
  );
}

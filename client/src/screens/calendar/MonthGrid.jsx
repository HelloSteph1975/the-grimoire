import { MoonIcon } from '../../components/MoonIcon.jsx';
import { dayInRange, formatDay, gridDays, monthOf } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { QUARTER_MOON, itemKey, itemName } from './items.js';

const LONG = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const EMPTY = { moon: [], marks: [] };

// Seven columns from Monday. Each day is a button that opens the day panel. On a phone the
// names hide and the colored marks stay, one per item. A button holds only phrasing
// content, so the marks are spans, not a list. Days past 2100 are shown but can't be opened.
export function MonthGrid({ month, days, today, selected, onSelect }) {
  const { t, tc, language } = useT();
  const shown = gridDays(month);
  const weeks = [];
  for (let i = 0; i < shown.length; i += 7) weeks.push(shown.slice(i, i + 7));

  return (
    <table className="cal-grid">
      <thead>
        <tr>
          {weeks[0].map(day => (
            <th key={day} scope="col" abbr={formatDay(day, language, { weekday: 'long' })}>{formatDay(day, language, { weekday: 'short' })}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map(week => (
          <tr key={week[0]}>
            {week.map(day => {
              const { moon, marks } = days.get(day) ?? EMPTY;
              const n = moon.length + marks.length;
              const out = monthOf(day) !== month;
              const className = ['cal-day', out && 'cal-out', day === today && 'cal-today'].filter(Boolean).join(' ');
              return (
                <td key={day}>
                  <button type="button" className={className} aria-pressed={day === selected} disabled={!dayInRange(day)}
                    aria-current={day === today ? 'date' : undefined}
                    aria-label={t('calendar.dayLabel', { date: formatDay(day, language, LONG), n })}
                    onClick={() => onSelect(day)}>
                    <span className="cal-num">{Number(day.slice(8))}</span>
                    {moon[0] && (
                      <span className="cal-moon">
                        <MoonIcon {...QUARTER_MOON[moon[0].quarter]} size={16} title={itemName(moon[0], t, tc)} />
                      </span>
                    )}
                    {marks.length > 0 && (
                      <span className="cal-marks">
                        {marks.map(item => (
                          <span key={itemKey(item)} className={`cal-mark cal-kind-${item.kind}`}>
                            <span className="cal-dot" aria-hidden="true" />
                            <span className="cal-name">{itemName(item, t, tc)}</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useResource } from '../../lib/useResource.js';
import { FIRST_MONTH, LAST_MONTH, addMonths, formatDay, dayInRange, gridDays, gridRange, monthOf, validMonth } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { byDay } from './items.js';
import { MonthGrid } from './MonthGrid.jsx';
import { CalendarList } from './CalendarList.jsx';
import { DayPanel } from './DayPanel.jsx';

// URL state: ?month=YYYY-MM&view=month|list&day=YYYY-MM-DD. No month (or a bad one) means the
// month of the server's today.
export function Calendar() {
  const { t, tc, language } = useT();
  const [params, setParams] = useSearchParams();
  const today = useResource('/api/today');
  const todayDay = today.data?.day ?? null;

  const asked = params.get('month');
  const badMonth = asked !== null && !validMonth(asked);
  const month = validMonth(asked) ? asked : todayDay && monthOf(todayDay);
  const view = params.get('view') === 'list' ? 'list' : 'month';
  const range = month && gridRange(month);
  const calendar = useResource(range ? `/api/calendar?from=${range.from}&to=${range.to}` : null);

  const change = (edit, opts) => {
    const next = new URLSearchParams(params);
    edit(next);
    setParams(next, opts);
  };
  useEffect(() => { if (badMonth) change(p => p.delete('month'), { replace: true }); }, [badMonth]); // Runs in the render that saw the bad month, so `change` holds that render's params.

  const openDay = params.get('day');
  const day = dayInRange(openDay) && month && gridDays(month).includes(openDay) ? openDay : null;
  const goMonth = m => change(p => { p.set('month', m); p.delete('day'); });
  // Ask the server for the day again: the page may have stayed open past midnight.
  const goToday = () => { today.reload(); change(p => { p.delete('month'); p.delete('day'); }); };
  const setView = v => change(p => { if (v === 'list') p.set('view', 'list'); else p.delete('view'); });
  const days = calendar.data && byDay(calendar.data.items, t, tc, language);
  const retry = () => { today.reload(); calendar.reload(); };
  // Clicking the open day again closes it.
  const selectDay = d => change(p => { if (d === day) p.delete('day'); else p.set('day', d); });
  // The list hides the day panel, so only the month view prefills the day.
  const prefill = view === 'month' && day;

  return (
    <div className="calendar">
      <PageHeader title={t('calendar.title')}>
        <Button as={Link} icon={Plus} to={prefill ? `/calendar/dates/new?date=${day}` : '/calendar/dates/new'}>{t('calendar.addDate')}</Button>
      </PageHeader>
      {/* The bar stays mounted while a month loads, so the pressed button keeps focus. */}
      {month && (
        <div className="cal-bar">
          <div className="cal-nav">
            <Button variant="ghost" icon={ChevronLeft} aria-label={t('calendar.prev')} disabled={month <= FIRST_MONTH}
              onClick={() => goMonth(addMonths(month, -1))} />
            <h2>{formatDay(month, language, { month: 'long', year: 'numeric' })}</h2>
            <Button variant="ghost" icon={ChevronRight} aria-label={t('calendar.next')} disabled={month >= LAST_MONTH}
              onClick={() => goMonth(addMonths(month, 1))} />
          </div>
          <div className="cal-tools">
            <Button variant="ghost" onClick={goToday}>{t('calendar.today')}</Button>
            <div className="cal-views" role="group" aria-label={t('calendar.view')}>
              <button type="button" className="corr-tab" aria-pressed={view === 'month'} onClick={() => setView('month')}>{t('calendar.month')}</button>
              <button type="button" className="corr-tab" aria-pressed={view === 'list'} onClick={() => setView('list')}>{t('calendar.list')}</button>
            </div>
          </div>
        </div>
      )}
      {/* Today only matters for the month when none is named; without it the grid just has no outline. */}
      <LoadState loading={!days} error={calendar.error ?? (month ? null : today.error)} onRetry={retry}>
        {month && days && (view === 'list' ? <CalendarList month={month} days={days} /> : (
          <div className="cal-month">
            <MonthGrid month={month} days={days} today={todayDay} selected={day} onSelect={selectDay} />
            {day && <DayPanel day={day} items={days.get(day)} />}
          </div>
        ))}
      </LoadState>
    </div>
  );
}

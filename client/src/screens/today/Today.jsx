import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { MoonIcon } from '../../components/MoonIcon.jsx';
import { useResource } from '../../lib/useResource.js';
import { sortByName } from '../../lib/collate.js';
import { formatDay as fmtDay, formatTime } from '../../lib/days.js';
import { useT, translate } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

export function Today() {
  const { t, tc, language } = useT();
  const { data, error, loading, reload } = useResource('/api/today');

  return (
    <LoadState loading={loading} error={error} onRetry={reload}>
      {data && <TodayBody data={data} t={t} tc={tc} language={language} />}
    </LoadState>
  );
}

function TodayBody({ data, t, tc, language }) {
  const shown = r => starterText(tc, r, 'name', r.name);
  const links = rows => {
    const sorted = sortByName(rows, shown, language);
    const parts = new Intl.ListFormat(language, { type: 'conjunction' }).formatToParts(sorted.map(r => String(r.id)));
    return parts.map((p, i) => {
      if (p.type === 'literal') return <Fragment key={i}>{p.value}</Fragment>;
      const row = sorted.find(r => String(r.id) === p.value);
      return <Link key={i} to={`/correspondences/${row.id}`}>{shown(row)}</Link>;
    });
  };
  const weekday = fmtDay(data.day, language, { weekday: 'long' });
  // Each sentence is split around its placeholders so the names can be links. The markers are
  // private-use characters, so they can't clash with text in a pack.
  const MARK = /(\w)/;
  const marks = { weekday: 'w', planets: 'p', colors: 'c' };
  const parts = { w: () => weekday, p: () => links(data.planets), c: () => links(data.colors) };
  const sentence = (key, names, vars = {}) => {
    const v = { ...marks, ...vars };
    let text = t(key, v);
    // A pack string that drops or repeats a placeholder would hide a name, so it falls back to English.
    const once = k => text.split(marks[k]).length === 2;
    if (!names.every(once)) text = translate({}, key, v);
    return text.split(MARK).map((s, i) => <Fragment key={i}>{i % 2 ? parts[s]() : s}</Fragment>);
  };
  const clauses = [];
  if (data.planets.length > 0) clauses.push(<Fragment key="p">{sentence('today.dayPlanets', ['weekday', 'planets'])}</Fragment>);
  if (data.colors.length > 0) clauses.push(<Fragment key="c">{sentence('today.dayColors', ['colors'], { n: data.colors.length })}</Fragment>);
  const dayLine = clauses.length === 0 ? t('today.dayOnly', { weekday })
    : clauses.flatMap((c, i) => (i ? [' ', c] : [c]));
  const week = data.week ?? [];
  const reminders = data.reminders ?? [];
  const moon = data.moon;
  const phase = t(`timing.moon.${moon.code}`);

  return (
    <div className="today">
      <PageHeader title={fmtDay(data.day, language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} />
      <section className="today-moon" aria-label={phase}>
        <MoonIcon lit={moon.lit} waxing={moon.waxing} size={96} />
        <div>
          <p className="today-phase">{phase}</p>
          <p className="today-lit">{t('today.lit', { n: Math.round(moon.lit * 100) })}</p>
          {moon.next.length > 0 && (
            <>
              <h2>{t('today.next')}</h2>
              <ul className="today-next">
                {moon.next.map(q => (
                  <li key={q.quarter}>{t('today.nextLine', { phase: t(`timing.moon.${q.quarter}`), date: fmtDay(q.day, language, { month: 'short', day: 'numeric' }) })}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
      <section>
        <h2>{t('today.day')}</h2>
        <p className="today-day">{dayLine}</p>
      </section>
      <section>
        <h2>{t('today.coming')}</h2>
        {data.coming.length === 0 ? <p className="muted">{t('today.nothingComing')}</p> : (
          <ul className="today-coming">
            {data.coming.map((c, i) => {
              const link = c.kind === 'own'
                ? <Link to={`/calendar/dates/${c.date.id}`}>{c.date.title}</Link>
                : <Link to={`/correspondences/${c.entry.id}`}>{shown(c.entry)}</Link>;
              return (
                <li key={`${c.day}-${c.kind}-${c.entry?.id ?? c.date?.id}-${i}`}>
                  <span className="today-coming-name">{link}</span>
                  <span className="today-coming-when">{t('today.inDays', { n: c.days_away })}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {week.length > 0 && (
        <section>
          <h2>{t('today.week')}</h2>
          <ul className="today-rituals">
            {week.map(r => (
              <li key={r.id}>
                <span className="today-ritual-when">
                  {fmtDay(r.date, language, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {r.time && <span className="today-ritual-when">{formatTime(r.time, language)}</span>}
                <Link to={`/rituals/${r.id}`}>{r.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {reminders.length > 0 && (
        <section>
          <h2>{t('today.reminders')}</h2>
          <ul className="today-rituals">
            {reminders.map(r => {
              const when = r.days_away === 0 ? t('today.today') : t('today.inDays', { n: r.days_away });
              return <li key={r.id}><Link to={`/rituals/${r.id}`}>{t('today.reminderLine', { title: r.title, when })}</Link></li>;
            })}
          </ul>
        </section>
      )}
      <p className="muted today-later">{t('today.laterJournal')}</p>
    </div>
  );
}

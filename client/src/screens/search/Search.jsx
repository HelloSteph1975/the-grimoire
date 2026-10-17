import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useResource } from '../../lib/useResource.js';
import { formatDay } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

const MIN = 2;
const GROUPS = ['spells', 'correspondences', 'rituals', 'journal', 'dates'];
const SEE_ALL = { spells: '/spells', correspondences: '/correspondences', journal: '/journal' };
const DAY = { year: 'numeric', month: 'short', day: 'numeric' };

export function Search() {
  const { t, tc, language } = useT();
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const long = q.length >= MIN;
  const result = useResource(long ? `/api/search?${new URLSearchParams({ q })}` : null);
  const categories = useResource(long ? '/api/categories' : null);
  const kinds = useResource(long ? '/api/journal-kinds' : null);
  const catById = new Map((categories.data ?? []).map(c => [c.id, c]));
  const kindById = new Map((kinds.data ?? []).map(k => [k.id, k]));
  const day = d => <time dateTime={d}>{formatDay(d, language, DAY)}</time>;

  // How each group's items look: [link, name, detail].
  const line = {
    spells: s => [`/spells/${s.id}`, s.title, s.purpose],
    correspondences: c => {
      const cat = catById.get(c.category_id);
      return [`/correspondences/${c.id}`, starterText(tc, c, 'name', c.name),
        [cat && starterText(tc, cat, 'name', cat.name), c.summary && starterText(tc, c, 'summary', c.summary)].filter(Boolean).join(' · ')];
    },
    rituals: r => [`/rituals/${r.id}`, r.title, <>{day(r.date)} · {t(`rituals.status.${r.status}`)}</>],
    journal: j => {
      const k = kindById.get(j.kind_id);
      return [`/journal/${j.id}`, j.title || j.excerpt || t('journal.untitled'),
        <>{day(j.date)}{k && <> · {starterText(tc, k, 'name', k.name)}</>}</>];
    },
    dates: d => [`/calendar/dates/${d.id}`, d.title, day(d.date)],
  };

  const groups = result.data?.groups;
  const shown = groups ? GROUPS.filter(g => groups[g]?.total > 0) : [];
  // Only the search itself can block the results; a failed name lookup just leaves those names out.
  const error = result.error;
  const retry = () => result.reload();

  return (
    <>
      <PageHeader title={t('search.title')} />
      {!long && <p className="muted">{t('search.tooShort')}</p>}
      {long && (
        <LoadState loading={!groups && !error} error={error} onRetry={retry}>
          <p>{t('search.results', { q })}</p>
          {groups && shown.length === 0 && <p className="muted">{t('search.none', { q })}</p>}
          {shown.map(g => {
            const { total, items } = groups[g];
            return (
              <section key={g} className="search-group" aria-labelledby={`search-${g}`}>
                <h2 id={`search-${g}`}>{t(`search.group.${g}`)} <span className="muted search-count">{t('search.count', { n: total })}</span></h2>
                <ul className="list corr-list">
                  {items.map(item => {
                    const [to, name, detail] = line[g](item);
                    return (
                      <li key={item.id}>
                        <Link to={to} className="search-row">
                          <strong>{name}</strong>
                          {detail && <span className="muted">{detail}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {SEE_ALL[g] && total > items.length && (
                  <p><Link to={`${SEE_ALL[g]}?${new URLSearchParams({ q })}`}>{t('search.seeAll', { n: total })}</Link></p>
                )}
              </section>
            );
          })}
        </LoadState>
      )}
    </>
  );
}

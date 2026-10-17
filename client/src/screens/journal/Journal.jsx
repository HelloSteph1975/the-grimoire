import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Select, DateInput } from '../../components/Field.jsx';
import { MoonIcon } from '../../components/MoonIcon.jsx';
import { isWaxing, litOf } from '../../components/SkyLine.jsx';
import { useResource } from '../../lib/useResource.js';
import { formatDay, formatTime, FIRST_DAY, LAST_DAY } from '../../lib/days.js';
import { fold } from '../../lib/fold.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

const FILTERS = ['kind', 'tag', 'from', 'to', 'q'];

export function Journal() {
  const { t, tc, language } = useT();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? '';
  const tag = params.get('tag') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const q = params.get('q') ?? '';

  const qs = new URLSearchParams();
  for (const key of FILTERS) if (params.get(key)) qs.set(key, params.get(key));
  const list = useResource(`/api/journal?${qs}`);
  const kinds = useResource('/api/journal-kinds');
  const tags = useResource('/api/journal/tags');

  // The newest query and setter, so a timer that fires later changes only its own key.
  const url = useRef({ params, setParams });
  url.current = { params, setParams };
  const setFilter = (key, value, opts) => {
    const next = new URLSearchParams(url.current.params);
    if (value) next.set(key, value); else next.delete(key);
    url.current.setParams(next, opts);
  };

  // The search box updates the URL 250 ms after the last key. Back and Forward update the box.
  const [text, setText] = useState(q);
  const typed = useRef(q);
  useEffect(() => { if (q !== typed.current) { typed.current = q; setText(q); } }, [q]);
  useEffect(() => {
    if (text.trim() === q) return undefined;
    const timer = setTimeout(() => { typed.current = text.trim(); setFilter('q', text.trim(), { replace: true }); }, 250);
    return () => clearTimeout(timer);
  }, [text, q]); // setFilter reads the newest URL through a ref, so it is safe to leave out.

  // A kind that isn't there (in the Trash, say) means All.
  const known = !kind || !kinds.data || kinds.data.some(k => String(k.id) === kind);
  useEffect(() => { if (!known) setFilter('kind', '', { replace: true }); }, [known]);
  const selectedKind = known ? kind : '';

  // A tag in the link shows as chosen under the spelling the list uses, or as itself if the list lacks it.
  const tagList = tags.data ?? [];
  const tagMatch = tag && tagList.find(x => fold(x) === fold(tag));
  const tagOptions = tag && !tagMatch ? [...tagList, tag] : tagList;
  const selectedTag = tagMatch || tag;

  const kindById = new Map((kinds.data ?? []).map(k => [k.id, k]));
  const filtering = Boolean(selectedKind || tag || from || to || q);
  const error = list.error ?? kinds.error ?? tags.error;
  const retry = () => { list.reload(); kinds.reload(); tags.reload(); };
  const rows = list.data;

  return (
    <>
      <PageHeader title={t('journal.title')}>
        <Button as={Link} icon={Plus} to="/journal/new">{t('journal.add')}</Button>
      </PageHeader>
      <div className="corr-filters journal-filters">
        <input type="search" className="input" aria-label={t('journal.search')} placeholder={t('journal.search')}
          value={text} onChange={e => setText(e.target.value)} />
        <Select aria-label={t('journal.kind')} value={selectedKind} placeholder={t('journal.allKinds')}
          options={(kinds.data ?? []).map(k => ({ value: String(k.id), label: starterText(tc, k, 'name', k.name) }))}
          onChange={e => setFilter('kind', e.target.value)} />
        <Select aria-label={t('journal.tag')} value={selectedTag} placeholder={t('journal.allTags')}
          options={tagOptions.map(x => ({ value: x, label: x }))} onChange={e => setFilter('tag', e.target.value)} />
        <label className="journal-date-filter">{t('journal.from')}
          <DateInput value={from} min={FIRST_DAY} max={LAST_DAY} onChange={e => setFilter('from', e.target.value)} />
        </label>
        <label className="journal-date-filter">{t('journal.to')}
          <DateInput value={to} min={FIRST_DAY} max={LAST_DAY} onChange={e => setFilter('to', e.target.value)} />
        </label>
      </div>
      {/* A new filter shows Loading, not the last filter's rows; an error shows only the error. */}
      <LoadState loading={!rows} error={error} onRetry={retry}>
        {rows?.length === 0 && <p className="muted">{filtering ? t('journal.noMatch') : t('journal.empty')}</p>}
        {rows?.length === 0 && !filtering && <p><Button as={Link} icon={Plus} to="/journal/new">{t('journal.add')}</Button></p>}
        <ul className="list corr-list">
          {rows?.map(row => {
            const k = kindById.get(row.kind_id);
            return (
              <li key={row.id}>
                <Link to={`/journal/${row.id}`} className="corr-row journal-row">
                  <span className="corr-cat journal-when">
                    <time dateTime={row.date}>{formatDay(row.date, language, { year: 'numeric', month: 'short', day: 'numeric' })}</time>
                    {row.time && <time dateTime={row.time}>{formatTime(row.time, language)}</time>}
                  </span>
                  <span className="corr-name journal-what">
                    {row.moon && <MoonIcon lit={litOf(row.moon)} waxing={isWaxing(row.moon)} size={16} />}
                    {k && <span className="tag">{starterText(tc, k, 'name', k.name)}</span>}
                    {row.title ? <strong>{row.title}</strong> : <span className="muted">{row.excerpt || t('journal.untitled')}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </LoadState>
    </>
  );
}

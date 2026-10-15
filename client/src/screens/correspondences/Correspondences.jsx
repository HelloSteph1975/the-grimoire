import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { CategoryIcon } from '../../components/CategoryIcon.jsx';
import { Select } from '../../components/Field.jsx';
import { useResource } from '../../lib/useResource.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const FILTERS = ['category', 'tradition', 'q'];

// Starter rows show the language pack's text; the owner's own rows show what she wrote.
export const starterText = (tc, row, field, fallback) => tc(row?.is_starter ? row.starter_key : null, field, fallback);

// Starter keywords come from the pack as one comma-separated string, cleaned the way the server
// cleans keywords. Without a pack entry the row's own list is used.
export function starterKeywords(tc, row) {
  const packed = starterText(tc, row, 'keywords', null);
  if (!packed) return row?.keywords ?? [];
  return [...new Set(packed.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
}

export function Correspondences() {
  const { t, tc } = useT();
  const [params, setParams] = useSearchParams();
  const category = params.get('category') ?? '';
  const tradition = params.get('tradition') ?? '';
  const q = params.get('q') ?? '';

  const qs = new URLSearchParams();
  for (const key of FILTERS) if (params.get(key)) qs.set(key, params.get(key));
  const list = useResource(`/api/correspondences?${qs}`);
  const categories = useResource('/api/categories');
  const traditions = useResource('/api/traditions');

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

  // A category that isn't there (in the Trash, say) means All.
  const known = !category || !categories.data || categories.data.some(c => String(c.id) === category);
  useEffect(() => { if (!known) setFilter('category', '', { replace: true }); }, [known]);
  const selected = known ? category : '';

  const catById = new Map((categories.data ?? []).map(c => [c.id, c]));
  const filtering = Boolean(selected || tradition || q);
  const error = list.error ?? categories.error ?? traditions.error;
  const retry = () => { list.reload(); categories.reload(); traditions.reload(); };
  const rows = list.data;

  return (
    <>
      <PageHeader title={t('nav.correspondences')}>
        <Button as={Link} icon={Plus} to={selected ? `/correspondences/new?category=${selected}` : '/correspondences/new'}>{t('corr.add')}</Button>
      </PageHeader>
      <div className="corr-tabs" role="group" aria-label={t('corr.category')}>
        <button type="button" className="corr-tab" aria-pressed={!selected} onClick={() => setFilter('category', '')}>{t('corr.all')}</button>
        {categories.data?.map(c => (
          <button key={c.id} type="button" className="corr-tab" aria-pressed={selected === String(c.id)}
            onClick={() => setFilter('category', String(c.id))}>
            <CategoryIcon name={c.icon} size={16} />{starterText(tc, c, 'name', c.name)}
          </button>
        ))}
      </div>
      <div className="corr-filters">
        <Select aria-label={t('corr.traditions')} value={tradition} placeholder={t('corr.allTraditions')}
          options={(traditions.data ?? []).map(r => ({ value: String(r.id), label: starterText(tc, r, 'name', r.name) }))}
          onChange={e => setFilter('tradition', e.target.value)} />
        <input type="search" className="input" aria-label={t('corr.search')} placeholder={t('corr.search')}
          value={text} onChange={e => setText(e.target.value)} />
      </div>
      {/* A new filter shows Loading, not the last filter's rows; an error shows only the error. */}
      <LoadState loading={!rows} error={error} onRetry={retry}>
        {rows?.length === 0 && <p className="muted">{filtering ? t('corr.noMatches') : t('corr.empty')}</p>}
        <ul className="list corr-list">
          {rows?.map(row => {
            const cat = catById.get(row.category_id);
            return (
              <li key={row.id}>
                <Link to={`/correspondences/${row.id}`} className="corr-row">
                  {cat && <span className="corr-cat"><CategoryIcon name={cat.icon} size={16} />{starterText(tc, cat, 'name', cat.name)}</span>}
                  <span className="corr-name">
                    <strong>{starterText(tc, row, 'name', row.name)}</strong>
                    {row.is_starter === 1 && <> <span className="tag">{t('common.starter')}</span></>}
                  </span>
                  {row.summary && <span className="corr-summary muted">{starterText(tc, row, 'summary', row.summary)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </LoadState>
    </>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Select } from '../../components/Field.jsx';
import { useResource } from '../../lib/useResource.js';
import { sortByName } from '../../lib/collate.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

const FILTERS = ['kind', 'tradition', 'q'];

export function Spells() {
  const { t, tc, language } = useT();
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') ?? '';
  const tradition = params.get('tradition') ?? '';
  const q = params.get('q') ?? '';

  const qs = new URLSearchParams();
  for (const key of FILTERS) if (params.get(key)) qs.set(key, params.get(key));
  const list = useResource(`/api/spells?${qs}`);
  const kinds = useResource('/api/spell-kinds');
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

  // A kind that isn't there (in the Trash, say) means All.
  const known = !kind || !kinds.data || kinds.data.some(k => String(k.id) === kind);
  useEffect(() => { if (!known) setFilter('kind', '', { replace: true }); }, [known]);
  const selected = known ? kind : '';

  // Same for a tradition that isn't there.
  const traditionKnown = !tradition || !traditions.data || traditions.data.some(r => String(r.id) === tradition);
  useEffect(() => { if (!traditionKnown) setFilter('tradition', '', { replace: true }); }, [traditionKnown]);
  const selectedTradition = traditionKnown ? tradition : '';

  const kindById = new Map((kinds.data ?? []).map(k => [k.id, k]));
  const filtering = Boolean(selected || selectedTradition || q);
  const error = list.error ?? kinds.error ?? traditions.error;
  const retry = () => { list.reload(); kinds.reload(); traditions.reload(); };
  const rows = list.data && sortByName(list.data, r => r.title, language);

  return (
    <>
      <PageHeader title={t('nav.spells')}>
        <Button as={Link} icon={Plus} to="/spells/new">{t('spells.add')}</Button>
      </PageHeader>
      <div className="corr-filters">
        <Select aria-label={t('spells.kind')} value={selected} placeholder={t('spells.allKinds')}
          options={(kinds.data ?? []).map(k => ({ value: String(k.id), label: starterText(tc, k, 'name', k.name) }))}
          onChange={e => setFilter('kind', e.target.value)} />
        <Select aria-label={t('spells.traditions')} value={selectedTradition} placeholder={t('spells.allTraditions')}
          options={(traditions.data ?? []).map(r => ({ value: String(r.id), label: starterText(tc, r, 'name', r.name) }))}
          onChange={e => setFilter('tradition', e.target.value)} />
        <input type="search" className="input" aria-label={t('spells.search')} placeholder={t('spells.search')}
          value={text} onChange={e => setText(e.target.value)} />
      </div>
      {/* A new filter shows Loading, not the last filter's rows; an error shows only the error. */}
      <LoadState loading={!rows} error={error} onRetry={retry}>
        {rows?.length === 0 && <p className="muted">{filtering ? t('spells.noMatches') : t('spells.empty')}</p>}
        {rows?.length === 0 && !filtering && <p><Button as={Link} icon={Plus} to="/spells/new">{t('spells.add')}</Button></p>}
        <ul className="list corr-list">
          {rows?.map(row => {
            const k = kindById.get(row.kind_id);
            return (
              <li key={row.id}>
                <Link to={`/spells/${row.id}`} className="corr-row">
                  <span className="corr-cat">{k ? starterText(tc, k, 'name', k.name) : ''}</span>
                  <span className="corr-name"><strong>{row.title}</strong></span>
                  {row.purpose && <span className="corr-summary muted">{row.purpose}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </LoadState>
    </>
  );
}

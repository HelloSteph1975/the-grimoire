import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Star } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Select, DateInput } from '../../components/Field.jsx';
import { useResource } from '../../lib/useResource.js';
import { sortByName } from '../../lib/collate.js';
import { FIRST_DAY, LAST_DAY, dayInRange, formatDay, formatTime } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

const TABS = ['planned', 'tolog', 'log'];
const RATINGS = [1, 2, 3, 4, 5];
const SHORT = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };

// A rating as five stars, read out as "4 of 5".
export function Stars({ n }) {
  const { t } = useT();
  return (
    <span className="ritual-stars" role="img" aria-label={t('rituals.rating', { n })}>
      {RATINGS.map(i => <Star key={i} size={14} aria-hidden="true" fill={i <= n ? 'currentColor' : 'none'} />)}
    </span>
  );
}

export function Rituals() {
  const { t, tc, language } = useT();
  const [params, setParams] = useSearchParams();
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'planned';
  const spell = params.get('spell') ?? '';
  const tradition = params.get('tradition') ?? '';
  const rating = RATINGS.map(String).includes(params.get('rating')) ? params.get('rating') : '';
  const from = dayInRange(params.get('from')) ? params.get('from') : '';
  const to = dayInRange(params.get('to')) ? params.get('to') : '';

  const spells = useResource('/api/spells');
  const traditions = useResource('/api/traditions');

  // A spell or tradition that isn't there (in the Trash, say) means All.
  const spellKnown = !spell || !spells.data || spells.data.some(s => String(s.id) === spell);
  const traditionKnown = !tradition || !traditions.data || traditions.data.some(r => String(r.id) === tradition);
  const selectedSpell = spellKnown ? spell : '';
  const selectedTradition = traditionKnown ? tradition : '';

  // The filters belong to the Log tab, so the other tabs leave them out.
  const qs = new URLSearchParams({ tab });
  const filters = { spell: selectedSpell, tradition: selectedTradition, rating, from, to };
  const filtering = tab === 'log' && Object.values(filters).some(Boolean);
  if (tab === 'log') for (const [key, value] of Object.entries(filters)) if (value) qs.set(key, value);
  const list = useResource(`/api/rituals?${qs}`);

  // The newest query and setter, so an effect that runs later changes only its own key.
  const url = useRef({ params, setParams });
  url.current = { params, setParams };
  const setParam = (key, value, opts) => {
    const next = new URLSearchParams(url.current.params);
    if (value) next.set(key, value); else next.delete(key);
    url.current.setParams(next, opts);
  };
  useEffect(() => { if (!spellKnown) setParam('spell', '', { replace: true }); }, [spellKnown]);
  useEffect(() => { if (!traditionKnown) setParam('tradition', '', { replace: true }); }, [traditionKnown]);

  const spellById = new Map((spells.data ?? []).map(s => [s.id, s]));
  const sortedSpells = sortByName(spells.data ?? [], s => s.title, language);
  const error = list.error ?? spells.error ?? traditions.error;
  const retry = () => { list.reload(); spells.reload(); traditions.reload(); };
  const rows = list.data;

  return (
    <>
      <PageHeader title={t('rituals.title')}>
        <Button as={Link} icon={Plus} to="/rituals/new">{t('rituals.add')}</Button>
      </PageHeader>
      <div className="corr-tabs" role="group" aria-label={t('rituals.title')}>
        {TABS.map(key => (
          <button key={key} type="button" className="corr-tab" aria-pressed={tab === key} onClick={() => setParam('tab', key)}>
            {t(`rituals.tab.${key}`)}
          </button>
        ))}
      </div>
      {tab === 'log' && (
        <div className="corr-filters ritual-filters">
          <Select aria-label={t('rituals.filter.spell')} value={selectedSpell} placeholder={t('rituals.allSpells')}
            options={sortedSpells.map(s => ({ value: String(s.id), label: s.title }))}
            onChange={e => setParam('spell', e.target.value)} />
          <Select aria-label={t('rituals.filter.tradition')} value={selectedTradition} placeholder={t('rituals.allTraditions')}
            options={(traditions.data ?? []).map(r => ({ value: String(r.id), label: starterText(tc, r, 'name', r.name) }))}
            onChange={e => setParam('tradition', e.target.value)} />
          <Select aria-label={t('rituals.filter.rating')} value={rating} placeholder={t('rituals.anyRating')}
            options={RATINGS.map(n => ({ value: String(n), label: t('rituals.rating', { n }) }))}
            onChange={e => setParam('rating', e.target.value)} />
          <label className="ritual-range">
            <span>{t('rituals.filter.from')}</span>
            <DateInput value={from} min={FIRST_DAY} max={LAST_DAY} onChange={e => setParam('from', e.target.value, { replace: true })} />
          </label>
          <label className="ritual-range">
            <span>{t('rituals.filter.to')}</span>
            <DateInput value={to} min={FIRST_DAY} max={LAST_DAY} onChange={e => setParam('to', e.target.value, { replace: true })} />
          </label>
        </div>
      )}
      {/* A new tab or filter shows Loading, not the last one's rows; an error shows only the error. */}
      <LoadState loading={!rows} error={error} onRetry={retry}>
        {rows?.length === 0 && <p className="muted">{filtering ? t('rituals.noLogMatches') : t(`rituals.empty.${tab}`)}</p>}
        <ul className="list ritual-list">
          {rows?.map(row => {
            const s = spellById.get(row.spell_id);
            return (
              <li key={row.id}>
                <Link to={`/rituals/${row.id}`} className="corr-row ritual-row">
                  <span className="ritual-when">
                    <span>{formatDay(row.date, language, SHORT)}</span>
                    {row.time && <span className="muted">{formatTime(row.time, language)}</span>}
                  </span>
                  <span className="corr-name"><strong>{row.title}</strong></span>
                  {s && <span className="corr-summary muted">{s.title}</span>}
                </Link>
                {row.rating != null && <Stars n={row.rating} />}
                {tab === 'tolog' && <Button as={Link} size="sm" variant="ghost" to={`/rituals/${row.id}/log`}>{t('rituals.logIt')}</Button>}
              </li>
            );
          })}
        </ul>
      </LoadState>
    </>
  );
}

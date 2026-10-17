import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { CategoryIcon } from '../../components/CategoryIcon.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { sortByName } from '../../lib/collate.js';
import { SABBAT_KEYS } from '../../lib/timing.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText, starterKeywords } from './Correspondences.jsx';

// 2024 is a leap year, so 02-29 formats too.
export function formatFeastDay(feastDay, language) {
  const [m, d] = feastDay.split('-').map(Number);
  return new Intl.DateTimeFormat(language, { month: 'long', day: 'numeric' }).format(new Date(2024, m - 1, d));
}

// A sabbat starter entry has no fixed feast day but still shows on the calendar.
export const isSabbat = entry => SABBAT_KEYS.includes(entry?.starter_key);

export function EntryPageRoute() {
  const { id } = useParams();
  return <EntryPage key={id} id={id} />;
}

export function EntryPage({ id }) {
  const { t, tc, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const entry = useResource(`/api/correspondences/${id}`);
  const categories = useResource('/api/categories');
  const traditions = useResource('/api/traditions');
  const usedIn = useResource(`/api/correspondences/${id}/spells`);
  const e = entry.data;
  const name = e ? starterText(tc, e, 'name', e.name) : '';
  const category = e && categories.data?.find(c => c.id === e.category_id);
  const tradNames = e && traditions.data ? traditions.data.filter(r => e.traditions.includes(r.id)).map(r => starterText(tc, r, 'name', r.name)) : [];
  const body = e ? starterText(tc, e, 'body', e.body) : null;

  // Saves through the entry's own resource, so a read in flight never paints over the switch.
  // A failed save reloads the entry there too, so after a conflict it shows the latest.
  // It stays focusable while saving (a disabled button would drop the focus); clicks wait instead.
  const [switching, setSwitching] = useState(false);
  const busy = useRef(false);
  const switchLabel = useId();
  const shown = e?.show_on_calendar !== 0;
  const toggleCalendar = async () => {
    if (busy.current) return;
    busy.current = true;
    setSwitching(true);
    try {
      await entry.save({ show_on_calendar: !shown, version: e.version });
    } catch (err) {
      toast.show({ message: errorText(err, t) });
    } finally {
      busy.current = false;
      setSwitching(false);
    }
  };

  const remove = async () => {
    if (!await confirm({ title: t('corr.deleteTitle', { name }), body: t('corr.deleteBody'), confirmLabel: t('common.delete'), danger: true })) return;
    try {
      await api.del(`/api/correspondences/${e.id}`);
    } catch (err) {
      // It may have changed or gone meanwhile, so show what is there now.
      toast.show({ message: errorText(err, t) });
      entry.reload();
      return;
    }
    navigate('/correspondences');
    toast.show({
      message: t('corr.deleted', { name }),
      action: { label: t('common.undo'), onClick: async () => {
          try { await api.post(`/api/correspondences/${e.id}/restore`); navigate(`/correspondences/${e.id}`); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  return (
    <article className="entry">
      <LoadState loading={entry.loading && !e} error={entry.error} keepChildren={Boolean(e)} onRetry={entry.reload}>
        {e && (
          <>
            <PageHeader title={name}>
              <Button as={Link} variant="ghost" icon={Pencil} to={`/correspondences/${e.id}/edit`}>{t('common.edit')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={remove}>{t('common.delete')}</Button>
            </PageHeader>
            {/* Category and tradition names: the entry stays readable if they fail to load. */}
            <LoadState error={categories.error ?? traditions.error} keepChildren
              onRetry={() => { if (categories.error) categories.reload(); if (traditions.error) traditions.reload(); }} />
            <p className="entry-meta">
              {category && <span className="corr-cat"><CategoryIcon name={category.icon} size={16} />{starterText(tc, category, 'name', category.name)}</span>}
              {e.is_starter === 1 && <span className="tag">{t('common.starter')}</span>}
            </p>
            {e.summary && <p className="entry-summary">{starterText(tc, e, 'summary', e.summary)}</p>}
            {body && body.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
            <dl className="entry-facts">
              {e.feast_day && <><dt>{t('corr.feastDay')}</dt><dd>{formatFeastDay(e.feast_day, language)}</dd></>}
              {(e.feast_day || isSabbat(e)) && (
                <><dt id={switchLabel}>{t('corr.showOnCalendar')}</dt><dd>
                  <button type="button" role="switch" className="switch" aria-checked={shown} aria-labelledby={switchLabel}
                    aria-disabled={switching || undefined} onClick={toggleCalendar}><span className="switch-knob" /></button>
                </dd></>
              )}
              {tradNames.length > 0 && <><dt>{t('corr.traditions')}</dt><dd>{tradNames.join(', ')}</dd></>}
              {starterKeywords(tc, e).length > 0 && (
                <><dt>{t('corr.keywords')}</dt><dd><ul className="chips">{starterKeywords(tc, e).map(k => <li key={k} className="chip">{k}</li>)}</ul></dd></>
              )}
              {e.links.length > 0 && (
                <><dt>{t('corr.links')}</dt><dd><ul className="entry-links">
                  {sortByName(e.links, l => starterText(tc, l, 'name', l.name), language).map(l => <li key={l.id}><Link to={`/correspondences/${l.id}`}>{starterText(tc, l, 'name', l.name)}</Link></li>)}
                </ul></dd></>
              )}
            </dl>
          </>
        )}
      </LoadState>
      {/* Its own load: a failure here never hides the entry. */}
      {e && (
        <LoadState error={usedIn.error} keepChildren onRetry={usedIn.reload}>
          {usedIn.data?.length > 0 && (
            <section className="spell-section">
              <h2>{t('corr.usedIn')}</h2>
              <ul className="entry-links">
                {sortByName(usedIn.data, s => s.title, language).map(s => <li key={s.id}><Link to={`/spells/${s.id}`}>{s.title}</Link></li>)}
              </ul>
            </section>
          )}
        </LoadState>
      )}
      <p><Link to="/correspondences">{t('corr.back')}</Link></p>
    </article>
  );
}

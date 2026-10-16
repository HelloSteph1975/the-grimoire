import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';
import { formatFeastDay } from '../correspondences/EntryPage.jsx';
import { sortByName } from '../../lib/collate.js';

const TIMING_GROUPS = [
  { key: 'moon', label: 'spells.moon' },
  { key: 'day', label: 'spells.days' },
  { key: 'planet', label: 'spells.planets' },
];

export function SpellPageRoute() {
  const { id } = useParams();
  return <SpellPage key={id} id={id} />;
}

export function SpellPage({ id }) {
  const { t, tc, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const spell = useResource(`/api/spells/${id}`);
  const kinds = useResource('/api/spell-kinds');
  const traditions = useResource('/api/traditions');
  const s = spell.data;
  const kind = s && kinds.data?.find(k => k.id === s.kind_id);
  const feastName = f => starterText(tc, f, 'name', f.name);
  const feasts = s ? sortByName(s.feasts, feastName, language) : [];
  const tradNames = s && traditions.data ? traditions.data.filter(r => s.traditions.includes(r.id)).map(r => starterText(tc, r, 'name', r.name)) : [];

  const remove = async () => {
    if (!await confirm({ title: t('spells.deleteTitle', { name: s.title }), body: t('spells.deleteBody'), confirmLabel: t('common.delete'), danger: true })) return;
    const name = s.title;
    try {
      await api.del(`/api/spells/${s.id}`);
    } catch (err) {
      // It may have changed or gone meanwhile, so show what is there now.
      toast.show({ message: errorText(err, t) });
      spell.reload();
      return;
    }
    navigate('/spells');
    toast.show({
      message: t('spells.deleted', { name }),
      action: { label: t('common.undo'), onClick: async () => {
          try { await api.post(`/api/spells/${s.id}/restore`); navigate(`/spells/${s.id}`); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  const timing = s?.timing ?? {};
  const hasTiming = s && (TIMING_GROUPS.some(g => timing[g.key]?.length > 0) || s.feasts.length > 0);

  return (
    <article className="entry spell">
      <LoadState loading={spell.loading && !s} error={spell.error} keepChildren={Boolean(s)} onRetry={spell.reload}>
        {s && (
          <>
            <PageHeader title={s.title}>
              <Button as={Link} variant="ghost" icon={Pencil} to={`/spells/${s.id}/edit`}>{t('common.edit')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={remove}>{t('common.delete')}</Button>
            </PageHeader>
            {/* Kind and tradition names: the spell stays readable if they fail to load. */}
            <LoadState error={kinds.error ?? traditions.error} keepChildren
              onRetry={() => { if (kinds.error) kinds.reload(); if (traditions.error) traditions.reload(); }} />
            {kind && <p className="entry-meta"><span className="tag">{starterText(tc, kind, 'name', kind.name)}</span></p>}
            {s.purpose && <p className="entry-summary">{s.purpose}</p>}
            {tradNames.length > 0 && (
              <dl className="entry-facts"><dt>{t('spells.traditions')}</dt><dd>{tradNames.join(', ')}</dd></dl>
            )}
            {s.ingredients.length > 0 && (
              <section className="spell-section">
                <h2>{t('spells.ingredients')}</h2>
                <ul className="spell-ingredients">
                  {s.ingredients.map((line, i) => (
                    <li key={i}>
                      {line.amount && <>{line.amount} </>}
                      {line.link
                        ? <Link to={`/correspondences/${line.link.id}`}>{line.name}</Link>
                        : line.name}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {s.steps.length > 0 && (
              <section className="spell-section">
                <h2>{t('spells.steps')}</h2>
                <ol className="spell-steps">{s.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
              </section>
            )}
            {hasTiming && (
              <section className="spell-section">
                <h2>{t('spells.timing')}</h2>
                <dl className="entry-facts">
                  {TIMING_GROUPS.filter(g => timing[g.key]?.length > 0).map(g => (
                    <div key={g.key} className="spell-timing-row">
                      <dt>{t(g.label)}</dt>
                      <dd><ul className="chips">{timing[g.key].map(code => <li key={code} className="chip">{t(`timing.${g.key}.${code}`)}</li>)}</ul></dd>
                    </div>
                  ))}
                  {s.feasts.length > 0 && (
                    <div className="spell-timing-row">
                      <dt>{t('spells.feasts')}</dt>
                      <dd><ul className="entry-links">
                        {feasts.map(f => (
                          <li key={f.id}>
                            <Link to={`/correspondences/${f.id}`}>{feastName(f)}</Link>
                            {f.feast_day && <>, {formatFeastDay(f.feast_day, language)}</>}
                          </li>
                        ))}
                      </ul></dd>
                    </div>
                  )}
                </dl>
              </section>
            )}
            {s.notes && (
              <section className="spell-section">
                <h2>{t('spells.notes')}</h2>
                {s.notes.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
              </section>
            )}
            {s.source && (
              <section className="spell-section">
                <h2>{t('spells.source')}</h2>
                <p>{s.source}</p>
              </section>
            )}
          </>
        )}
      </LoadState>
      <p><Link to="/spells">{t('spells.back')}</Link></p>
    </article>
  );
}

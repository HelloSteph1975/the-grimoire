import { Link, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { SkyLine } from '../../components/SkyLine.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { formatDay, formatTime } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

export function EntryPageRoute() {
  const { id } = useParams();
  return <EntryPage key={id} id={id} />;
}

export function EntryPage({ id }) {
  const { t, tc, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const entry = useResource(`/api/journal/${id}`);
  const kinds = useResource('/api/journal-kinds');
  const e = entry.data;
  const kind = e?.kind && (kinds.data ?? []).find(k => k.id === e.kind.id);

  const remove = async () => {
    if (!await confirm({ title: t('journal.deleteTitle'), body: t('journal.deleteBody'), confirmLabel: t('common.delete'), danger: true })) return;
    try {
      await api.del(`/api/journal/${e.id}`);
    } catch (err) {
      toast.show({ message: errorText(err, t) });
      entry.reload();
      return;
    }
    navigate('/journal');
    toast.show({
      message: t('journal.deleted'),
      action: { label: t('common.undo'), onClick: async () => {
          try { await api.post(`/api/journal/${e.id}/restore`); navigate(`/journal/${e.id}`); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  const dayText = e && formatDay(e.date, language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <article className="entry journal-entry">
      <LoadState loading={entry.loading && !e} error={entry.error} keepChildren={Boolean(e)} onRetry={entry.reload}>
        {e && (
          <>
            <PageHeader title={e.title || dayText}>
              <Button as={Link} variant="ghost" icon={Pencil} to={`/journal/${e.id}/edit`}>{t('common.edit')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={remove}>{t('common.delete')}</Button>
            </PageHeader>
            <p className="entry-meta">
              {kind && <span className="tag">{starterText(tc, kind, 'name', kind.name)}</span>}
              <span className="ritual-when">
                <time dateTime={e.date}>{dayText}</time>
                {e.time && <time dateTime={e.time}>{formatTime(e.time, language)}</time>}
              </span>
            </p>
            <LoadState error={kinds.error} keepChildren onRetry={kinds.reload} />
            {e.sky && <SkyLine sky={e.sky} title={t('journal.sky')} />}
            {e.tags.length > 0 && (
              <ul className="chips journal-tags" aria-label={t('journal.tags')}>
                {e.tags.map(tag => (
                  <li key={tag} className="chip"><Link to={`/journal?tag=${encodeURIComponent(tag)}`}>{tag}</Link></li>
                ))}
              </ul>
            )}
            {e.cards.length > 0 && (
              <section className="spell-section">
                <h2>{t('journal.cards')}</h2>
                <ul className="journal-cards">
                  {e.cards.map((c, i) => (
                    <li key={i}>
                      <strong>{c.name}</strong>
                      {c.position && <span className="muted"> {c.position}</span>}
                      {c.reversed && <span className="tag">{t('journal.reversed')}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {e.text && (
              <section className="spell-section journal-text">
                {e.text.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
              </section>
            )}
          </>
        )}
      </LoadState>
      <p><Link to="/journal">{t('journal.back')}</Link></p>
    </article>
  );
}

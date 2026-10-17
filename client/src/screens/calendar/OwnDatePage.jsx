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
import { formatDay, monthOf } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

// A yearly date comes back every year, so the way back opens this year's month (the browser's
// year, which only differs from the server's around midnight on New Year's Eve). A date that
// starts in a later year can't appear before then, so that year wins.
const calendarOf = d => `/calendar?month=${d.yearly === 1 ? `${Math.max(new Date().getFullYear(), Number(d.date.slice(0, 4)))}${d.date.slice(4, 7)}` : monthOf(d.date)}`;

export function OwnDatePageRoute() {
  const { id } = useParams();
  return <OwnDatePage key={id} id={id} />;
}

export function OwnDatePage({ id }) {
  const { t, tc, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const date = useResource(`/api/own-dates/${id}`);
  const traditions = useResource('/api/traditions');
  const d = date.data;
  // In the tradition list's own sort order.
  const tradNames = d && traditions.data ? traditions.data.filter(r => d.traditions.includes(r.id)).map(r => starterText(tc, r, 'name', r.name)) : [];

  const remove = async () => {
    if (!await confirm({ title: t('dates.deleteTitle', { name: d.title }), body: t('dates.deleteBody'), confirmLabel: t('common.delete'), danger: true })) return;
    const name = d.title;
    try {
      await api.del(`/api/own-dates/${d.id}`);
    } catch (err) {
      // It may have changed or gone meanwhile, so show what is there now.
      toast.show({ message: errorText(err, t) });
      date.reload();
      return;
    }
    navigate(calendarOf(d));
    toast.show({
      message: t('dates.deleted', { name }),
      action: { label: t('common.undo'), onClick: async () => {
          try { await api.post(`/api/own-dates/${d.id}/restore`); navigate(`/calendar/dates/${d.id}`); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  return (
    <article className="entry own-date">
      <LoadState loading={date.loading && !d} error={date.error} keepChildren={Boolean(d)} onRetry={date.reload}>
        {d && (
          <>
            <PageHeader title={d.title}>
              <Button as={Link} variant="ghost" icon={Pencil} to={`/calendar/dates/${d.id}/edit`}>{t('common.edit')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={remove}>{t('common.delete')}</Button>
            </PageHeader>
            {/* Tradition names: the date stays readable if they fail to load. */}
            <LoadState error={traditions.error} keepChildren onRetry={traditions.reload} />
            <p className="entry-meta">
              <span>{formatDay(d.date, language, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              {d.yearly === 1 && <span className="tag">{t('dates.everyYear')}</span>}
            </p>
            {tradNames.length > 0 && (
              <dl className="entry-facts"><dt>{t('dates.traditions')}</dt><dd>{tradNames.join(', ')}</dd></dl>
            )}
            {d.notes && (
              <section className="spell-section">
                <h2>{t('dates.notes')}</h2>
                {d.notes.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
              </section>
            )}
          </>
        )}
      </LoadState>
      <p><Link to={d ? calendarOf(d) : '/calendar'}>{t('dates.back')}</Link></p>
    </article>
  );
}

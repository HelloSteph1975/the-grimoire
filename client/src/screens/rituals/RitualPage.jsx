import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarCheck, Copy, Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { MoonIcon } from '../../components/MoonIcon.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { formatDay, formatTime } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';
import { Stars } from './Rituals.jsx';
import { FollowUps } from './FollowUps.jsx';

// The moon grows from new to full through these phases; the rest wane.
const WAXING = new Set(['new', 'waxing-crescent', 'first-quarter', 'waxing-gibbous']);

export function RitualPageRoute() {
  const { id } = useParams();
  return <RitualPage key={id} id={id} />;
}

// A queued tick names its line by position, name and amount. If a reload brings a different
// list and that line no longer matches, the tick is dropped rather than flipping another line.
const matches = (supplies, tick) => {
  const line = supplies[tick.index];
  return Boolean(line) && line.name === tick.name && line.amount === tick.amount;
};
// The supplies with the queued ticks applied: each matching tick flips its line once.
const withTicks = (supplies, ticks) => ticks.reduce((list, tick) => (matches(list, tick)
  ? list.map((l, i) => (i === tick.index ? { ...l, checked: !l.checked } : l)) : list), supplies);
const toBody = supplies => supplies.map(({ name, amount, checked }) => ({ name, amount, checked }));

// Supply ticks save straight away through the ritual's own resource. A tick made while a save
// is in flight waits in a queue and goes out after it, against the version that save returned,
// so no tick is lost. A failure drops the queue; the resource reloads itself after a failed
// save, so the boxes then show what is stored. Leaving the page lets the queue finish sending,
// quietly: each save carries its version, so a late one that lost gets a 409 and changes nothing.
function useSupplyTicks(ritual) {
  const { t } = useT();
  const toast = useToast();
  const [ticks, setTicks] = useState([]);
  const queue = useRef([]);
  const busy = useRef(false);
  const live = useRef(true);
  const latest = useRef(ritual.data);
  latest.current = ritual.data;
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);

  const drain = async () => {
    busy.current = true;
    let record = latest.current;
    try {
      while (queue.current.length > 0) {
        const head = queue.current[0];
        if (matches(record.supplies, head)) {
          record = await ritual.save({ supplies: toBody(withTicks(record.supplies, [head])), version: record.version });
        }
        queue.current = queue.current.slice(1);
        if (live.current) setTicks(queue.current);
      }
    } catch (err) {
      queue.current = [];
      if (live.current) {
        setTicks([]);
        toast.show({ message: errorText(err, t) });
      }
    } finally {
      busy.current = false;
    }
  };

  const tick = index => {
    const line = ritual.data.supplies[index];
    queue.current = [...queue.current, { index, name: line.name, amount: line.amount }];
    setTicks(queue.current);
    if (!busy.current) drain();
  };

  return { supplies: ritual.data ? withTicks(ritual.data.supplies, ticks) : [], tick };
}

export function RitualPage({ id }) {
  const { t, tc, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const ritual = useResource(`/api/rituals/${id}`);
  const traditions = useResource('/api/traditions');
  const { supplies, tick } = useSupplyTicks(ritual);
  const r = ritual.data;
  const tradNames = r && traditions.data ? traditions.data.filter(x => r.traditions.includes(x.id)).map(x => starterText(tc, x, 'name', x.name)) : [];

  const remove = async () => {
    if (!await confirm({ title: t('rituals.deleteTitle', { name: r.title }), body: t('rituals.deleteBody'), confirmLabel: t('common.delete'), danger: true })) return;
    const name = r.title;
    try {
      await api.del(`/api/rituals/${r.id}`);
    } catch (err) {
      toast.show({ message: errorText(err, t) });
      ritual.reload();
      return;
    }
    navigate('/rituals');
    toast.show({
      message: t('rituals.deleted', { name }),
      action: { label: t('common.undo'), onClick: async () => {
          try { await api.post(`/api/rituals/${r.id}/restore`); navigate(`/rituals/${r.id}`); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  const planAgain = r && (r.spell ? `/rituals/new?copy=${r.id}&spell=${r.spell.id}` : `/rituals/new?copy=${r.id}`);
  const logged = r && r.status !== 'planned';

  return (
    <article className="entry ritual">
      <LoadState loading={ritual.loading && !r} error={ritual.error} keepChildren={Boolean(r)} onRetry={ritual.reload}>
        {r && (
          <>
            <PageHeader title={r.title}>
              <Button as={Link} variant="ghost" icon={Pencil} to={`/rituals/${r.id}/edit`}>{t('common.edit')}</Button>
              <Button as={Link} variant="ghost" icon={CalendarCheck} to={`/rituals/${r.id}/log`}>{t('rituals.logIt')}</Button>
              <Button as={Link} variant="ghost" icon={Copy} to={planAgain}>{t('rituals.planAgain')}</Button>
              <Button variant="ghost" icon={Trash2} onClick={remove}>{t('common.delete')}</Button>
            </PageHeader>
            <p className="entry-meta">
              <span className="tag">{t(`rituals.status.${r.status}`)}</span>
              <span className="ritual-when">
                <time dateTime={r.date}>{formatDay(r.date, language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</time>
                {r.time && <time dateTime={r.time}>{formatTime(r.time, language)}</time>}
              </span>
              {r.spell && <Link to={`/spells/${r.spell.id}`}>{r.spell.title}</Link>}
            </p>
            <LoadState error={traditions.error} keepChildren onRetry={traditions.reload} />
            {tradNames.length > 0 && (
              <dl className="entry-facts"><dt>{t('rituals.traditions')}</dt><dd>{tradNames.join(', ')}</dd></dl>
            )}
            {r.sky && <Sky sky={r.sky} />}
            {supplies.length > 0 && (
              <section className="spell-section">
                <h2>{t('rituals.supplies')}</h2>
                <ul className="ritual-supplies">
                  {supplies.map((line, i) => (
                    <li key={i}>
                      <label className="checkbox">
                        <input type="checkbox" checked={line.checked} onChange={() => tick(i)} />
                        {' '}{line.amount && <span className="ritual-supply-amount">{line.amount}</span>}
                        {' '}<span>{line.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {r.plan_notes && (
              <section className="spell-section">
                <h2>{t('rituals.planNotes')}</h2>
                {r.plan_notes.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
              </section>
            )}
            {logged && (
              <section className="spell-section">
                <h2>{t('rituals.log')}</h2>
                {r.rating != null && <p><Stars n={r.rating} /></p>}
                {r.changes && (
                  <>
                    <h3>{t('rituals.changes')}</h3>
                    {r.changes.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
                  </>
                )}
                {r.outcome && (
                  <>
                    <h3>{t('rituals.outcome')}</h3>
                    {r.outcome.split(/\n\s*\n/).map((para, i) => <p key={i}>{para}</p>)}
                  </>
                )}
              </section>
            )}
            <FollowUps ritualId={r.id} />
          </>
        )}
      </LoadState>
      <p><Link to="/rituals">{t('rituals.back')}</Link></p>
    </article>
  );
}

function Sky({ sky }) {
  const { t } = useT();
  const phase = t(`timing.moon.${sky.moon}`);
  return (
    <section className="spell-section ritual-sky">
      <h2>{t('rituals.sky')}</h2>
      <div className="ritual-sky-body">
        <MoonIcon lit={sky.lit} waxing={WAXING.has(sky.moon)} size={48} />
        <p>{t('rituals.skyLine', { phase, n: Math.round(sky.lit * 100), weekday: t(`timing.day.${sky.weekday}`), planet: t(`timing.planet.${sky.planet}`) })}</p>
      </div>
    </section>
  );
}

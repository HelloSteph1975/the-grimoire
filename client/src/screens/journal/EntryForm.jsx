import { useCallback, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextInput, TextArea, DateInput, Select } from '../../components/Field.jsx';
import { ChipsInput } from '../../components/ChipsInput.jsx';
import { ListEditor, withKeys } from '../../components/ListEditor.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { FIRST_DAY, LAST_DAY, dayInRange } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';
import { CardRow } from './CardRow.jsx';

const MAX_CARDS = 20;
const MAX_TAGS = 20;
const blankCard = () => ({ name: '', position: '', reversed: false });

// Today's date and the clock time in the Settings time zone, as 'YYYY-MM-DD' and 'HH:MM'.
// A zone the browser doesn't know falls back to the machine's own.
export function nowIn(zone) {
  const at = new Date();
  const parts = z => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: z, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(at);
    } catch { return null; }
  };
  const p = Object.fromEntries((parts(zone) ?? parts(undefined)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

// The form's values from a stored entry (or a blank one). Cards get client-only keys here, so
// the list editor never has to add them (which would count as a change). A kind in the Trash
// shows as No kind, and the server keeps the stored link.
const pick = r => ({
  date: r?.date ?? '',
  time: r?.time ?? '',
  kind_id: r?.kind ? String(r.kind.id) : '',
  title: r?.title ?? '',
  text: r?.text ?? '',
  tags: r?.tags ?? [],
  // Tag text typed but not confirmed yet; it counts as a change and turns into a chip on blur.
  pending: '',
  cards: withKeys((r?.cards ?? []).map(c => ({ name: c.name ?? '', position: c.position ?? '', reversed: Boolean(c.reversed) }))),
});

// A new entry is stamped with now, or with the day from the link (and no time).
function startOf({ presetDate, zone, kinds }) {
  const kind_id = kinds[0] ? String(kinds[0].id) : '';
  if (dayInRange(presetDate)) return { ...pick(null), kind_id, date: presetDate };
  const now = nowIn(zone);
  return { ...pick(null), kind_id, date: now.date, time: now.time };
}

const toBody = v => ({
  date: v.date,
  time: v.time || null,
  kind_id: v.kind_id ? Number(v.kind_id) : null,
  title: v.title,
  text: v.text,
  tags: v.tags,
  cards: v.cards.map(({ name, position, reversed }) => ({ name, position, reversed })),
});

export function EntryFormRoute() {
  const { id } = useParams();
  const { search } = useLocation();
  return <EntryFormLoader key={`${id ?? 'new'}${search}`} id={id} />;
}

function EntryFormLoader({ id }) {
  const { t, ready: languageReady } = useT();
  const { settings, loaded: settingsLoaded } = useSettings();
  const [params] = useSearchParams();
  const entry = useResource(id ? `/api/journal/${id}` : null);
  const kinds = useResource('/api/journal-kinds');
  const ready = (!id || entry.data) && kinds.data && settingsLoaded && languageReady;
  const error = entry.error ?? kinds.error;
  const retry = () => { if (id) entry.reload(); kinds.reload(); };
  // A new entry saved with edits still open stays on this page, now as an existing entry.
  const [created, setCreated] = useState(false);
  return (
    <>
      <PageHeader title={id || created ? t('journal.edit') : t('journal.new')} />
      <LoadState loading={!ready} error={ready ? null : error} onRetry={retry}>
        {ready && <EntryForm record={id ? entry.data : null}
          start={() => startOf({ presetDate: id ? '' : params.get('date') ?? '', zone: settings?.time_zone, kinds: kinds.data })}
          kinds={kinds.data} reloadKinds={kinds.reload} onCreated={setCreated} />}
      </LoadState>
      {!ready && error && <p><Link to="/journal">{t('journal.title')}</Link></p>}
    </>
  );
}

function EntryForm({ record, start, kinds, reloadKinds, onCreated }) {
  const { t, tc } = useT();
  const navigate = useNavigate();
  const [initial] = useState(() => (record ? pick(record) : start()));
  // The entry we save against. A new entry gets one after its first save, so a second save
  // (after an edit made during the first) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const body = toBody(values);
    const out = target
      ? await api.patch(`/api/journal/${target.id}`, { ...body, version: forced ?? target.version })
      : await api.post('/api/journal', body);
    if (!target) onCreated(true);
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, onCreated]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;
  const groupError = key => f.errors[key] && <small className="field-error" role="alert">{f.errors[key]}</small>;
  const cardNames = t('journal.cardNames').split('|');
  const tagError = Object.keys(f.errors).filter(k => k.startsWith('tags.')).map(k => f.errors[k])[0];

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/journal/${out.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  // The latest entry may use a kind added in another window, so reload the kinds too.
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); f.takeTheirs(pick); reloadKinds(); };
  // The leave guard asks first if there are unsaved changes.
  const cancel = () => navigate(target ? `/journal/${target.id}` : '/journal');
  // A new entry can always be tried: an empty one is answered by the server on Title.
  const canSave = Boolean(v.date) && (!record || f.dirty);
  const cardLabel = (item, i) => item.name.trim() || t('journal.card', { n: i + 1 });

  return (
    <>
      <form className="entry-form spell-form journal-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <div className="ritual-when-fields">
            <Field label={t('journal.date')} error={f.errors.date}>
              <DateInput value={v.date} onChange={e => f.set('date', e.target.value)} min={FIRST_DAY} max={LAST_DAY} />
            </Field>
            <Field label={t('journal.time')} error={f.errors.time}>
              <TextInput type="time" value={v.time} onChange={e => f.set('time', e.target.value)} />
            </Field>
          </div>
          <Field label={t('journal.kind')} error={f.errors.kind_id}>
            <Select value={v.kind_id} onChange={e => f.set('kind_id', e.target.value)} placeholder={t('journal.noKind')}
              options={kinds.map(k => ({ value: String(k.id), label: starterText(tc, k, 'name', k.name) }))} />
          </Field>
          <Field label={t('journal.titleField')} error={f.errors.title}>
            <TextInput value={v.title} onChange={e => f.set('title', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('journal.text')} error={f.errors.text}>
            <TextArea value={v.text} onChange={e => f.set('text', e.target.value)} rows={12} maxLength={20000} />
          </Field>
          <Field label={t('journal.tags')} error={f.errors.tags ?? tagError}>
            <ChipsInput keepCase max={MAX_TAGS} maxLength={50} value={v.tags} onChange={x => f.set('tags', x)}
              pending={v.pending} onPendingChange={p => f.set('pending', p)} label={t('journal.tags')} />
          </Field>
          <fieldset className="field field-group">
            <legend>{t('journal.cards')}</legend>
            <ListEditor items={v.cards} onChange={list => f.set('cards', list)} blank={blankCard} max={MAX_CARDS}
              addLabel={t('journal.addCard')} itemLabel={cardLabel}
              renderItem={(item, i, update) => <CardRow item={item} index={i} update={update} errors={f.errors} names={cardNames} />} />
            {groupError('cards')}
          </fieldset>
        </fieldset>
        {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
        <div className="form-actions">
          <Button variant="ghost" onClick={cancel}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={f.saving || !canSave}>{f.saving ? t('common.saving') : t('common.save')}</Button>
        </div>
      </form>
      <ConflictDialog conflict={f.conflict} onKeepMine={keep} onTakeTheirs={takeTheirs} onDismiss={f.dismissConflict} />
    </>
  );
}

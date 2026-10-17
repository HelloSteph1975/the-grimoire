import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextInput, TextArea, DateInput, Checkbox } from '../../components/Field.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { dayInRange, monthOf } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';

// The form's values from a stored date (or a blank one, on the day from the link if it is real).
const pickWith = presetDate => d => ({
  title: d?.title ?? '',
  date: d?.date ?? (dayInRange(presetDate) ? presetDate : ''),
  yearly: d ? d.yearly === 1 : false,
  notes: d?.notes ?? '',
  traditions: d?.traditions ?? [],
});

const toBody = v => ({ title: v.title, date: v.date, yearly: v.yearly, notes: v.notes, traditions: v.traditions });

export function OwnDateFormRoute() {
  const { id } = useParams();
  return <OwnDateFormLoader key={id ?? 'new'} id={id} />;
}

function OwnDateFormLoader({ id }) {
  const { t, ready: languageReady } = useT();
  const { loaded: settingsLoaded } = useSettings();
  const [params] = useSearchParams();
  const date = useResource(id ? `/api/own-dates/${id}` : null);
  const traditions = useResource('/api/traditions');
  // The form takes its starting text once, so it waits for the language pack too.
  const ready = (!id || date.data) && traditions.data && settingsLoaded && languageReady;
  const error = date.error ?? traditions.error;
  const retry = () => { if (id) date.reload(); traditions.reload(); };
  // A new date saved with edits still open stays on this page, now as an existing date.
  const [created, setCreated] = useState(false);
  return (
    <>
      <PageHeader title={id || created ? t('dates.edit') : t('dates.new')} />
      <LoadState loading={!ready} error={ready ? null : error} onRetry={retry}>
        {ready && <OwnDateForm record={id ? date.data : null} presetDate={params.get('date') ?? ''} traditions={traditions.data}
          reloadLists={() => traditions.reload()} onCreated={setCreated} />}
      </LoadState>
      {!ready && error && <p><Link to="/calendar">{t('dates.back')}</Link></p>}
    </>
  );
}

function OwnDateForm({ record, presetDate, traditions, reloadLists, onCreated }) {
  const { t, tc } = useT();
  const navigate = useNavigate();
  const pick = useMemo(() => pickWith(presetDate), [presetDate]);
  const [initial] = useState(() => pick(record));
  // The date we save against. A new date gets one after its first save, so a second save
  // (after an edit made during the first) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const body = toBody(values);
    const out = target
      ? await api.patch(`/api/own-dates/${target.id}`, { ...body, version: forced ?? target.version })
      : await api.post('/api/own-dates', body);
    if (!target) onCreated(true);
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, onCreated]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;
  const ids = useId();
  const errId = key => (f.errors[key] ? `${ids}-${key}` : undefined);

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/calendar/dates/${out.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  // The latest date may use a tradition added in another window, so reload that list too.
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); f.takeTheirs(pick); reloadLists(); };
  // The leave guard asks first if there are unsaved changes. A new date opened from a day goes
  // back to that day.
  const back = dayInRange(presetDate) ? `/calendar?month=${monthOf(presetDate)}&day=${presetDate}` : '/calendar';
  const cancel = () => navigate(target ? `/calendar/dates/${target.id}` : back);
  const canSave = Boolean(v.title.trim()) && Boolean(v.date) && (!record || f.dirty);
  const toggleTradition = id => f.set('traditions', v.traditions.includes(id) ? v.traditions.filter(x => x !== id) : [...v.traditions, id]);

  return (
    <>
      <form className="entry-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <Field label={t('dates.title')} error={f.errors.title}>
            <TextInput value={v.title} onChange={e => f.set('title', e.target.value)} maxLength={120} />
          </Field>
          <Field label={t('dates.date')} error={f.errors.date}>
            <DateInput value={v.date} onChange={e => f.set('date', e.target.value)} min="1900-01-01" max="2100-12-31" />
          </Field>
          <Checkbox label={t('dates.yearly')} checked={v.yearly} onChange={e => f.set('yearly', e.target.checked)} />
          {f.errors.yearly && <small className="field-error" role="alert">{f.errors.yearly}</small>}
          <fieldset className="field field-group" aria-describedby={errId('traditions')}>
            <legend>{t('dates.traditions')}</legend>
            <div className="checks">
              {traditions.map(r => (
                <Checkbox key={r.id} label={starterText(tc, r, 'name', r.name)} checked={v.traditions.includes(r.id)} onChange={() => toggleTradition(r.id)} />
              ))}
            </div>
            {f.errors.traditions && <small id={errId('traditions')} className="field-error" role="alert">{f.errors.traditions}</small>}
          </fieldset>
          <Field label={t('dates.notes')} error={f.errors.notes}>
            <TextArea value={v.notes} onChange={e => f.set('notes', e.target.value)} rows={6} maxLength={2000} />
          </Field>
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

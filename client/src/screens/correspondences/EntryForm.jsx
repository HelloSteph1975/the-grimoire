import { useCallback, useId, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextInput, TextArea, Select, Checkbox } from '../../components/Field.jsx';
import { ChipsInput } from '../../components/ChipsInput.jsx';
import { EntryPicker } from '../../components/EntryPicker.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { starterText } from './Correspondences.jsx';

const pad = n => String(n).padStart(2, '0');
// Days per month in a leap year, so 02-29 can be picked.
const daysIn = month => new Date(2024, Number(month), 0).getDate();

// The form's values from a stored entry (or a blank one). Links keep their names for the chips.
const pickWith = tc => r => ({
  name: r?.name ?? '',
  category_id: r?.category_id ? String(r.category_id) : '',
  summary: r?.summary ?? '',
  body: r?.body ?? '',
  keywords: r?.keywords ?? [],
  month: r?.feast_day ? r.feast_day.slice(0, 2) : '',
  day: r?.feast_day ? r.feast_day.slice(3, 5) : '',
  traditions: r?.traditions ?? [],
  links: (r?.links ?? []).map(l => ({ id: l.id, name: starterText(tc, l, 'name', l.name) })),
});

// Only one of month and day picked is sent as is, so the server says the day is incomplete.
const toBody = v => ({
  name: v.name,
  category_id: v.category_id ? Number(v.category_id) : null,
  summary: v.summary,
  body: v.body,
  keywords: v.keywords,
  feast_day: v.month || v.day ? `${v.month}-${v.day}` : null,
  traditions: v.traditions,
  links: v.links.map(l => l.id),
});

export function EntryFormRoute() {
  const { id } = useParams();
  return <EntryFormLoader key={id ?? 'new'} id={id} />;
}

function EntryFormLoader({ id }) {
  const { t } = useT();
  const [params] = useSearchParams();
  const entry = useResource(id ? `/api/correspondences/${id}` : null);
  const categories = useResource('/api/categories');
  const traditions = useResource('/api/traditions');
  const ready = (!id || entry.data) && categories.data && traditions.data;
  const error = entry.error ?? categories.error ?? traditions.error;
  const retry = () => { if (id) entry.reload(); categories.reload(); traditions.reload(); };
  // A new entry saved with edits still open stays on this page, now as an existing entry.
  const [created, setCreated] = useState(false);
  return (
    <>
      <PageHeader title={id || created ? t('corr.edit') : t('corr.new')} />
      <LoadState loading={!ready} error={ready ? null : error} onRetry={retry}>
        {ready && (
          <EntryForm record={id ? entry.data : null} presetCategory={params.get('category') ?? ''}
            categories={categories.data} traditions={traditions.data} onCreated={setCreated} />
        )}
      </LoadState>
      {!ready && error && <p><Link to="/correspondences">{t('corr.back')}</Link></p>}
    </>
  );
}

function EntryForm({ record, presetCategory, categories, traditions, onCreated }) {
  const { t, tc, language } = useT();
  const navigate = useNavigate();
  const pick = useMemo(() => pickWith(tc), [tc]);
  const [initial] = useState(() => {
    const v = pick(record);
    if (!record && categories.some(c => String(c.id) === presetCategory)) v.category_id = presetCategory;
    return v;
  });
  // The record we save against. A new entry gets one after its first save, so a second save
  // (after an edit made during the first) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const body = toBody(values);
    const out = target
      ? await api.patch(`/api/correspondences/${target.id}`, { ...body, version: forced ?? target.version })
      : await api.post('/api/correspondences', body);
    if (!target) onCreated(true);
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, onCreated]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;
  const ids = useId();
  const errId = key => (f.errors[key] ? `${ids}-${key}` : undefined);
  const groupError = key => f.errors[key] && <small id={errId(key)} className="field-error" role="alert">{f.errors[key]}</small>;

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/correspondences/${out.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); f.takeTheirs(pick); };
  // The leave guard asks first if there are unsaved changes.
  const cancel = () => navigate(target ? `/correspondences/${target.id}` : `/correspondences${v.category_id ? `?category=${v.category_id}` : ''}`);
  // Saving an untouched record would only drop its Starter tag.
  const canSave = record ? f.dirty : Boolean(v.name.trim());

  const monthFmt = new Intl.DateTimeFormat(language, { month: 'long' });
  const months = Array.from({ length: 12 }, (_, i) => ({ value: pad(i + 1), label: monthFmt.format(new Date(2024, i, 1)) }));
  const days = Array.from({ length: v.month ? daysIn(v.month) : 31 }, (_, i) => ({ value: pad(i + 1), label: String(i + 1) }));
  const setMonth = month => {
    f.set('month', month);
    if (month && v.day && Number(v.day) > daysIn(month)) f.set('day', '');
  };
  const toggleTradition = id => f.set('traditions', v.traditions.includes(id) ? v.traditions.filter(x => x !== id) : [...v.traditions, id]);

  return (
    <>
      <form className="entry-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <Field label={t('corr.name')} error={f.errors.name}>
            <TextInput value={v.name} onChange={e => f.set('name', e.target.value)} maxLength={80} />
          </Field>
          <Field label={t('corr.category')} error={f.errors.category_id}>
            <Select value={v.category_id} onChange={e => f.set('category_id', e.target.value)}
              placeholder={record ? undefined : t('corr.chooseCategory')} options={categories.map(c => ({ value: String(c.id), label: starterText(tc, c, 'name', c.name) }))} />
          </Field>
          <Field label={t('corr.summary')} error={f.errors.summary} hint={t('corr.summaryCount', { n: v.summary.length })}>
            <TextInput value={v.summary} onChange={e => f.set('summary', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('corr.body')} error={f.errors.body}>
            <TextArea value={v.body} onChange={e => f.set('body', e.target.value)} rows={10} maxLength={4000} />
          </Field>
          <Field label={t('corr.keywords')} error={f.errors.keywords}>
            <ChipsInput value={v.keywords} onChange={k => f.set('keywords', k)} label={t('corr.keywords')} />
          </Field>
          <fieldset className="field field-group">
            <legend>{t('corr.feastDay')}</legend>
            <div className={f.errors.feast_day ? 'feast-day has-error' : 'feast-day'}>
              <div className="field">
                <label htmlFor={`${ids}-month`}>{t('corr.month')}</label>
                <Select id={`${ids}-month`} value={v.month} onChange={e => setMonth(e.target.value)} placeholder={t('corr.none')} options={months}
                  aria-invalid={Boolean(f.errors.feast_day)} aria-describedby={errId('feast_day')} />
              </div>
              <div className="field">
                <label htmlFor={`${ids}-day`}>{t('corr.day')}</label>
                <Select id={`${ids}-day`} value={v.day} onChange={e => f.set('day', e.target.value)} placeholder={t('corr.none')} options={days}
                  aria-invalid={Boolean(f.errors.feast_day)} aria-describedby={errId('feast_day')} />
              </div>
            </div>
            {groupError('feast_day')}
          </fieldset>
          <fieldset className="field field-group" aria-describedby={errId('traditions')}>
            <legend>{t('corr.traditions')}</legend>
            <div className="checks">
              {traditions.map(r => (
                <Checkbox key={r.id} label={starterText(tc, r, 'name', r.name)} checked={v.traditions.includes(r.id)} onChange={() => toggleTradition(r.id)} />
              ))}
            </div>
            {groupError('traditions')}
          </fieldset>
          <fieldset className="field field-group" aria-describedby={errId('links')}>
            <legend>{t('corr.links')}</legend>
            <EntryPicker value={v.links} onChange={l => f.set('links', l)} excludeId={target?.id} />
            {groupError('links')}
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

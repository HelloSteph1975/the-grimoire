import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextInput, TextArea, Select, Checkbox } from '../../components/Field.jsx';
import { ListEditor, withKeys } from '../../components/ListEditor.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';
import { IngredientRow } from './IngredientRow.jsx';
import { TimingFields } from './TimingFields.jsx';

const MAX_LINES = 50;
const blankLine = () => ({ name: '', amount: '', link: null, correspondence_id: null });
const blankStep = () => ({ text: '' });

// The form's values from a stored spell (or a blank one). Lines and steps get client-only keys
// here, so the list editor never has to add them (which would count as a change). Each line keeps
// its stored correspondence_id even when `link` is null because the entry is in the Trash.
const pickWith = tc => s => ({
  title: s?.title ?? '',
  purpose: s?.purpose ?? '',
  kind_id: s?.kind_id ? String(s.kind_id) : '',
  notes: s?.notes ?? '',
  source: s?.source ?? '',
  traditions: s?.traditions ?? [],
  feasts: (s?.feasts ?? []).map(f => ({ id: f.id, name: starterText(tc, f, 'name', f.name) })),
  ingredients: withKeys((s?.ingredients ?? []).map(l => ({
    name: l.name ?? '',
    amount: l.amount ?? '',
    link: l.link ? { id: l.link.id, name: starterText(tc, l.link, 'name', l.link.name) } : null,
    correspondence_id: l.correspondence_id ?? null,
  }))),
  steps: withKeys((s?.steps ?? []).map(text => ({ text }))),
  timing: { moon: s?.timing?.moon ?? [], day: s?.timing?.day ?? [], planet: s?.timing?.planet ?? [] },
});

// No kind is sent as null. When the stored kind is in the Trash the form shows No kind,
// and the server keeps the stored kind.
const toBody = v => ({
  title: v.title,
  purpose: v.purpose,
  kind_id: v.kind_id ? Number(v.kind_id) : null,
  notes: v.notes,
  source: v.source,
  traditions: v.traditions,
  feasts: v.feasts.map(f => f.id),
  ingredients: v.ingredients.map(({ name, amount, correspondence_id }) => ({ name, amount, correspondence_id })),
  steps: v.steps.map(s => s.text),
  timing: v.timing,
});

export function SpellFormRoute() {
  const { id } = useParams();
  return <SpellFormLoader key={id ?? 'new'} id={id} />;
}

function SpellFormLoader({ id }) {
  const { t, ready: languageReady } = useT();
  const { loaded: settingsLoaded } = useSettings();
  const spell = useResource(id ? `/api/spells/${id}` : null);
  const kinds = useResource('/api/spell-kinds');
  const traditions = useResource('/api/traditions');
  // The form takes its starting text once, so it waits for the language pack too.
  const ready = (!id || spell.data) && kinds.data && traditions.data && settingsLoaded && languageReady;
  const error = spell.error ?? kinds.error ?? traditions.error;
  const retry = () => { if (id) spell.reload(); kinds.reload(); traditions.reload(); };
  // A new spell saved with edits still open stays on this page, now as an existing spell.
  const [created, setCreated] = useState(false);
  return (
    <>
      <PageHeader title={id || created ? t('spells.edit') : t('spells.new')} />
      <LoadState loading={!ready} error={ready ? null : error} onRetry={retry}>
        {ready && <SpellForm record={id ? spell.data : null} kinds={kinds.data} traditions={traditions.data} onCreated={setCreated} />}
      </LoadState>
      {!ready && error && <p><Link to="/spells">{t('spells.back')}</Link></p>}
    </>
  );
}

function SpellForm({ record, kinds, traditions, onCreated }) {
  const { t, tc } = useT();
  const navigate = useNavigate();
  const pick = useMemo(() => pickWith(tc), [tc]);
  const [initial] = useState(() => pick(record));
  // The spell we save against. A new spell gets one after its first save, so a second save
  // (after an edit made during the first) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const body = toBody(values);
    const out = target
      ? await api.patch(`/api/spells/${target.id}`, { ...body, version: forced ?? target.version })
      : await api.post('/api/spells', body);
    if (!target) onCreated(true);
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, onCreated]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;
  const groupError = key => f.errors[key] && <small className="field-error" role="alert">{f.errors[key]}</small>;

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/spells/${out.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); f.takeTheirs(pick); };
  // The leave guard asks first if there are unsaved changes.
  const cancel = () => navigate(target ? `/spells/${target.id}` : '/spells');
  const canSave = Boolean(v.title.trim()) && (!record || f.dirty);
  // A line without a name is called by its number in the move and remove buttons.
  const lineLabel = (item, i) => item.name.trim() || t('spells.line', { n: i + 1 });
  const toggleTradition = id => f.set('traditions', v.traditions.includes(id) ? v.traditions.filter(x => x !== id) : [...v.traditions, id]);

  return (
    <>
      <form className="entry-form spell-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <Field label={t('spells.title')} error={f.errors.title}>
            <TextInput value={v.title} onChange={e => f.set('title', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('spells.purpose')} error={f.errors.purpose}>
            <TextInput value={v.purpose} onChange={e => f.set('purpose', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('spells.kind')} error={f.errors.kind_id}>
            <Select value={v.kind_id} onChange={e => f.set('kind_id', e.target.value)} placeholder={t('spells.noKind')}
              options={kinds.map(k => ({ value: String(k.id), label: starterText(tc, k, 'name', k.name) }))} />
          </Field>
          <fieldset className="field field-group">
            <legend>{t('spells.traditions')}</legend>
            <div className="checks">
              {traditions.map(r => (
                <Checkbox key={r.id} label={starterText(tc, r, 'name', r.name)} checked={v.traditions.includes(r.id)} onChange={() => toggleTradition(r.id)} />
              ))}
            </div>
            {groupError('traditions')}
          </fieldset>
          <fieldset className="field field-group">
            <legend>{t('spells.ingredients')}</legend>
            <ListEditor items={v.ingredients} onChange={list => f.set('ingredients', list)} blank={blankLine} max={MAX_LINES}
              addLabel={t('spells.addIngredient')}
              itemLabel={lineLabel}
              renderItem={(item, i, update) => <IngredientRow item={item} index={i} label={lineLabel(item, i)} update={update} errors={f.errors} />} />
            {groupError('ingredients')}
          </fieldset>
          <fieldset className="field field-group">
            <legend>{t('spells.steps')}</legend>
            <ListEditor items={v.steps} onChange={list => f.set('steps', list)} blank={blankStep} max={MAX_LINES}
              addLabel={t('spells.addStep')}
              itemLabel={(item, i) => t('spells.step', { n: i + 1 })}
              renderItem={(item, i, update) => (
                <Field label={t('spells.step', { n: i + 1 })} error={f.errors[`steps.${i}`]} className="spell-step">
                  <TextArea value={item.text} onChange={e => update({ text: e.target.value })} rows={2} maxLength={1000} />
                </Field>
              )} />
            {groupError('steps')}
          </fieldset>
          <TimingFields timing={v.timing} onTimingChange={x => f.set('timing', x)}
            feasts={v.feasts} onFeastsChange={x => f.set('feasts', x)} errors={f.errors} />
          <Field label={t('spells.notes')} error={f.errors.notes}>
            <TextArea value={v.notes} onChange={e => f.set('notes', e.target.value)} rows={6} maxLength={4000} />
          </Field>
          <Field label={t('spells.source')} error={f.errors.source} hint={t('spells.sourceHint')}>
            <TextInput value={v.source} onChange={e => f.set('source', e.target.value)} maxLength={200} />
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

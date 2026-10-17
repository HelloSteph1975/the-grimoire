import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextInput, TextArea, DateInput, Select, Checkbox } from '../../components/Field.jsx';
import { ListEditor, withKeys } from '../../components/ListEditor.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { sortByName } from '../../lib/collate.js';
import { FIRST_DAY, LAST_DAY, dayInRange } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { starterText } from '../correspondences/Correspondences.jsx';
import { SupplyRow } from './SupplyRow.jsx';
import { Suggestions } from './Suggestions.jsx';

const MAX_SUPPLIES = 50;
const REMINDERS = [0, 1, 2, 3, 4, 5, 6, 7, 14, 30];
const blankSupply = () => ({ name: '', amount: '', checked: false });
// A stored supply or a spell ingredient (which has no `checked`) as a form line.
const toSupply = l => ({ name: l.name ?? '', amount: l.amount ?? '', checked: Boolean(l.checked) });
const anId = v => (/^\d+$/.test(v ?? '') ? v : null);

// The form's values from a stored ritual (or a blank one). Supplies get client-only keys here,
// so the list editor never has to add them (which would count as a change). A spell in the
// Trash shows as No spell, and the server keeps the stored link.
const pick = r => ({
  title: r?.title ?? '',
  spell_id: r?.spell ? String(r.spell.id) : '',
  date: r?.date ?? '',
  time: r?.time ?? '',
  reminder_days: r?.reminder_days != null ? String(r.reminder_days) : '',
  traditions: r?.traditions ?? [],
  supplies: withKeys((r?.supplies ?? []).map(toSupply)),
  plan_notes: r?.plan_notes ?? '',
});

const hasSupplies = list => list.some(l => l.name.trim() || l.amount.trim());

// What choosing a spell changes: its traditions are added to the ticked ones, the title is
// filled only if it's empty, and its ingredients only while the supplies are still empty.
const fromSpell = (v, spell) => ({
  title: v.title.trim() ? v.title : spell.title,
  traditions: [...v.traditions, ...(spell.traditions ?? []).filter(id => !v.traditions.includes(id))],
  supplies: hasSupplies(v.supplies) ? v.supplies
    : withKeys((spell.ingredients ?? []).map(toSupply)),
});

// The starting values for a new ritual: a copy of another one (Plan again), with its supplies
// unticked and no date, time or reminder; or a spell from the link; and a day from the link.
function startOf({ copy, spell, presetDate }) {
  const date = dayInRange(presetDate) ? presetDate : '';
  if (copy) {
    const v = pick(copy);
    return { ...v, date, time: '', reminder_days: '', supplies: v.supplies.map(l => ({ ...l, checked: false })) };
  }
  const v = { ...pick(null), date };
  return spell ? { ...v, spell_id: String(spell.id), ...fromSpell(v, spell) } : v;
}

const toBody = v => ({
  title: v.title,
  spell_id: v.spell_id ? Number(v.spell_id) : null,
  traditions: v.traditions,
  date: v.date,
  time: v.time || null,
  reminder_days: v.reminder_days === '' ? null : Number(v.reminder_days),
  plan_notes: v.plan_notes,
  supplies: v.supplies.map(({ name, amount, checked }) => ({ name, amount, checked })),
});

export function RitualFormRoute() {
  const { id } = useParams();
  const { search } = useLocation();
  return <RitualFormLoader key={`${id ?? 'new'}${search}`} id={id} />;
}

function RitualFormLoader({ id }) {
  const { t, ready: languageReady } = useT();
  const { loaded: settingsLoaded } = useSettings();
  const [params] = useSearchParams();
  const copyId = id ? null : anId(params.get('copy'));
  const spellId = id || copyId ? null : anId(params.get('spell'));
  const presetDate = id ? '' : params.get('date') ?? '';
  const ritual = useResource(id || copyId ? `/api/rituals/${id ?? copyId}` : null);
  const preset = useResource(spellId ? `/api/spells/${spellId}` : null);
  const spells = useResource('/api/spells');
  const traditions = useResource('/api/traditions');
  // A spell in the link that is gone (in the Trash, say) just isn't copied.
  // So is a ritual to copy that is gone: the form starts blank.
  const presetGone = preset.error?.status === 404;
  const copyGone = Boolean(copyId) && ritual.error?.status === 404;
  const ready = (!(id || copyId) || ritual.data || copyGone) && (!spellId || preset.data || presetGone)
    && spells.data && traditions.data && settingsLoaded && languageReady;
  const error = (copyGone ? null : ritual.error) ?? (presetGone ? null : preset.error) ?? spells.error ?? traditions.error;
  const retry = () => { if (id || copyId) ritual.reload(); if (spellId) preset.reload(); spells.reload(); traditions.reload(); };
  // A new ritual saved with edits still open stays on this page, now as an existing ritual.
  const [created, setCreated] = useState(false);
  // Cancel goes back where the form was opened from: the copied ritual, the spell, or the list.
  const back = (copyId && !copyGone && `/rituals/${copyId}`) || (spellId && `/spells/${spellId}`) || '/rituals';
  return (
    <>
      <PageHeader title={id || created ? t('rituals.edit') : t('rituals.new')} />
      <LoadState loading={!ready} error={ready ? null : error} onRetry={retry}>
        {ready && <RitualForm record={id ? ritual.data : null}
          start={() => startOf({ copy: copyId && !copyGone ? ritual.data : null, spell: preset.data, presetDate })}
          spells={spells.data} traditions={traditions.data} back={back}
          reloadLists={() => Promise.all([spells.reload(), traditions.reload()])} onCreated={setCreated} />}
      </LoadState>
      {!ready && error && <p><Link to={back}>{t('rituals.title')}</Link></p>}
    </>
  );
}

function RitualForm({ record, start, spells, traditions, back, reloadLists, onCreated }) {
  const { t, tc, language } = useT();
  const navigate = useNavigate();
  const [initial] = useState(() => (record ? pick(record) : start()));
  // The ritual we save against. A new ritual gets one after its first save, so a second save
  // (after an edit made during the first) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const body = toBody(values);
    const out = target
      ? await api.patch(`/api/rituals/${target.id}`, { ...body, version: forced ?? target.version })
      : await api.post('/api/rituals', body);
    if (!target) onCreated(true);
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, onCreated]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;
  const timeRef = useRef(null);
  const groupError = key => f.errors[key] && <small className="field-error" role="alert">{f.errors[key]}</small>;

  // The selected spell's record, for copying and for the feast names in the suggestions.
  // `pending` is a spell the owner just chose, copied in once its record arrives.
  const spell = useResource(v.spell_id ? `/api/spells/${v.spell_id}` : null);
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (!pending || String(spell.data?.id) !== pending) return;
    setPending(null);
    const copied = fromSpell(v, spell.data);
    for (const key of Object.keys(copied)) f.set(key, copied[key]);
  }, [pending, spell.data]); // v is this render's values and f.set never changes.
  const chooseSpell = value => { f.set('spell_id', value); setPending(value || null); };
  const pickDay = day => { f.set('date', day); timeRef.current?.focus(); };

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/rituals/${out.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  // The latest ritual may use a spell or tradition added in another window, so reload those lists too.
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); setPending(null); f.takeTheirs(pick); reloadLists(); };
  // The leave guard asks first if there are unsaved changes.
  const cancel = () => navigate(target ? `/rituals/${target.id}` : back);
  const canSave = Boolean(v.title.trim()) && Boolean(v.date) && (!record || f.dirty);
  const lineLabel = (item, i) => item.name.trim() || t('spells.line', { n: i + 1 });
  const toggleTradition = id => f.set('traditions', v.traditions.includes(id) ? v.traditions.filter(x => x !== id) : [...v.traditions, id]);
  // A stored reminder that isn't one of the usual choices still shows.
  const reminderDays = v.reminder_days !== '' && !REMINDERS.includes(Number(v.reminder_days)) ? [...REMINDERS, Number(v.reminder_days)].sort((a, b) => a - b) : REMINDERS;
  const reminderLabel = n => (n === 0 ? t('rituals.reminderSameDay') : t('rituals.reminderDays', { n }));

  return (
    <>
      <form className="entry-form spell-form ritual-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <Field label={t('rituals.titleField')} error={f.errors.title}>
            <TextInput value={v.title} onChange={e => f.set('title', e.target.value)} maxLength={200} />
          </Field>
          <Field label={t('rituals.spell')} error={f.errors.spell_id}>
            <Select value={v.spell_id} onChange={e => chooseSpell(e.target.value)} placeholder={t('rituals.noSpell')}
              options={sortByName(spells, s => s.title, language).map(s => ({ value: String(s.id), label: s.title }))} />
          </Field>
          {v.spell_id && <Suggestions key={v.spell_id} spellId={v.spell_id} spell={spell.data} spellError={spell.error}
            onSpellRetry={spell.reload} date={v.date} onPick={pickDay} />}
          <div className="ritual-when-fields">
            <Field label={t('rituals.date')} error={f.errors.date}>
              <DateInput value={v.date} onChange={e => f.set('date', e.target.value)} min={FIRST_DAY} max={LAST_DAY} />
            </Field>
            <Field label={t('rituals.time')} error={f.errors.time}>
              <TextInput type="time" ref={timeRef} value={v.time} onChange={e => f.set('time', e.target.value)} />
            </Field>
          </div>
          <Field label={t('rituals.reminder')} error={f.errors.reminder_days}>
            <Select value={v.reminder_days} onChange={e => f.set('reminder_days', e.target.value)} placeholder={t('rituals.reminderNone')}
              options={reminderDays.map(n => ({ value: String(n), label: reminderLabel(n) }))} />
          </Field>
          <fieldset className="field field-group">
            <legend>{t('rituals.traditions')}</legend>
            <div className="checks">
              {traditions.map(r => (
                <Checkbox key={r.id} label={starterText(tc, r, 'name', r.name)} checked={v.traditions.includes(r.id)} onChange={() => toggleTradition(r.id)} />
              ))}
            </div>
            {groupError('traditions')}
          </fieldset>
          <fieldset className="field field-group">
            <legend>{t('rituals.supplies')}</legend>
            <ListEditor items={v.supplies} onChange={list => f.set('supplies', list)} blank={blankSupply} max={MAX_SUPPLIES}
              addLabel={t('rituals.addSupply')} itemLabel={lineLabel}
              renderItem={(item, i, update) => <SupplyRow item={item} index={i} update={update} errors={f.errors} />} />
            {groupError('supplies')}
          </fieldset>
          <Field label={t('rituals.planNotes')} error={f.errors.plan_notes}>
            <TextArea value={v.plan_notes} onChange={e => f.set('plan_notes', e.target.value)} rows={6} maxLength={4000} />
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

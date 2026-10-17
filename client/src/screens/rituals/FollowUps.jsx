import { useCallback, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextArea, DateInput } from '../../components/Field.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { FIRST_DAY, LAST_DAY, formatDay } from '../../lib/days.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const pick = f => ({ date: f?.date ?? '', text: f?.text ?? '' });

// Dated notes added after a ritual. Each is its own versioned record, so saving one never
// touches the ritual (or its version). Only the list of follow-ups reloads.
export function FollowUps({ ritualId }) {
  const { t, language } = useT();
  const toast = useToast();
  const list = useResource(`/api/followups?ritual=${ritualId}`);
  // 'new' while adding, a follow-up's id while editing it, or null.
  const [open, setOpen] = useState(null);
  const today = useResource(open === 'new' ? '/api/today' : null);
  const close = () => { setOpen(null); list.reload(); };

  const remove = async item => {
    try {
      await list.act(() => api.del(`/api/followups/${item.id}`));
    } catch (err) {
      toast.show({ message: errorText(err, t) });
      list.reload();
      return;
    }
    toast.show({
      message: t('rituals.followupDeleted'),
      action: { label: t('common.undo'), onClick: async () => {
          try { await list.act(() => api.post(`/api/followups/${item.id}/restore`)); } catch (err) { toast.show({ message: errorText(err, t) }); }
        } },
      duration: 8000,
    });
  };

  // The add form starts on today in the owner's zone, or blank if that can't be read.
  const todayReady = open !== 'new' || today.data || today.error;
  const items = list.data ?? [];
  // One form at a time: while one is open, the other Edit and Add buttons wait, so switching
  // can never drop what is typed in it. Its own Save or Cancel closes it.
  const formOpen = open !== null;

  return (
    <section className="spell-section followups" aria-labelledby={`followups-${ritualId}`}>
      <h2 id={`followups-${ritualId}`}>{t('rituals.followups')}</h2>
      <LoadState loading={list.loading && !list.data} error={list.error} keepChildren={Boolean(list.data)} onRetry={list.reload}>
        {list.data && items.length === 0 && open !== 'new' && <p className="followups-empty">{t('rituals.followupsEmpty')}</p>}
        {items.length > 0 && (
          <ul className="followup-list">
            {items.map(item => (
              <li key={item.id} className="followup">
                {open === item.id
                  ? <FollowUpForm record={item} ritualId={ritualId} onDone={close} onCancel={() => setOpen(null)} />
                  : (
                    <>
                      <div className="followup-body">
                        <time dateTime={item.date}>{formatDay(item.date, language, { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                        <p>{item.text}</p>
                      </div>
                      <div className="followup-actions">
                        <Button size="sm" variant="ghost" icon={Pencil} disabled={formOpen} onClick={() => setOpen(item.id)}>{t('common.edit')}</Button>
                        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => remove(item)}>{t('common.delete')}</Button>
                      </div>
                    </>
                  )}
              </li>
            ))}
          </ul>
        )}
        {open === 'new'
          ? todayReady && <FollowUpForm startDate={today.data?.day ?? ''} ritualId={ritualId} onDone={close} onCancel={() => setOpen(null)} />
          : <Button variant="ghost" icon={Plus} disabled={formOpen} onClick={() => setOpen('new')}>{t('rituals.addFollowup')}</Button>}
      </LoadState>
    </section>
  );
}

function FollowUpForm({ record, startDate, ritualId, onDone, onCancel }) {
  const { t } = useT();
  const confirm = useConfirm();
  const [initial] = useState(() => (record ? pick(record) : { date: startDate, text: '' }));
  // The follow-up we save against. A new one gets it after its first save, so saving again
  // (after an edit made during the first save) updates it instead of adding another.
  const [target, setTarget] = useState(record ? { id: record.id, version: record.version } : null);
  const submit = useCallback(async (values, { version: forced }) => {
    const out = target
      ? await api.patch(`/api/followups/${target.id}`, { date: values.date, text: values.text, version: forced ?? target.version })
      : await api.post('/api/followups', { ritual_id: ritualId, date: values.date, text: values.text });
    setTarget({ id: out.id, version: out.version });
    return out;
  }, [target, ritualId]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;

  const done = out => { if (out && !f.isDirtyNow()) onDone(); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  const takeTheirs = () => { setTarget(s => ({ ...s, version: f.conflict.version })); f.takeTheirs(pick); };
  // Closing the form drops its changes, so it asks first, as leaving the page would.
  const cancel = async () => {
    if (f.isDirtyNow() && !await confirm({ title: t('leave.title'), body: t('leave.body'), confirmLabel: t('leave.confirm'), danger: true })) return;
    onCancel();
  };
  const canSave = Boolean(v.text.trim()) && Boolean(v.date) && (!target || f.dirty);

  return (
    <>
      <form className="followup-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <Field label={t('rituals.followupDate')} error={f.errors.date}>
            <DateInput value={v.date} onChange={e => f.set('date', e.target.value)} min={FIRST_DAY} max={LAST_DAY} />
          </Field>
          <Field label={t('rituals.followupText')} error={f.errors.text}>
            <TextArea value={v.text} onChange={e => f.set('text', e.target.value)} rows={3} maxLength={2000} />
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

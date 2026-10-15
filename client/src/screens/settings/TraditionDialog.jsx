import { useCallback, useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Field, TextInput, TextArea } from '../../components/Field.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const pick = r => ({ name: r?.name ?? '', description: r?.description ?? '', color: r?.color ?? '#5b4430' });

// `record` is null for a new tradition. `onSave(values, version)` returns the saved row.
export function TraditionDialog({ record, onSave, onClose }) {
  const { t } = useT();
  const confirm = useConfirm();
  // The version we save against. Taking the latest copy adopts its version, so the next save is not stale.
  const [version, setVersion] = useState(record?.version);
  const submit = useCallback((values, { version: forced }) => onSave(values, forced ?? version), [onSave, version]);
  const f = useRecordForm({ initial: pick(record), submit });
  // Close only when everything is saved: a change typed during the save keeps the dialog open.
  const save = async e => { const out = await f.onSubmit(e); if (out && !f.isDirtyNow()) onClose(); };
  const keep = async () => { const out = await f.keepMine(); if (out && !f.isDirtyNow()) onClose(); };
  // Saving an untouched record would only drop its Starter tag. A new one needs a name first.
  const canSave = record ? f.dirty : Boolean(f.values.name);
  const takeTheirs = () => { setVersion(f.conflict.version); f.takeTheirs(pick); };
  const close = async () => {
    if (f.dirty && !await confirm({ title: t('leave.title'), body: t('leave.body'), confirmLabel: t('leave.confirm'), danger: true })) return;
    onClose();
  };
  return (
    <>
      <Dialog open onClose={close} title={record ? t('traditions.edit') : t('traditions.add')}
        footer={(
          <>
            <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="submit" form="tradition-form" disabled={f.saving || !canSave}>{f.saving ? t('common.saving') : t('common.save')}</Button>
          </>
        )}>
        <form id="tradition-form" onSubmit={save}>
          <fieldset disabled={f.saving}>
            <Field label={t('traditions.name')} error={f.errors.name}>
              <TextInput value={f.values.name} onChange={e => f.set('name', e.target.value)} maxLength={60} data-autofocus="" />
            </Field>
            <Field label={t('traditions.description')} error={f.errors.description}>
              <TextArea value={f.values.description} onChange={e => f.set('description', e.target.value)} maxLength={600} />
            </Field>
            <Field label={t('traditions.color')} error={f.errors.color}>
              <input type="color" className="input" value={f.values.color} onChange={e => f.set('color', e.target.value)} />
            </Field>
          </fieldset>
          {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
        </form>
      </Dialog>
      <ConflictDialog conflict={f.conflict} onKeepMine={keep} onTakeTheirs={takeTheirs} onDismiss={f.dismissConflict} />
    </>
  );
}

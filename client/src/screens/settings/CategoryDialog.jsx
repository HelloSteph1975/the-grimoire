import { useCallback, useState } from 'react';
import { Dialog } from '../../components/Dialog.jsx';
import { Button } from '../../components/Button.jsx';
import { Field, TextInput } from '../../components/Field.jsx';
import { CategoryIcon, ICONS } from '../../components/CategoryIcon.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { useT } from '../../i18n/I18nProvider.jsx';

// A starter row shows its text in the screen language, so saving writes that text (accepted trade-off).
const pickWith = tc => r => ({ name: tc(r?.is_starter ? r.starter_key : null, 'name', r?.name ?? ''), icon: r?.icon ?? ICONS[0] });

// `record` is null for a new category. `onSave(values, version)` returns the saved row.
export function CategoryDialog({ record, onSave, onClose }) {
  const { t, tc } = useT();
  const [pick] = useState(() => pickWith(tc));
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
      <Dialog open onClose={close} title={record ? t('categories.edit') : t('categories.add')}
        footer={(
          <>
            <Button variant="ghost" onClick={close}>{t('common.cancel')}</Button>
            <Button type="submit" form="category-form" disabled={f.saving || !canSave}>{f.saving ? t('common.saving') : t('common.save')}</Button>
          </>
        )}>
        <form id="category-form" onSubmit={save}>
          <fieldset disabled={f.saving}>
            <Field label={t('categories.name')} error={f.errors.name}>
              <TextInput value={f.values.name} onChange={e => f.set('name', e.target.value)} maxLength={60} data-autofocus="" />
            </Field>
            <fieldset className="icon-picker">
              <legend>{t('categories.icon')}</legend>
              <div className="icons">
                {ICONS.map(name => (
                  <label key={name} className="icon-choice">
                    <input type="radio" name="category-icon" value={name} checked={f.values.icon === name}
                      aria-label={t(`icon.${name}`)} onChange={() => f.set('icon', name)} />
                    <span><CategoryIcon name={name} /></span>
                  </label>
                ))}
              </div>
              {f.errors.icon && <small className="field-error" role="alert">{f.errors.icon}</small>}
            </fieldset>
          </fieldset>
          {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
        </form>
      </Dialog>
      <ConflictDialog conflict={f.conflict} onKeepMine={keep} onTakeTheirs={takeTheirs} onDismiss={f.dismissConflict} />
    </>
  );
}

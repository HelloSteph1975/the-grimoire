import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Field, TextInput } from '../../components/Field.jsx';
import { EntryPicker } from '../../components/EntryPicker.jsx';
import { useT } from '../../i18n/I18nProvider.jsx';

// One line of the spell form: Name, Amount and an optional link to a correspondence.
// A line whose linked entry is in the Trash keeps its correspondence_id (so the link comes back
// if the entry is restored) and says so; the owner can remove that link here.
export function IngredientRow({ item, index, label, update, errors }) {
  const { t } = useT();
  const linkBox = useRef(null);
  const focusPicker = useRef(false);
  const err = field => errors[`ingredients.${index}.${field}`];
  const inTrash = Boolean(item.correspondence_id) && !item.link;

  useEffect(() => {
    if (!focusPicker.current) return;
    focusPicker.current = false;
    linkBox.current?.querySelector('input')?.focus();
  });

  const unlink = () => { focusPicker.current = true; update({ link: null, correspondence_id: null }); };

  return (
    <>
      <Field label={t('spells.ingredientName')} error={err('name')} className="spell-line-name">
        <TextInput value={item.name} onChange={e => update({ name: e.target.value })} maxLength={200} />
      </Field>
      <Field label={t('spells.amount')} error={err('amount')} className="spell-line-amount">
        <TextInput value={item.amount} onChange={e => update({ amount: e.target.value })} maxLength={50} />
      </Field>
      <div className="field spell-line-link" ref={linkBox}>
        {inTrash ? (
          <ul className="chips">
            <li className="chip">
              <span>{t('spells.linkInTrash')}</span>
              <button type="button" className="chip-remove" aria-label={t('spells.removeLink', { name: label })} onClick={unlink}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          </ul>
        ) : (
          <EntryPicker single label={t('spells.link')} placeholder={t('spells.link')} value={item.link ? [item.link] : []}
            onChange={list => update({ link: list[0] ?? null, correspondence_id: list[0]?.id ?? null })} />
        )}
        {err('correspondence_id') && <small className="field-error" role="alert">{err('correspondence_id')}</small>}
      </div>
    </>
  );
}

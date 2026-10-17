import { useId } from 'react';
import { Field, TextInput, Checkbox } from '../../components/Field.jsx';
import { useT } from '../../i18n/I18nProvider.jsx';

// One card line of the entry form: the card, where it fell, and whether it was reversed.
// The card box suggests the 78 names but takes any words.
export function CardRow({ item, index, update, errors, names }) {
  const { t } = useT();
  const listId = useId();
  const err = field => errors[`cards.${index}.${field}`];
  return (
    <>
      <Field label={t('journal.cardName')} error={err('name')} className="spell-line-name">
        <TextInput list={listId} value={item.name} onChange={e => update({ name: e.target.value })} maxLength={100} />
      </Field>
      <datalist id={listId}>{names.map(n => <option key={n} value={n} />)}</datalist>
      <Field label={t('journal.cardPosition')} error={err('position')} className="spell-line-amount">
        <TextInput value={item.position} onChange={e => update({ position: e.target.value })} maxLength={100} />
      </Field>
      <div className="supply-ready">
        <Checkbox label={t('journal.reversed')} checked={item.reversed} onChange={e => update({ reversed: e.target.checked })} />
        {err('reversed') && <small className="field-error" role="alert">{err('reversed')}</small>}
      </div>
    </>
  );
}

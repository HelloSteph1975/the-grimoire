import { Field, TextInput, Checkbox } from '../../components/Field.jsx';
import { useT } from '../../i18n/I18nProvider.jsx';

// One supply line of the plan form: Name, Amount and whether it's ready.
export function SupplyRow({ item, index, update, errors }) {
  const { t } = useT();
  const err = field => errors[`supplies.${index}.${field}`];
  return (
    <>
      <Field label={t('rituals.supplyName')} error={err('name')} className="spell-line-name">
        <TextInput value={item.name} onChange={e => update({ name: e.target.value })} maxLength={200} />
      </Field>
      <Field label={t('rituals.supplyAmount')} error={err('amount')} className="spell-line-amount">
        <TextInput value={item.amount} onChange={e => update({ amount: e.target.value })} maxLength={50} />
      </Field>
      <div className="supply-ready">
        <Checkbox label={t('rituals.supplyChecked')} checked={item.checked} onChange={e => update({ checked: e.target.checked })} />
        {err('checked') && <small className="field-error" role="alert">{err('checked')}</small>}
      </div>
    </>
  );
}

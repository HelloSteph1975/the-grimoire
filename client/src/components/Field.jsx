import { cloneElement, useId } from 'react';

export function Field({ label, error, hint, children, className = '' }) {
  const id = useId();
  const describedBy = error || hint ? `${id}-note` : undefined;
  return (
    <div className={`field ${error ? 'has-error' : ''} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? <small id={describedBy} className="field-error" role="alert">{error}</small>
        : hint && <small id={describedBy} className="field-hint">{hint}</small>}
    </div>
  );
}

export const TextInput = props => <input type="text" className="input" {...props} value={props.value ?? ''} />;
export const NumberInput = props => <input type="number" step="any" inputMode="decimal" className="input" {...props} value={props.value ?? ''} />;
export const DateInput = props => <input type="date" className="input" {...props} value={props.value ?? ''} />;
export const TextArea = props => <textarea className="input" rows={3} {...props} value={props.value ?? ''} />;
export function Select({ options, placeholder, ...props }) {
  return (
    <select className="input" {...props} value={props.value ?? ''}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Checkbox({ label, ...props }) {
  return <label className="checkbox"><input type="checkbox" {...props} checked={Boolean(props.checked)} /> {label}</label>;
}

import { Check } from 'lucide-react';

// A row of toggle buttons. `value` is a list of option values; onChange gets the
// new list in option order. Pressed buttons show a check mark and a heavier border,
// so the state never relies on color alone.
export function ToggleGroup({ label, options, value, onChange }) {
  const toggle = v => {
    const on = value.includes(v);
    onChange(options.map(o => o.value).filter(x => (x === v ? !on : value.includes(x))));
  };
  return (
    <div role="group" aria-label={label} className="toggle-group">
      {options.map(o => {
        const pressed = value.includes(o.value);
        return (
          <button key={o.value} type="button" className="toggle-btn" aria-pressed={pressed} onClick={() => toggle(o.value)}>
            {pressed && <Check size={14} aria-hidden="true" />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

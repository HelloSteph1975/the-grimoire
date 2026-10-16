import { useEffect, useRef } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { Button } from './Button.jsx';
import { ReorderButtons } from './ReorderButtons.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

// Each item carries a client-only `key` so React keeps a row's typed text through
// reorders. Callers build their starting list with withKeys() and strip `key`
// from every item before saving.
let counter = 0;
const nextKey = () => `li-${++counter}`;
export const withKeys = items => items.map(item => (item.key ? item : { ...item, key: nextKey() }));

export function ListEditor({ items, onChange, blank, renderItem, itemLabel, addLabel, max }) {
  const { t } = useT();
  const rows = useRef(new Map());
  const addRef = useRef(null);
  const dragKey = useRef(null);
  const focusNext = useRef(null);
  const keyed = withKeys(items);

  // Keys are assigned during render; hand them back to the parent once so they stay stable.
  const needsKeys = keyed.some((k, i) => k !== items[i]);
  useEffect(() => { if (needsKeys) onChange(keyed); });

  useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    if (want.type === 'add') { addRef.current?.focus(); return; }
    const li = rows.current.get(want.key);
    if (!li) return;
    if (want.type === 'input') { li.querySelector('input, textarea, select')?.focus(); return; }
    const [up, down] = li.querySelectorAll('.list-move button');
    const [first, second] = want.type === 'down' ? [down, up] : [up, down];
    (first && !first.disabled ? first : second)?.focus();
  });

  const move = (from, delta) => {
    const to = from + delta;
    if (to < 0 || to >= keyed.length) return;
    const next = [...keyed];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    focusNext.current = { key: item.key, type: delta < 0 ? 'up' : 'down' };
    onChange(next);
  };
  const update = (index, patch) => onChange(keyed.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const remove = index => {
    const after = keyed[index + 1];
    focusNext.current = after ? { key: after.key, type: 'input' } : { type: 'add' };
    onChange(keyed.filter((_, i) => i !== index));
  };
  const add = () => {
    const item = withKeys([blank()])[0];
    focusNext.current = { key: item.key, type: 'input' };
    onChange([...keyed, item]);
  };
  const drop = targetKey => {
    const from = keyed.findIndex(i => i.key === dragKey.current);
    const to = keyed.findIndex(i => i.key === targetKey);
    dragKey.current = null;
    if (from >= 0 && to >= 0 && from !== to) move(from, to - from);
  };

  return (
    <div className="list-editor">
      <ul className="list-rows">
        {keyed.map((item, index) => {
          const label = itemLabel(item, index);
          return (
            <li
              key={item.key}
              className="list-row"
              ref={el => { if (el) rows.current.set(item.key, el); else rows.current.delete(item.key); }}
              onDragOver={e => { if (dragKey.current) e.preventDefault(); }}
              onDrop={e => { e.preventDefault(); drop(item.key); }}
            >
              <span
                className="list-handle"
                aria-hidden="true"
                title={t('list.drag')}
                draggable
                onDragStart={e => {
                  dragKey.current = item.key;
                  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', item.key); }
                }}
                onDragEnd={() => { dragKey.current = null; }}
              >
                <GripVertical size={16} />
              </span>
              <div className="list-fields">{renderItem(item, index, patch => update(index, patch))}</div>
              <div className="list-move">
                <ReorderButtons index={index} count={keyed.length} onMove={move} label={label} />
              </div>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label={t('list.remove', { item: label })} onClick={() => remove(index)} />
            </li>
          );
        })}
      </ul>
      <Button ref={addRef} variant="ghost" size="sm" icon={Plus} onClick={add} disabled={max != null && keyed.length >= max}>{addLabel}</Button>
    </div>
  );
}

import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListEditor, withKeys } from '../../client/src/components/ListEditor.jsx';

const start = () => withKeys([{ name: 'A', amount: '1' }, { name: 'B', amount: '2' }, { name: 'C', amount: '3' }]);
let latest;
function Harness({ initial = start(), max = 10 }) {
  const [items, setItems] = useState(initial);
  latest = items;
  return (
    <ListEditor
      items={items}
      onChange={setItems}
      blank={() => ({ name: '', amount: '' })}
      itemLabel={item => item.name || 'new item'}
      addLabel="Add ingredient"
      max={max}
      renderItem={(item, i, update) => (
        <>
          <input aria-label={`Name ${i + 1}`} value={item.name} onChange={e => update({ name: e.target.value })} />
          <input aria-label={`Amount ${i + 1}`} value={item.amount} onChange={e => update({ amount: e.target.value })} />
        </>
      )}
    />
  );
}
const names = () => latest.map(i => `${i.name}:${i.amount}`);

describe('ListEditor', () => {
  it('moves a row whole and focuses the other button when it hits the end', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Move B down' }));
    expect(names()).toEqual(['A:1', 'C:3', 'B:2']);
    expect(screen.getByRole('button', { name: 'Move B down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move B up' })).toHaveFocus();
  });

  it('moves with the keyboard and keeps focus on the same button', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole('button', { name: 'Move A down' }).focus();
    await user.keyboard('{Enter}');
    expect(names()).toEqual(['B:2', 'A:1', 'C:3']);
    expect(screen.getByRole('button', { name: 'Move A down' })).toHaveFocus();
  });

  it('keeps typed text with its row through a move', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('Name 1'), 'x');
    await user.click(screen.getByRole('button', { name: 'Move Ax down' }));
    expect(screen.getByLabelText('Name 2')).toHaveValue('Ax');
  });

  it('removes a row and focuses the next row, or Add when it was last', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Remove A' }));
    expect(names()).toEqual(['B:2', 'C:3']);
    expect(screen.getByLabelText('Name 1')).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Remove C' }));
    expect(screen.getByRole('button', { name: 'Add ingredient' })).toHaveFocus();
  });

  it('adds a blank row, focuses its first input, and disables Add at max', async () => {
    const user = userEvent.setup();
    render(<Harness max={4} />);
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }));
    expect(latest).toHaveLength(4);
    expect(screen.getByLabelText('Name 4')).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Add ingredient' })).toBeDisabled();
  });

  it('moves a row when its handle is dropped on another row', () => {
    const onChange = vi.fn();
    render(<ListEditor items={start()} onChange={onChange} blank={() => ({})} itemLabel={i => i.name} addLabel="Add" renderItem={i => <span>{i.name}</span>} />);
    const rows = screen.getAllByRole('listitem');
    const data = {};
    const dataTransfer = { setData: (k, v) => { data[k] = v; }, getData: k => data[k], effectAllowed: '' };
    fireEvent.dragStart(rows[0].querySelector('.list-handle'), { dataTransfer });
    fireEvent.dragOver(rows[2], { dataTransfer });
    fireEvent.drop(rows[2], { dataTransfer });
    expect(onChange.mock.calls[0][0].map(i => i.name)).toEqual(['B', 'C', 'A']);
  });
});

import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleGroup } from '../../client/src/components/ToggleGroup.jsx';

const options = [{ value: 'new', label: 'New moon' }, { value: 'waxing-crescent', label: 'Waxing crescent' }, { value: 'full', label: 'Full moon' }];
let latest;
function Harness() {
  const [v, setV] = useState([]);
  latest = v;
  return <ToggleGroup label="Moon phases" options={options} value={v} onChange={setV} />;
}

describe('ToggleGroup', () => {
  it('is a labelled group of pressable buttons', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Moon phases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Full moon' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('returns values in option order and toggles off', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Full moon' }));
    await user.click(screen.getByRole('button', { name: 'New moon' }));
    expect(latest).toEqual(['new', 'full']);
    expect(screen.getByRole('button', { name: 'New moon' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Full moon' }));
    expect(latest).toEqual(['new']);
  });
});

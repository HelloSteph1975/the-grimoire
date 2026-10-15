import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { useLeaveGuard } from '../../client/src/lib/useLeaveGuard.js';

function Field({ label }) {
  const [value, setValue] = useState('');
  useLeaveGuard(value !== '');
  return <input aria-label={label} value={value} onChange={e => setValue(e.target.value)} />;
}

// Two forms on one screen, the second registered last (as TraditionDialog is after GeneralForm).
const setup = () => {
  const router = createMemoryRouter([
    {
      path: '/',
      element: (
        <ConfirmProvider>
          <LeaveGuardProvider>
            <Field label="First" />
            <Field label="Second" />
            <Link to="/elsewhere">Away</Link>
          </LeaveGuardProvider>
        </ConfirmProvider>
      ),
    },
    { path: '/elsewhere', element: <p>Elsewhere</p> },
  ]);
  render(<RouterProvider router={router} />);
};
const fire = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };

describe('LeaveGuardProvider', () => {
  it('asks before leaving when the first form is dirty and the second is clean', async () => {
    setup();
    await userEvent.type(screen.getByLabelText('First'), 'x');
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    expect(screen.getAllByText('Leave without saving?')).toHaveLength(1);
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('First')).toHaveValue('x');
  });
  it('lets you leave when neither form is dirty', async () => {
    setup();
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });
  it('warns on tab close when either form is dirty', async () => {
    setup();
    expect(fire()).toBe(false);
    await userEvent.type(screen.getByLabelText('First'), 'x');
    expect(fire()).toBe(true);
    await userEvent.clear(screen.getByLabelText('First'));
    expect(fire()).toBe(false);
    await userEvent.type(screen.getByLabelText('Second'), 'y');
    expect(fire()).toBe(true);
  });
});

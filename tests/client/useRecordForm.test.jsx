import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, Link, useNavigate } from 'react-router-dom';
import { ConfirmProvider } from '../../client/src/components/ConfirmProvider.jsx';
import { LeaveGuardProvider } from '../../client/src/components/LeaveGuardProvider.jsx';
import { useRecordForm } from '../../client/src/lib/useRecordForm.js';
import { ApiError } from '../../client/src/lib/api.js';

function Form({ submit }) {
  const f = useRecordForm({ initial: { name: 'A' }, submit });
  const navigate = useNavigate();
  return (
    <form onSubmit={f.onSubmit}>
      <input aria-label="Name" value={f.values.name} onChange={e => f.set('name', e.target.value)} />
      <button type="submit" disabled={f.saving}>Save</button>
      {f.formError && <p role="alert">{f.formError}</p>}
      {f.errors.name && <p>{f.errors.name}</p>}
      {f.conflict && <button type="button" onClick={f.keepMine}>Keep mine</button>}
      {f.conflict && <button type="button" onClick={() => f.takeTheirs(c => ({ name: c.name }))}>Take theirs</button>}
      <span data-testid="dirty">{String(f.dirty)}</span>
      <button type="button" onClick={async () => { await f.onSubmit(); navigate('/elsewhere'); }}>Save and go</button>
      <Link to="/elsewhere">Away</Link>
    </form>
  );
}

const setup = submit => {
  const router = createMemoryRouter([
    { path: '/', element: <ConfirmProvider><LeaveGuardProvider><Form submit={submit} /></LeaveGuardProvider></ConfirmProvider> },
    { path: '/elsewhere', element: <p>Elsewhere</p> },
  ]);
  render(<RouterProvider router={router} />);
  return router;
};

describe('useRecordForm', () => {
  it('tracks unsaved changes and clears them after saving', async () => {
    const submit = vi.fn(async v => ({ ...v, version: 2 }));
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
    await userEvent.click(screen.getByText('Save'));
    expect(submit).toHaveBeenCalledWith({ name: 'AB' }, { version: undefined });
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('asks before leaving with unsaved changes', async () => {
    setup(vi.fn());
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Leave without saving?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.getByLabelText('Name')).toHaveValue('AB');
  });

  it('lets you leave freely when nothing changed', async () => {
    setup(vi.fn());
    await userEvent.click(screen.getByText('Away'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('shows field errors and keeps the values on a 400', async () => {
    setup(vi.fn(async () => { throw new ApiError('Please fix the highlighted fields.', 400, { name: 'Required' }); }));
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('A');
  });

  it('keeps the form filled in when the server is unreachable', async () => {
    setup(vi.fn(async () => { throw new ApiError("Can't reach The Grimoire.", 0); }));
    await userEvent.type(screen.getByLabelText('Name'), 'Z');
    await userEvent.click(screen.getByText('Save'));
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach The Grimoire.");
    expect(screen.getByLabelText('Name')).toHaveValue('AZ');
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
  });

  it('on a conflict, Keep mine saves again at the server version', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiError('changed', 409, {}, { name: 'Theirs', version: 5 }))
      .mockResolvedValueOnce({ name: 'AB', version: 6 });
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Keep mine'));
    expect(submit).toHaveBeenLastCalledWith({ name: 'AB' }, { version: 5 });
    expect(screen.queryByText('Keep mine')).not.toBeInTheDocument();
  });

  it('on a conflict, Take theirs loads the server copy', async () => {
    setup(vi.fn().mockRejectedValueOnce(new ApiError('changed', 409, {}, { name: 'Theirs', version: 5 })));
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Take theirs'));
    expect(screen.getByLabelText('Name')).toHaveValue('Theirs');
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('ignores a second submit while saving', async () => {
    let release;
    const submit = vi.fn(() => new Promise(r => { release = r; }));
    setup(submit);
    const form = screen.getByLabelText('Name').closest('form');
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => release({ name: 'A', version: 2 }));
  });

  it('Leave in the confirm navigates away', async () => {
    setup(vi.fn());
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Away'));
    await userEvent.click(await screen.findByText('Leave'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
  });

  it('does not prompt when navigating right after a save', async () => {
    const submit = vi.fn(async v => ({ ...v, version: 2 }));
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save and go'));
    expect(await screen.findByText('Elsewhere')).toBeInTheDocument();
    expect(screen.queryByText('Leave without saving?')).not.toBeInTheDocument();
  });

  it('warns on tab close only while dirty', async () => {
    setup(vi.fn(async v => ({ ...v, version: 2 })));
    const fire = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    expect(fire()).toBe(false);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    expect(fire()).toBe(true);
    await userEvent.click(screen.getByText('Save'));
    expect(fire()).toBe(false);
  });

  it('Keep mine leaves the form clean', async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new ApiError('changed', 409, {}, { name: 'Theirs', version: 5 }))
      .mockResolvedValueOnce({ name: 'AB', version: 6 });
    setup(submit);
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    await userEvent.click(await screen.findByText('Keep mine'));
    expect(screen.getByTestId('dirty')).toHaveTextContent('false');
  });

  it('a 400 leaves the form dirty', async () => {
    setup(vi.fn(async () => { throw new ApiError('Fix', 400, { name: 'Required' }); }));
    await userEvent.type(screen.getByLabelText('Name'), 'B');
    await userEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(screen.getByTestId('dirty')).toHaveTextContent('true');
  });
});

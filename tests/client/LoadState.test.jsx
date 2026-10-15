import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadState } from '../../client/src/components/LoadState.jsx';

describe('LoadState', () => {
  it('shows loading', () => {
    render(<LoadState loading><p>Body</p></LoadState>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });
  it('shows the error and Try again', async () => {
    const onRetry = vi.fn();
    render(<LoadState error={new Error("Can't reach The Grimoire.")} onRetry={onRetry}><p>Body</p></LoadState>);
    expect(screen.getByRole('alert')).toHaveTextContent("Can't reach The Grimoire.");
    await userEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByText('Body')).not.toBeInTheDocument();
  });
  it('shows the children once loaded', () => {
    render(<LoadState><p>Body</p></LoadState>);
    expect(screen.getByText('Body')).toBeInTheDocument();
  });
});

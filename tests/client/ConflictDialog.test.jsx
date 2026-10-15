import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictDialog } from '../../client/src/components/ConflictDialog.jsx';

function setup() {
  const h = { onKeepMine: vi.fn(), onTakeTheirs: vi.fn(), onDismiss: vi.fn() };
  render(<form><ConflictDialog conflict={{ version: 5 }} {...h} /></form>);
  return h;
}

describe('ConflictDialog', () => {
  it('the header X dismisses without taking theirs, and does not submit a surrounding form', async () => {
    const h = setup();
    await userEvent.click(screen.getByLabelText('Close'));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    expect(h.onTakeTheirs).not.toHaveBeenCalled();
  });
  it('Escape dismisses without taking theirs', async () => {
    const h = setup();
    const dialog = document.querySelector('dialog');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    expect(h.onTakeTheirs).not.toHaveBeenCalled();
  });
  it('the two buttons call their handlers', async () => {
    const h = setup();
    await userEvent.click(screen.getByText('Reload the latest'));
    expect(h.onTakeTheirs).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText('Keep mine and save over it'));
    expect(h.onKeepMine).toHaveBeenCalledTimes(1);
  });
});

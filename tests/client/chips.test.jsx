import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChipsInput } from '../../client/src/components/ChipsInput.jsx';
import { CategoryIcon, ICONS } from '../../client/src/components/CategoryIcon.jsx';

function Harness({ start = [], max, onChange, keepCase }) {
  const [v, setV] = useState(start);
  return <ChipsInput id="kw" label="Keywords" value={v} max={max} keepCase={keepCase} onChange={n => { setV(n); onChange?.(n); }} />;
}
const box = () => screen.getByLabelText('Keywords');

describe('ChipsInput', () => {
  it('adds a lower-cased chip on Enter and on comma', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(box(), 'Moon{Enter}');
    await user.type(box(), 'Silver,');
    expect(screen.getByRole('button', { name: 'Remove moon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove silver' })).toBeInTheDocument();
    expect(box()).toHaveValue('');
  });

  it('ignores duplicates and empty input', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness start={['moon']} onChange={onChange} />);
    await user.type(box(), 'MOON{Enter}');
    await user.type(box(), '   {Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('treats accents and case as the same chip when keeping case', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness keepCase onChange={onChange} />);
    await user.type(box(), 'Luna{Enter}');
    await user.type(box(), 'Lúna{Enter}');
    await user.clear(box());
    await user.type(box(), 'luna{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Remove Luna' })).toBeInTheDocument();
  });

  it('removes a chip with its x button', async () => {
    const user = userEvent.setup();
    render(<Harness start={['a', 'b']} />);
    await user.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(screen.queryByRole('button', { name: 'Remove a' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove b' })).toBeInTheDocument();
  });

  it('Backspace on an empty input removes the last chip', async () => {
    const user = userEvent.setup();
    render(<Harness start={['a', 'b']} />);
    await user.click(box());
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: 'Remove b' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove a' })).toBeInTheDocument();
  });

  it('stops at max and shows the limit', async () => {
    const user = userEvent.setup();
    render(<Harness start={['a', 'b']} max={2} />);
    expect(screen.getByText('Up to 2')).toBeInTheDocument();
    await user.type(box(), 'c{Enter}');
    expect(screen.queryByRole('button', { name: 'Remove c' })).toBeNull();
  });

  it('does not add a 31-character word', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(box(), `${'x'.repeat(31)}{Enter}`);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('ChipsInput pending text', () => {
  it('adds typed text as a chip when the box loses focus', async () => {
    const user = userEvent.setup();
    render(<><Harness /><button type="button">Elsewhere</button></>);
    await user.type(box(), 'Silver');
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    expect(screen.getByRole('button', { name: 'Remove silver' })).toBeInTheDocument();
    expect(box()).toHaveValue('');
  });
  it('shows the Enter hint only while text is waiting', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.queryByText('Press Enter to add')).toBeNull();
    await user.type(box(), 'si');
    expect(screen.getByText('Press Enter to add')).toBeInTheDocument();
    await user.clear(box());
    expect(screen.queryByText('Press Enter to add')).toBeNull();
  });
  it('tells a parent about the waiting text when it controls it', async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<ChipsInput id="kw" label="Keywords" value={[]} pending="ab" onChange={() => {}} onPendingChange={seen} />);
    expect(box()).toHaveValue('ab');
    await user.type(box(), 'c');
    expect(seen).toHaveBeenLastCalledWith('abc');
  });
});

describe('ChipsInput focus', () => {
  it('returns focus to the input after removing a chip, and stays enabled at max', async () => {
    const user = userEvent.setup();
    render(<Harness start={['a', 'b']} max={2} />);
    expect(box()).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Remove a' }));
    expect(box()).toHaveFocus();
  });
});

describe('CategoryIcon', () => {
  it('renders every named icon and falls back for unknown names, hidden from screen readers', () => {
    expect(ICONS).toHaveLength(12);
    for (const name of [...ICONS, 'nope']) {
      const { container, unmount } = render(<CategoryIcon name={name} />);
      expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
  });
});

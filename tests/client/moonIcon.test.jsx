import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MoonIcon } from '../../client/src/components/MoonIcon.jsx';

const lit = c => c.querySelector('.moon-lit');

describe('MoonIcon', () => {
  it('draws the lit part on the right when waxing', () => {
    const { container } = render(<MoonIcon lit={0.28} waxing />);
    expect(lit(container).tagName.toLowerCase()).toBe('path');
    expect(lit(container).closest('[data-side]')).toHaveAttribute('data-side', 'right');
  });
  it('draws the lit part on the left when waning', () => {
    const { container } = render(<MoonIcon lit={0.28} waxing={false} />);
    expect(lit(container).closest('[data-side]')).toHaveAttribute('data-side', 'left');
  });
  it('draws a full disc at 1 and nothing lit at 0', () => {
    const full = render(<MoonIcon lit={1} waxing />);
    expect(lit(full.container)).not.toBeNull();
    expect(lit(full.container).tagName.toLowerCase()).toBe('circle');
    const none = render(<MoonIcon lit={0} waxing />);
    expect(lit(none.container)).toBeNull();
  });
  it('is hidden from readers unless it has a title', () => {
    const { container, rerender } = render(<MoonIcon lit={0.5} waxing />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<MoonIcon lit={0.5} waxing title="Full moon" />);
    expect(container.querySelector('svg')).not.toHaveAttribute('aria-hidden');
    expect(container.querySelector('title')).toHaveTextContent('Full moon');
  });
});

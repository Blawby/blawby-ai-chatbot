import type { JSX } from 'preact';
import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { Button } from '@/shared/ui/Button';
import { ProfileMenuItem } from '@/shared/ui/profile/molecules/ProfileMenuItem';

const TestIcon = (props: JSX.SVGAttributes<SVGSVGElement>) => (
  <svg data-testid="test-icon" {...props} />
);

describe('Icon standardization', () => {
  it('renders icon components through Button with shared icon styling', () => {
    render(
      <Button
        icon={TestIcon}
        iconClassName="h-4 w-4 text-input-text"
        aria-label="Open inspector"
      />
    );

    const button = screen.getByRole('button', { name: 'Open inspector' });
    const icon = screen.getByTestId('test-icon');

    expect(button).toHaveClass('btn-icon-md');
    expect(icon).toHaveClass('shrink-0', 'h-4', 'w-4', 'text-input-text');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
  });

  it('preserves JSX icon children for Button compatibility', () => {
    render(
      <Button
        icon={<svg data-testid="custom-icon" className="custom-svg" />}
        aria-label="Open custom"
      />
    );

    const icon = screen.getByTestId('custom-icon');
    expect(icon).toHaveClass('custom-svg');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveAttribute('focusable', 'false');
  });

  it('renders profile menu icons from icon component props without changing behavior', () => {
    const onClick = vi.fn();

    render(
      <ProfileMenuItem
        icon={TestIcon}
        label="Settings"
        onClick={onClick}
        isActive
      />
    );

    const button = screen.getByRole('menuitem', { name: 'Settings' });
    const icon = screen.getByTestId('test-icon');

    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(button).toHaveClass('font-semibold');
    expect(icon).toHaveClass('shrink-0', 'w-4', 'h-4');
  });
});

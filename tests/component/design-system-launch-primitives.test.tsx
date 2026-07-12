import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';

import ToastComponent from '@/shared/components/Toast';
import { SettingRow } from '@/features/settings/components/SettingRow';
import { Checkbox } from '@/shared/ui/input/Checkbox';
import { Combobox } from '@/shared/ui/input/Combobox';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';

describe('launch design-system primitives', () => {
  it('gives the shared toast dismiss control a name and touch-sized target', () => {
    const onRemove = vi.fn();

    render(
      <ToastComponent
        toast={{ id: 'toast-1', type: 'error', title: 'Payouts', message: 'Unable to load.' }}
        onRemove={onRemove}
      />
    );

    const dismiss = screen.getByRole('button', { name: 'Dismiss notification' });
    expect(dismiss).toHaveAttribute('type', 'button');
    expect(dismiss).toHaveClass('h-11', 'w-11');

    fireEvent.click(dismiss);
    expect(onRemove).toHaveBeenCalledWith('toast-1');
  });

  it('stacks setting rows by default and restores two columns at the small breakpoint', () => {
    const { container } = render(
      <SettingRow label="Default sidebar state" description="Choose the initial state.">
        <button type="button">Expanded</button>
      </SettingRow>
    );

    const row = container.firstElementChild;
    expect(row).toHaveClass('grid-cols-1', 'sm:grid-cols-[minmax(0,1fr)_auto]');
  });

  it('uses semantic status tokens for checkbox validation states', () => {
    const { rerender } = render(<Checkbox id="terms" variant="error" label="Terms" error="Required" />);
    expect(screen.getByRole('checkbox')).toHaveClass('border-neg', 'focus:ring-neg', 'focus:border-neg');
    expect(screen.getByRole('alert')).toHaveClass('text-neg');

    rerender(<Checkbox id="terms" variant="success" label="Terms" />);
    expect(screen.getByRole('checkbox')).toHaveClass('border-pos', 'focus:ring-pos', 'focus:border-pos');
  });

  it('keeps workspace empty states flat and uses the next heading level', () => {
    const { container } = render(
      <WorkspacePlaceholderState title="No matters yet" description="Create your first matter." />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'No matters yet' })).toBeInTheDocument();
    const surface = container.querySelector('.card');
    expect(surface).not.toBeNull();
    expect(surface?.className).not.toContain('shadow-');
    expect(surface?.className).not.toContain('backdrop-blur');
  });

  it('names combobox triggers from either their visible or explicit label', () => {
    const { rerender } = render(
      <Combobox label="Matter status" value="open" options={[{ value: 'open', label: 'Open' }]} onChange={() => undefined} />
    );
    expect(screen.getByRole('combobox', { name: 'Matter status' })).toBeInTheDocument();

    rerender(
      <Combobox aria-label="Timezone" value="utc" options={[{ value: 'utc', label: 'UTC' }]} onChange={() => undefined} />
    );
    expect(screen.getByRole('combobox', { name: 'Timezone' })).toBeInTheDocument();
  });
});

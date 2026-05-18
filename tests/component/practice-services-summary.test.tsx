import { render, screen, within } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { PracticeServicesSummary } from '@/features/settings/components/PracticeServicesSummary';

describe('PracticeServicesSummary', () => {
  it('renders services as a semantic bullet list', () => {
    render(
      <PracticeServicesSummary services={['Family Law', 'Business Law']} />
    );

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('Family Law')).toBeInTheDocument();
    expect(within(list).getByText('Business Law')).toBeInTheDocument();
  });

  it('renders nothing when no services are configured', () => {
    render(<PracticeServicesSummary services={[]} />);

    expect(screen.queryByRole('list')).toBeNull();
  });
});

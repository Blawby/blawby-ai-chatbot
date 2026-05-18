import { fireEvent, render, screen } from '@testing-library/preact';
import type { ComponentType } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { NavRail, type NavRailItem } from '@/shared/ui/nav/NavRail';

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: '/practice/test',
    query: {},
  }),
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}));

vi.mock('@/shared/ui/Icon', () => ({
  Icon: ({
    icon: IconComponent,
    className,
  }: {
    icon: ComponentType<{ className?: string }>;
    className?: string;
  }) => <IconComponent className={className} />,
}));

const DummyIcon = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} />
);

const buildItems = (count: number): NavRailItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    label: `Item ${i}`,
    icon: DummyIcon,
    href: `/practice/test/item-${i}`,
  }));

describe('NavRail bottom-variant overflow', () => {
  it('renders all items when items.length <= maxItems', () => {
    render(<NavRail variant="bottom" items={buildItems(4)} maxItems={5} />);

    expect(screen.getByRole('button', { name: 'Item 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Item 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('renders maxItems - 1 items + More button when items.length > maxItems', () => {
    render(<NavRail variant="bottom" items={buildItems(10)} maxItems={5} />);

    expect(screen.getByRole('button', { name: 'Item 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Item 3' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Item 4' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('clicking More fires onOverflowClick', () => {
    const onOverflowClick = vi.fn();
    render(
      <NavRail
        variant="bottom"
        items={buildItems(10)}
        maxItems={5}
        onOverflowClick={onOverflowClick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onOverflowClick).toHaveBeenCalledTimes(1);
  });
});

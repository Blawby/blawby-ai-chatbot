import { render, screen } from '@testing-library/preact';
import type { ComponentType } from 'preact';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { NavRail, type NavRailItem } from '@/shared/ui/nav/NavRail';

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: '/practice/test/messages',
    query: {}
  })
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({
    navigate: vi.fn()
  })
}));

vi.mock('@/shared/ui/Icon', () => ({
  Icon: ({
    icon: IconComponent,
    className
  }: {
    icon: ComponentType<{ className?: string }>;
    className?: string;
  }) => <IconComponent className={className} />
}));

const DummyIcon = ({ className }: { className?: string }) => (
  <svg aria-hidden="true" className={className} />
);

const railItems: NavRailItem[] = [
  {
    id: 'messages',
    label: 'Messages',
    icon: DummyIcon,
    href: '/practice/test/messages'
  }
];

describe('AppShell surfaces', () => {
  it('removes desktop divider borders on the sidebar and inspector', () => {
    render(
      <AppShell
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        inspector={<div data-testid="inspector-content">Inspector</div>}
        main={<div>Main</div>}
      />
    );

    const sidebarWrapper = screen.getByTestId('sidebar-content').parentElement;
    const inspectorWrapper = screen.getByTestId('inspector-content').parentElement;

    expect(sidebarWrapper).not.toHaveClass('border-r');
    expect(inspectorWrapper).not.toHaveClass('border-l');
    expect(inspectorWrapper).toHaveClass('bg-surface-nav-secondary');
  });

  it('renders the sidebar in a mobile drawer when mobileSidebarOpen is true', () => {
    render(
      <AppShell
        sidebar={<div data-testid="mobile-sidebar-content">Sidebar</div>}
        mobileSidebarOpen
        main={<div>Main</div>}
      />
    );

    const drawer = screen
      .getAllByTestId('mobile-sidebar-content')
      .map((node) => node.parentElement)
      .find((node) => node?.className.includes('w-[280px]'));

    expect(drawer).toBeDefined();
    expect(drawer).not.toHaveClass('border-r');
  });

  it('keeps the desktop rail surface without a built-in divider border', () => {
    render(
      <NavRail
        items={railItems}
        activeHref="/practice/test/messages"
        variant="rail"
      />
    );

    const railContainer = screen.getByRole('button', { name: 'Messages' }).parentElement;

    expect(railContainer?.className).toContain('bg-[rgb(var(--nav-surface))]');
    expect(railContainer).not.toHaveClass('border-r');
  });
});

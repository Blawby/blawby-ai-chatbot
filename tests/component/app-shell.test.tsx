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
  it('removes desktop divider borders and uses the shared secondary surface for the inspector', () => {
    render(
      <AppShell
        sidebar={<div data-testid="sidebar-content">Sidebar</div>}
        secondarySidebar={<div data-testid="secondary-content">Secondary</div>}
        inspector={<div data-testid="inspector-content">Inspector</div>}
        main={<div>Main</div>}
      />
    );

    const sidebarWrapper = screen.getByTestId('sidebar-content').parentElement;
    const secondaryWrapper = screen.getByTestId('secondary-content').parentElement;
    const inspectorWrapper = screen.getByTestId('inspector-content').parentElement;

    expect(sidebarWrapper).not.toHaveClass('border-r');
    expect(secondaryWrapper).not.toHaveClass('border-r');
    expect(secondaryWrapper).toHaveClass('bg-surface-nav-secondary');
    expect(inspectorWrapper).not.toHaveClass('border-l');
    expect(inspectorWrapper).toHaveClass('bg-surface-nav-secondary');
  });

  it('uses the shared secondary surface for the mobile sheets without divider borders', () => {
    render(
      <AppShell
        secondarySidebar={<div data-testid="mobile-secondary-content">Secondary</div>}
        inspector={<div data-testid="mobile-inspector-content">Inspector</div>}
        mobileSecondaryNavOpen
        inspectorMobileOpen
        main={<div>Main</div>}
      />
    );

    const mobileSecondaryWrapper = screen
      .getAllByTestId('mobile-secondary-content')
      .map((node) => node.parentElement)
      .find((node) => node?.className.includes('max-w-xs'));
    const mobileInspectorWrapper = screen
      .getAllByTestId('mobile-inspector-content')
      .map((node) => node.parentElement)
      .find((node) => node?.className.includes('max-w-2xl'));

    expect(mobileSecondaryWrapper).toBeDefined();
    expect(mobileSecondaryWrapper).toHaveClass('bg-surface-nav-secondary');
    expect(mobileSecondaryWrapper).not.toHaveClass('border-r');

    expect(mobileInspectorWrapper).toBeDefined();
    expect(mobileInspectorWrapper).toHaveClass('bg-surface-nav-secondary');
    expect(mobileInspectorWrapper).not.toHaveClass('border-l');
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

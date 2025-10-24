import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../../__tests__/test-utils';
import { SidebarNavigation } from '../SidebarNavigation';
import { Cog6ToothIcon, BellIcon, UserIcon } from '@heroicons/react/24/outline';

// Mock the icons to avoid rendering issues
vi.mock('@heroicons/react/24/outline', () => ({
  Cog6ToothIcon: () => 'CogIcon',
  BellIcon: () => 'BellIcon',
  UserIcon: () => 'UserIcon',
  ChevronRightIcon: () => 'ChevronRightIcon',
}));

describe('SidebarNavigation', () => {
  const mockOnItemClick = vi.fn();
  const mockItems = [
    { id: 'general', label: 'General', icon: Cog6ToothIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon },
    { id: 'account', label: 'Account', icon: UserIcon },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render navigation items', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('should handle keyboard navigation with ArrowDown', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    generalButton.focus();

    // Press ArrowDown to move to next item
    fireEvent.keyDown(generalButton, { key: 'ArrowDown' });

    // Should focus next navigation item
    const notificationsButton = screen.getByRole('button', { name: /Notifications/i });
    expect(document.activeElement).toBe(notificationsButton);
  });

  it('should handle keyboard navigation with ArrowUp', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const notificationsButton = screen.getByRole('button', { name: /Notifications/i });
    notificationsButton.focus();

    // Press ArrowUp to move to previous item
    fireEvent.keyDown(notificationsButton, { key: 'ArrowUp' });

    // Should focus previous navigation item
    const generalButton = screen.getByRole('button', { name: /General/i });
    expect(document.activeElement).toBe(generalButton);
  });

  it('should handle Enter key to activate navigation item', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    const navElement = screen.getByRole('navigation');
    
    // Focus the button using fireEvent to ensure the onFocus handler is triggered
    fireEvent.focus(generalButton);

    // Press Enter to activate the item - fire on the nav element where the keyboard handler is attached
    fireEvent.keyDown(navElement, { key: 'Enter' });

    // Should call onItemClick with the item id
    expect(mockOnItemClick).toHaveBeenCalledWith('general');
  });

  it('should handle Space key to activate navigation item', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    const navElement = screen.getByRole('navigation');
    
    // Focus the button using fireEvent to ensure the onFocus handler is triggered
    fireEvent.focus(generalButton);

    // Press Space to activate the item - fire on the nav element where the keyboard handler is attached
    fireEvent.keyDown(navElement, { key: ' ' });

    // Should call onItemClick with the item id
    expect(mockOnItemClick).toHaveBeenCalledWith('general');
  });

  it('should handle Home key to focus first item', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const accountButton = screen.getByRole('button', { name: /Account/i });
    accountButton.focus();

    // Press Home to focus first item
    fireEvent.keyDown(accountButton, { key: 'Home' });

    // Should focus first navigation item
    const generalButton = screen.getByRole('button', { name: /General/i });
    expect(document.activeElement).toBe(generalButton);
  });

  it('should handle End key to focus last item', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    generalButton.focus();

    // Press End to focus last item
    fireEvent.keyDown(generalButton, { key: 'End' });

    // Should focus last navigation item
    const accountButton = screen.getByRole('button', { name: /Account/i });
    expect(document.activeElement).toBe(accountButton);
  });

  it('should wrap around when navigating past the end', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const accountButton = screen.getByRole('button', { name: /Account/i });
    accountButton.focus();

    // Press ArrowDown to wrap to first item
    fireEvent.keyDown(accountButton, { key: 'ArrowDown' });

    // Should focus first navigation item
    const generalButton = screen.getByRole('button', { name: /General/i });
    expect(document.activeElement).toBe(generalButton);
  });

  it('should wrap around when navigating past the beginning', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    generalButton.focus();

    // Press ArrowUp to wrap to last item
    fireEvent.keyDown(generalButton, { key: 'ArrowUp' });

    // Should focus last navigation item
    const accountButton = screen.getByRole('button', { name: /Account/i });
    expect(document.activeElement).toBe(accountButton);
  });

  it('should not handle keyboard navigation on mobile', () => {
    render(
      <SidebarNavigation
        items={mockItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
        mobile={true}
      />
    );

    const generalButton = screen.getByRole('button', { name: /General/i });
    generalButton.focus();

    // Press ArrowDown - should not change focus on mobile
    fireEvent.keyDown(generalButton, { key: 'ArrowDown' });

    // Should still be focused on the same item
    expect(document.activeElement).toBe(generalButton);
  });

  it('should handle action items with onClick', () => {
    const mockOnClick = vi.fn();
    const actionItems = [
      { id: 'general', label: 'General', icon: Cog6ToothIcon },
      { id: 'signout', label: 'Sign Out', icon: UserIcon, isAction: true, onClick: mockOnClick },
    ];

    render(
      <SidebarNavigation
        items={actionItems}
        onItemClick={mockOnItemClick}
        activeItem="general"
      />
    );

    const signOutButton = screen.getByRole('button', { name: /Sign Out/i });
    const navElement = screen.getByRole('navigation');
    
    // Focus the button using fireEvent to ensure the onFocus handler is triggered
    fireEvent.focus(signOutButton);

    // Press Enter to activate the action item - fire on the nav element where the keyboard handler is attached
    fireEvent.keyDown(navElement, { key: 'Enter' });

    // Should call the action's onClick instead of onItemClick
    expect(mockOnClick).toHaveBeenCalled();
    expect(mockOnItemClick).not.toHaveBeenCalled();
  });
});

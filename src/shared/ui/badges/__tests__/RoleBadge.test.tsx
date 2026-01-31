import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { RoleBadge } from '../RoleBadge';

describe('RoleBadge', () => {
  it('should render owner role with correct styling', () => {
    render(<RoleBadge roleType="owner" />);
    
    const badge = screen.getByText('Owner');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-accent-500', 'text-gray-900');
  });

  it('should render admin role with correct styling', () => {
    render(<RoleBadge roleType="admin" />);
    
    const badge = screen.getByText('Lawyer');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary-500', 'text-white');
  });

  it('should render member role with correct styling', () => {
    render(<RoleBadge roleType="member" />);
    
    const badge = screen.getByText('Client');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-emerald-500', 'text-white');
  });

  it('should apply custom className when provided', () => {
    render(<RoleBadge roleType="owner" className="custom-class" />);
    
    const badge = screen.getByText('Owner');
    expect(badge).toHaveClass('custom-class');
  });

  it('should have consistent base classes for all roles', () => {
    const roles = ['owner', 'admin', 'member'] as const;
    
    roles.forEach(role => {
      const { unmount } = render(<RoleBadge roleType={role} />);
      const label = role === 'admin' ? 'Lawyer' : role === 'member' ? 'Client' : 'Owner';
      const badge = screen.getByText(label);
      
      expect(badge).toHaveClass(
        'px-2',
        'py-1',
        'text-xs',
        'font-medium',
        'rounded'
      );
      
      unmount();
    });
  });
});

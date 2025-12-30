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
    
    const badge = screen.getByText('Admin');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-primary-500', 'text-white');
  });

  it('should render attorney role with correct styling', () => {
    render(<RoleBadge roleType="attorney" />);
    
    const badge = screen.getByText('Attorney');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-500', 'text-white');
  });

  it('should render paralegal role with correct styling', () => {
    render(<RoleBadge roleType="paralegal" />);
    
    const badge = screen.getByText('Paralegal');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-500', 'text-white');
  });

  it('should handle unknown role gracefully', () => {
    // @ts-expect-error Testing unknown role
    render(<RoleBadge roleType="unknown" />);
    
    const badge = screen.getByText('Unknown');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('px-2', 'py-1', 'text-xs', 'font-medium', 'rounded');
  });

  it('should apply custom className when provided', () => {
    render(<RoleBadge roleType="owner" className="custom-class" />);
    
    const badge = screen.getByText('Owner');
    expect(badge).toHaveClass('custom-class');
  });

  it('should have consistent base classes for all roles', () => {
    const roles = ['owner', 'admin', 'attorney', 'paralegal'] as const;
    
    roles.forEach(role => {
      const { unmount } = render(<RoleBadge roleType={role} />);
      const badge = screen.getByText(role.charAt(0).toUpperCase() + role.slice(1));
      
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

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/preact';
import { StatusBadge } from '../StatusBadge';

describe('StatusBadge', () => {
  it('should render active status with correct styling', () => {
    render(<StatusBadge status="active" />);
    
    const badge = screen.getByText('Active');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-green-100', 'text-green-800', 'dark:bg-green-900', 'dark:text-green-200');
  });

  it('should render pending status with correct styling', () => {
    render(<StatusBadge status="pending" />);
    
    const badge = screen.getByText('Pending');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-yellow-100', 'text-yellow-800', 'dark:bg-yellow-900', 'dark:text-yellow-200');
  });

  it('should render inactive status with correct styling', () => {
    render(<StatusBadge status="inactive" />);
    
    const badge = screen.getByText('Inactive');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800', 'dark:bg-gray-700', 'dark:text-gray-200');
  });

  it('should render suspended status with correct styling', () => {
    render(<StatusBadge status="suspended" />);
    
    const badge = screen.getByText('Suspended');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100', 'text-red-800', 'dark:bg-red-900', 'dark:text-red-200');
  });

  it('should render cancelled status with correct styling', () => {
    render(<StatusBadge status="cancelled" />);
    
    const badge = screen.getByText('Cancelled');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-red-100', 'text-red-800', 'dark:bg-red-900', 'dark:text-red-200');
  });

  it('should render completed status with correct styling', () => {
    render(<StatusBadge status="completed" />);
    
    const badge = screen.getByText('Completed');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-blue-100', 'text-blue-800', 'dark:bg-blue-900', 'dark:text-blue-200');
  });

  it('should apply custom className when provided', () => {
    render(<StatusBadge status="active" className="custom-class" />);
    
    const badge = screen.getByText('Active');
    expect(badge).toHaveClass('custom-class');
  });

  it('should have consistent base classes for all statuses', () => {
    const statuses = ['active', 'pending', 'inactive', 'suspended', 'cancelled', 'completed'] as const;
    
    statuses.forEach(status => {
      const { unmount } = render(<StatusBadge status={status} />);
      const badge = screen.getByText(status.charAt(0).toUpperCase() + status.slice(1));
      
      expect(badge).toHaveClass(
        'inline-flex',
        'items-center',
        'px-2.5',
        'py-0.5',
        'rounded-full',
        'text-xs',
        'font-medium'
      );
      
      unmount();
    });
  });

  it('should handle unknown status gracefully', () => {
    // @ts-expect-error Testing unknown status
    render(<StatusBadge status="unknown" />);
    
    const badge = screen.getByText('Unknown');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-gray-100', 'text-gray-800', 'dark:bg-gray-700', 'dark:text-gray-200');
  });
});

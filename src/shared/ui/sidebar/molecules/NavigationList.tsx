/**
 * NavigationList - Molecule Component
 * 
 * Container for navigation items with proper spacing and layout.
 * Handles the list structure and gap between items.
 */

import type { ComponentChildren } from 'preact';

interface NavigationListProps {
  children: ComponentChildren;
  className?: string;
}

export const NavigationList = ({ 
  children, 
  className = ''
}: NavigationListProps) => {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {children}
    </div>
  );
};

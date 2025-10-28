/**
 * CollapsibleToggle - Atom Component
 * 
 * Pure toggle button for sidebar collapse/expand functionality.
 * No state management, just renders the button with proper styling.
 */

import { Button } from '../../Button';
import type { ComponentChildren } from 'preact';

interface CollapsibleToggleProps {
  icon: ComponentChildren;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}

export const CollapsibleToggle = ({ 
  icon, 
  onClick, 
  ariaLabel,
  className = ''
}: CollapsibleToggleProps) => {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      icon={icon}
      aria-label={ariaLabel}
      className={`w-8 h-8 p-0 ${className}`}
    />
  );
};

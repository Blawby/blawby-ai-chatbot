import { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DropdownMenuItemProps {
  children: ComponentChildren;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}

export const DropdownMenuItem = ({
  children,
  onSelect,
  disabled = false,
  className = ''
}: DropdownMenuItemProps) => {
  const handleClick = () => {
    if (!disabled && onSelect) {
      onSelect();
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'w-full text-left px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100',
        'hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
};

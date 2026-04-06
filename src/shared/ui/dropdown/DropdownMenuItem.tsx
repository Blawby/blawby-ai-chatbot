import { ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { DropdownContext } from './DropdownMenu';

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
  const context = useContext(DropdownContext);

  const handleClick = () => {
    if (!disabled && onSelect) {
      onSelect();
    }

    if (!disabled) {
      context?.handleOpenChange(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        'w-full text-left px-2 py-1.5 text-sm text-input-text',
        'hover:bg-white/[0.04] focus:outline-none focus:bg-white/[0.08]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
};

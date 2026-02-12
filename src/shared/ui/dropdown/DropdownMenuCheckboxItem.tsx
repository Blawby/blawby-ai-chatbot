import { ComponentChildren, JSX } from 'preact';
import { cn } from '@/shared/utils/cn';
import { Switch } from '../input/Switch';

export interface DropdownMenuCheckboxItemProps {
  children: ComponentChildren;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export const DropdownMenuCheckboxItem = ({
  children,
  checked,
  onCheckedChange,
  disabled = false,
  className = ''
}: DropdownMenuCheckboxItemProps) => {
  const handleClick = (event: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    // Prevent double toggle when clicking the switch
    const target = event.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }
    
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  const handleKeyDown = (event: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCheckedChange(!checked);
    }
  };

  return (
    <div 
      className={cn(
        'flex items-center justify-between px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100',
        'hover:bg-surface-card/70',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-accent-500/50',
        'dark:focus-visible:ring-accent-400/40',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <span className="flex-1">{children}</span>
      <div className="ml-2">
        <Switch
          value={checked}
          onChange={onCheckedChange}
          disabled={disabled}
          size="sm"
        />
      </div>
    </div>
  );
};

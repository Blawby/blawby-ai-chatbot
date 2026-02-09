import type { ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';
import { cn } from '@/shared/utils/cn';

export interface SettingsDangerButtonProps {
  children: ComponentChildren;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'icon';
  'data-testid'?: string;
}

export const SettingsDangerButton = ({
  children,
  className = '',
  disabled,
  onClick,
  size = 'sm',
  'data-testid': dataTestId
}: SettingsDangerButtonProps) => {
  return (
    <Button
      variant="primary"
      size={size}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={cn('bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700 focus:ring-red-500', className)}
    >
      {children}
    </Button>
  );
};

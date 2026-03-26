import type { ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';

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
  className,
  disabled,
  onClick,
  size = 'sm',
  'data-testid': dataTestId
}: SettingsDangerButtonProps) => {
  return (
    <Button
      variant="danger"
      size={size}
      onClick={onClick}
      disabled={disabled}
      data-testid={dataTestId}
      className={className}
    >
      {children}
    </Button>
  );
};

import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingsCardProps {
  children: ComponentChildren;
  className?: string;
}

export const SettingsCard = ({
  children,
  className = '',
}: SettingsCardProps) => (
  <div
    className={cn(
      'rounded-[18px] border border-rule bg-card px-5 py-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:px-6',
      className,
    )}
  >
    {children}
  </div>
);

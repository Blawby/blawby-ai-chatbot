import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  label?: ComponentChildren;
  variant?: 'default' | 'subtle' | 'strong';
  className?: string;
}

export function Divider({
  orientation = 'horizontal',
  label,
  variant = 'default',
  className,
}: DividerProps) {
  const variantClasses = {
    default: 'border-line-glass/30',
    subtle: 'border-line-glass/15',
    strong: 'border-line-glass/40',
  };

  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn('self-stretch border-l', variantClasses[variant], className)}
      />
    );
  }

  if (label) {
    return (
      <div
        role="separator"
        className={cn('flex items-center gap-3', className)}
      >
        <div className={cn('flex-1 border-t', variantClasses[variant])} />
        <span className="text-xs text-input-placeholder shrink-0">{label}</span>
        <div className={cn('flex-1 border-t', variantClasses[variant])} />
      </div>
    );
  }

  return (
    <div
      role="separator"
      className={cn('border-t', variantClasses[variant], className)}
    />
  );
}

import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export interface SettingRowProps {
  label: string;
  labelClassName?: string;
  labelNode?: ComponentChildren;
  description?: string | ComponentChildren;
  children?: ComponentChildren;
  className?: string;
  controlClassName?: string;
  /** @deprecated use default grid layout */
  layout?: 'responsive' | 'stacked';
}

export const SettingRow = ({
  label,
  labelClassName = '',
  labelNode,
  description,
  children,
  className = '',
  controlClassName,
}: SettingRowProps) => (
  <div
    className={cn(
      'grid grid-cols-1 items-center gap-4 border-b border-rule py-[18px] last:border-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-7',
      className,
    )}
  >
    <div className="flex min-w-0 flex-col gap-1">
      {labelNode ?? (
        <span className={cn('text-sm font-medium text-ink', labelClassName)}>{label}</span>
      )}
      {description && (
        typeof description === 'string' ? (
          <span className="text-[13px] text-dim leading-relaxed max-w-[64ch]">{description}</span>
        ) : (
          <div className="text-[13px] text-dim leading-relaxed">{description}</div>
        )
      )}
    </div>
    {children != null && (
      <div className={cn('flex min-w-0 items-center gap-2 sm:shrink-0', controlClassName)}>
        {children}
      </div>
    )}
  </div>
);

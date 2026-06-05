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
      'grid items-center gap-7 py-[18px] border-b border-rule last:border-0',
      className,
    )}
    style={{ gridTemplateColumns: '1fr auto' }}
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
      <div className={cn('flex items-center gap-2 shrink-0', controlClassName)}>
        {children}
      </div>
    )}
  </div>
);

import { cn } from '@/shared/utils/cn';

export type BarTone = 'default' | 'ok' | 'warn';

export interface BarProps {
  value: number;
  max?: number;
  tone?: BarTone;
  className?: string;
  label?: string;
}

export function Bar({ value, max = 100, tone = 'default', className, label }: BarProps) {
  const safeMax = max > 0 ? max : 100;
  const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));
  const toneClass = tone !== 'default' ? tone : null;

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={label}
      className={cn('bar', toneClass, className)}
    >
      <i style={{ width: `${percent}%` }} />
    </div>
  );
}

import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

interface DetailRowProps {
  label: string;
  value: ComponentChildren;
  /** Rendered when value is null/undefined/empty string. Defaults to "Not set". */
  emptyText?: string;
  className?: string;
}

const isEmpty = (value: ComponentChildren): boolean => {
  if (value == null || value === false) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

export const DetailRow = ({ label, value, emptyText = 'Not set', className }: DetailRowProps) => {
  const empty = isEmpty(value);
  return (
    <div className={cn('flex items-center justify-between gap-3 text-sm', className)}>
      <span className="text-input-placeholder">{label}</span>
      <span className={cn('text-right', empty ? 'text-input-placeholder' : 'text-input-text')}>
        {empty ? emptyText : value}
      </span>
    </div>
  );
};

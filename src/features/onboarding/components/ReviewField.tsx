/**
 * ReviewField - Molecule Component
 * 
 * Label + value display for review sections.
 * Handles review field layout and styling.
 */

import { cn } from '@/shared/utils/cn';

interface ReviewFieldProps {
  label: string;
  value: string | null | undefined;
  className?: string;
}

export const ReviewField = ({
  label,
  value,
  className = ''
}: ReviewFieldProps) => {
  const displayValue = value || '—';
  
  return (
    <div className={cn(
      'flex justify-between py-2 border-b border-gray-100 dark:border-white/10 last:border-b-0',
      className
    )}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white text-right">
        {displayValue}
      </span>
    </div>
  );
};

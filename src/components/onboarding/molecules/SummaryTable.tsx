import type { ComponentChildren } from 'preact';
import { cn } from '../../../utils/cn';

interface SummaryRow {
  label: string;
  value: ComponentChildren;
}

interface SummaryTableProps {
  rows: SummaryRow[];
  className?: string;
}

export const SummaryTable = ({ rows, className = '' }: SummaryTableProps) => {
  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-white/10 overflow-hidden', className)}>
      <dl className="divide-y divide-gray-200 dark:divide-white/10">
        {rows.map((row, idx) => (
          <div key={`${row.label}-${idx}`} className="grid grid-cols-3 gap-4 px-4 py-3 sm:px-6">
            <dt className="col-span-1 text-sm font-medium text-gray-700 dark:text-gray-300">{row.label}</dt>
            <dd className="col-span-2 text-sm text-gray-900 dark:text-white break-words">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

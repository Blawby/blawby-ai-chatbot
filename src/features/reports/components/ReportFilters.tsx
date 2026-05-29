import type { FunctionComponent } from 'preact';
import { DatePicker } from '@/shared/ui/input/DatePicker';
import { Input } from '@/shared/ui/input/Input';
import { Seg } from '@/design-system/patterns';
import { cn } from '@/shared/utils/cn';
import type { FilterSpec } from '@/features/reports/config/reportCollection';

export type ReportPeriod = 'month' | 'quarter' | 'year';

export interface ReportFilterValues {
  period?: ReportPeriod;
  start?: string;
  end?: string;
  hourlyRate?: number;
  [key: string]: string | number | undefined;
}

interface ReportFiltersProps {
  filters: FilterSpec[];
  values: ReportFilterValues;
  onChange: (next: ReportFilterValues) => void;
  className?: string;
}

const PERIOD_OPTIONS: ReadonlyArray<{ value: ReportPeriod; label: string }> = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
];

export const ReportFilters: FunctionComponent<ReportFiltersProps> = ({ filters, values, onChange, className }) => {
  const set = (id: string, value: string | number | undefined) => {
    onChange({ ...values, [id]: value });
  };
  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      {filters.map((f) => {
        if (f.kind === 'period') {
          const current = (values.period ?? f.defaultValue ?? 'month') as ReportPeriod;
          return (
            <div key={f.id} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink">{f.label}</label>
              <Seg<ReportPeriod>
                value={current}
                options={PERIOD_OPTIONS}
                ariaLabel={f.label}
                onChange={(value) => set('period', value)}
              />
            </div>
          );
        }
        if (f.kind === 'date-range') {
          return (
            <div key={f.id} className="flex items-end gap-2">
              <DatePicker
                label="Start"
                value={(values.start as string | undefined) ?? ''}
                onChange={(v) => set('start', v || undefined)}
                format="date"
              />
              <DatePicker
                label="End"
                value={(values.end as string | undefined) ?? ''}
                onChange={(v) => set('end', v || undefined)}
                format="date"
              />
            </div>
          );
        }
        if (f.kind === 'select') {
          const current = ((values[f.id] as string | undefined) ?? f.defaultValue ?? '');
          return (
            <div key={f.id} className="flex flex-col gap-1">
              <label className="text-xs font-medium text-ink">{f.label}</label>
              <select
                value={current}
                onChange={(e) => set(f.id, (e.currentTarget as HTMLSelectElement).value)}
                className="h-9 rounded-md border border-line-subtle bg-paper-2/5 px-2 text-sm text-ink"
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          );
        }
        if (f.kind === 'number') {
          return (
            <Input
              key={f.id}
              label={f.label}
              type="number"
              min={f.min}
              max={f.max}
              placeholder={f.placeholder}
              value={(values[f.id] as number | undefined)?.toString() ?? ''}
              onChange={(v) => set(f.id, v === '' ? undefined : Number(v))}
            />
          );
        }
        return (
          <Input
            key={f.id}
            label={f.label}
            placeholder={f.placeholder}
            value={(values[f.id] as string | undefined) ?? ''}
            onChange={(v) => set(f.id, v || undefined)}
          />
        );
      })}
    </div>
  );
};

export default ReportFilters;

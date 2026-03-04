import type { FunctionComponent } from 'preact';
import { Input } from '@/shared/ui/input';
import { Button } from '@/shared/ui/Button';

export interface InvoiceFilterValue {
  status: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

interface InvoiceFiltersProps {
  value: InvoiceFilterValue;
  onChange: (next: InvoiceFilterValue) => void;
  onReset: () => void;
  showStatus?: boolean;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'void', label: 'Void' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const InvoiceFilters: FunctionComponent<InvoiceFiltersProps> = ({ value, onChange, onReset, showStatus = true }) => {
  const statusFilterId = 'invoice-status-filter';
  return (
    <div className="glass-panel p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {showStatus ? (
          <div>
            <label htmlFor={statusFilterId} className="mb-1 block text-xs font-semibold text-input-text">Status</label>
            <select
              id={statusFilterId}
              className="w-full rounded-lg border border-input-border bg-transparent px-3 py-2 text-sm text-input-text"
              value={value.status}
              onChange={(event) => onChange({ ...value, status: event.currentTarget.value })}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value || 'all'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Input
          type="date"
          label="From"
          value={value.dateFrom}
          onChange={(next) => onChange({ ...value, dateFrom: next })}
        />
        <Input
          type="date"
          label="To"
          value={value.dateTo}
          onChange={(next) => onChange({ ...value, dateTo: next })}
        />
        <Input
          type="search"
          label="Search"
          placeholder="Invoice number, client, matter"
          value={value.search}
          onChange={(next) => onChange({ ...value, search: next })}
        />
        <div className="flex items-end">
          <Button variant="secondary" className="w-full" onClick={onReset}>Reset filters</Button>
        </div>
      </div>
    </div>
  );
};

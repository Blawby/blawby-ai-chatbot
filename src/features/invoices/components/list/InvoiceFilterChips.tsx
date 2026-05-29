import { useState } from 'preact/hooks';
import { ChevronDown, Download } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { CurrencyInput, Input } from '@/shared/ui/input';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { ColumnEditor, type ColumnEditorOption } from '@/shared/ui/table';
import {
  DEFAULT_INVOICE_COLUMN_DEFS,
  OPTIONAL_INVOICE_COLUMNS,
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';

const PRACTICE_COLUMN_OPTIONS: ColumnEditorOption[] = [
  ...DEFAULT_INVOICE_COLUMN_DEFS.map((column) => ({ ...column, fixed: true })),
  ...OPTIONAL_INVOICE_COLUMNS,
];

export interface InvoiceListFilterState {
  createdFrom?: string;
  createdTo?: string;
  dueFrom?: string;
  dueTo?: string;
  totalMin?: number;
  totalMax?: number;
}

interface InvoiceFilterChipsProps {
  filters: InvoiceListFilterState;
  onChange: (next: InvoiceListFilterState) => void;
  visibleOptionalColumns: InvoiceColumnKey[];
  onVisibleColumnsChange: (next: InvoiceColumnKey[]) => void;
}


const Chip = ({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: preact.ComponentChildren;
  onClick?: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? 'border-accent-foreground/50 bg-accent-foreground/10 text-[rgb(var(--accent-foreground))]'
        : 'border-line-subtle bg-surface-utility/30 text-dim-2 hover:text-ink'
    }`}
  >
    {children}
    <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
  </button>
);

const ChipLabel = ({ label, value }: { label: string; value?: string }) => (
  <span>
    {label}
    {value ? <span className="ml-1 text-ink">{value}</span> : null}
  </span>
);

export const InvoiceFilterChips = ({
  filters,
  onChange,
  visibleOptionalColumns,
  onVisibleColumnsChange,
}: InvoiceFilterChipsProps) => {
  const { showInfo } = useToastContext();
  const [dateOpen, setDateOpen] = useState<null | 'created' | 'due'>(null);
  const [totalOpen, setTotalOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(filters);

  const openDialog = (dialog: 'created' | 'due' | 'total') => {
    setDraftFilters(filters);
    if (dialog === 'total') setTotalOpen(true);
    else setDateOpen(dialog);
  };

  const applyDateRange = () => {
    onChange(draftFilters);
    setDateOpen(null);
  };

  const applyTotal = () => {
    onChange(draftFilters);
    setTotalOpen(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        active={Boolean(filters.createdFrom || filters.createdTo)}
        onClick={() => openDialog('created')}
      >
        <ChipLabel label="Created" />
      </Chip>

      <Chip
        active={Boolean(filters.dueFrom || filters.dueTo)}
        onClick={() => openDialog('due')}
      >
        <ChipLabel label="Due date" />
      </Chip>

      <Chip
        active={filters.totalMin !== undefined || filters.totalMax !== undefined}
        onClick={() => openDialog('total')}
      >
        <ChipLabel label="Total" />
      </Chip>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          iconClassName="h-4 w-4"
          onClick={() => showInfo('Export', 'Invoice export is coming soon.')}
          disabled
        >
          Export
        </Button>
        <ColumnEditor
          options={PRACTICE_COLUMN_OPTIONS}
          visible={visibleOptionalColumns}
          onChange={(next) => onVisibleColumnsChange(next as InvoiceColumnKey[])}
        />
      </div>

      <Dialog
        isOpen={dateOpen !== null}
        onClose={() => setDateOpen(null)}
        title={dateOpen === 'created' ? 'Filter by created date' : 'Filter by due date'}
        contentClassName="max-w-md"
      >
        <DialogBody className="space-y-3">
          <Input
            type="date"
            label="From"
            value={dateOpen === 'created' ? draftFilters.createdFrom ?? '' : draftFilters.dueFrom ?? ''}
            onChange={(value) => setDraftFilters((prev) => ({
              ...prev,
              ...(dateOpen === 'created' ? { createdFrom: value === '' ? undefined : value } : { dueFrom: value === '' ? undefined : value }),
            }))}
          />
          <Input
            type="date"
            label="To"
            value={dateOpen === 'created' ? draftFilters.createdTo ?? '' : draftFilters.dueTo ?? ''}
            onChange={(value) => setDraftFilters((prev) => ({
              ...prev,
              ...(dateOpen === 'created' ? { createdTo: value === '' ? undefined : value } : { dueTo: value === '' ? undefined : value }),
            }))}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              if (dateOpen === 'created') {
                onChange({ ...filters, createdFrom: undefined, createdTo: undefined });
              } else {
                onChange({ ...filters, dueFrom: undefined, dueTo: undefined });
              }
              setDateOpen(null);
            }}
          >
            Clear
          </Button>
          <Button onClick={applyDateRange}>Apply</Button>
        </DialogFooter>
      </Dialog>

      <Dialog
        isOpen={totalOpen}
        onClose={() => setTotalOpen(false)}
        title="Filter by total"
        contentClassName="max-w-md"
      >
        <DialogBody className="space-y-3">
          <CurrencyInput
            label="Minimum"
            value={draftFilters.totalMin}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, totalMin: value }))}
          />
          <CurrencyInput
            label="Maximum"
            value={draftFilters.totalMax}
            onChange={(value) => setDraftFilters((prev) => ({ ...prev, totalMax: value }))}
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onChange({ ...filters, totalMin: undefined, totalMax: undefined });
              setTotalOpen(false);
            }}
          >
            Clear
          </Button>
          <Button onClick={applyTotal}>Apply</Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

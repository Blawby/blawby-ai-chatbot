import type { FunctionComponent } from 'preact';
import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown';
import {
  OPTIONAL_INVOICE_COLUMNS,
  type InvoiceColumnKey,
} from '@/features/invoices/config/invoiceCollection';

interface InvoiceColumnsMenuProps {
  visibleColumns: InvoiceColumnKey[];
  onChange: (next: InvoiceColumnKey[]) => void;
}

export const InvoiceColumnsMenu: FunctionComponent<InvoiceColumnsMenuProps> = ({
  visibleColumns,
  onChange,
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm">
        <AdjustmentsHorizontalIcon className="h-4 w-4" />
        Edit columns
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-72 p-2">
      {OPTIONAL_INVOICE_COLUMNS.map((column) => {
        const checked = visibleColumns.includes(column.key);
        return (
          <DropdownMenuCheckboxItem
            key={column.key}
            checked={checked}
            onCheckedChange={(nextChecked) => {
              if (nextChecked) {
                onChange([...visibleColumns, column.key]);
                return;
              }
              onChange(visibleColumns.filter((key) => key !== column.key));
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        );
      })}
    </DropdownMenuContent>
  </DropdownMenu>
);

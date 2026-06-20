import type { FunctionComponent, ComponentChildren } from 'preact';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
import type { ColumnKind, ColumnSpec } from '@/features/reports/config/reportCollection';
import { formatReportValue } from '@/features/reports/utils/formatReportValue';

interface ReportDataTableProps {
  columns: ColumnSpec[];
  rows: Record<string, unknown>[];
  loading?: boolean;
  emptyState?: ComponentChildren;
}

const formatValue = (kind: ColumnKind, value: unknown): ComponentChildren => {
  return formatReportValue(kind, value);
};

const toDataTableColumns = (columns: ColumnSpec[]): DataTableColumn[] =>
  columns.map((col) => ({
    id: col.key,
    label: col.label,
    align: col.align,
    hideAt: col.hideAt,
    isPrimary: col.isPrimary,
  }));

const toDataTableRows = (rows: Record<string, unknown>[], columns: ColumnSpec[]): DataTableRow[] =>
  rows.map((row, idx) => ({
    id: typeof row.id === 'string' ? row.id : String(idx),
    cells: Object.fromEntries(
      columns.map((col) => [col.key, formatValue(col.kind, row[col.key])])
    ),
  }));

export const ReportDataTable: FunctionComponent<ReportDataTableProps> = ({
  columns,
  rows,
  loading,
  emptyState,
}) => (
  <DataTable
    columns={toDataTableColumns(columns)}
    rows={toDataTableRows(rows, columns)}
    loading={loading}
    density="compact"
    stickyHeader
    className="panel overflow-hidden"
    bodyClassName="bg-transparent"
    emptyState={emptyState ?? <span className="text-sm text-dim-2">No report rows found.</span>}
  />
);

export default ReportDataTable;

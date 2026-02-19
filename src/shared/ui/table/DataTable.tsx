import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';

export type DataTableColumn = {
  id: string;
  label: ComponentChildren;
  align?: 'left' | 'center' | 'right';
  hideAt?: 'sm' | 'md' | 'lg';
  isPrimary?: boolean;
  isAction?: boolean;
  headerClassName?: string;
  cellClassName?: string;
  mobileClassName?: string;
};

export type DataTableRow = {
  id: string;
  cells: Record<string, ComponentChildren>;
  onClick?: () => void;
  className?: string;
  isPlaceholder?: boolean;
};

interface DataTableProps {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  emptyState?: ComponentChildren;
  className?: string;
  minRows?: number;
}

const ALIGN_CLASS: Record<NonNullable<DataTableColumn['align']>, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right'
};

const HIDE_CLASSES: Record<NonNullable<DataTableColumn['hideAt']>, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell'
};

const MOBILE_HIDE_CLASSES: Record<NonNullable<DataTableColumn['hideAt']>, string> = {
  sm: 'sm:hidden',
  md: 'md:hidden',
  lg: 'lg:hidden'
};

const hideClass = (hideAt?: DataTableColumn['hideAt']) =>
  hideAt ? HIDE_CLASSES[hideAt] : '';

const mobileHideClass = (hideAt?: DataTableColumn['hideAt']) =>
  hideAt ? MOBILE_HIDE_CLASSES[hideAt] : '';

const breakpointRank: Record<NonNullable<DataTableColumn['hideAt']>, number> = {
  sm: 1,
  md: 2,
  lg: 3
};

const resolveStackedHideAt = (columns: DataTableColumn[]) => {
  const visibleBreakpoints = columns
    .map((column) => column.hideAt)
    .filter((value): value is NonNullable<DataTableColumn['hideAt']> => Boolean(value));
  if (visibleBreakpoints.length === 0) return undefined;
  return visibleBreakpoints.reduce((max, current) =>
    breakpointRank[current] > breakpointRank[max] ? current : max
  );
};

export const DataTable = ({ columns, rows, emptyState, className = '', minRows }: DataTableProps) => {
  const primaryColumn = columns.find((column) => column.isPrimary) ?? columns[0];
  const mobileColumns = columns.filter((column) => column.id !== primaryColumn?.id && column.hideAt);
  const stackedHideAt = resolveStackedHideAt(mobileColumns);
  const paddedRows = (() => {
    if (!minRows || rows.length === 0 || rows.length >= minRows) return rows;
    const placeholders: DataTableRow[] = Array.from({ length: minRows - rows.length }, (_, index) => ({
      id: `__empty-${index}`,
      cells: {},
      isPlaceholder: true
    }));
    return [...rows, ...placeholders];
  })();

  return (
    <div className={cn('relative overflow-x-auto overflow-y-visible', className)}>
      <table className="min-w-full divide-y divide-gray-300 dark:divide-white/15">
        <thead>
          <tr>
            {columns.map((column, index) => {
              const isPrimary = column.id === primaryColumn?.id || (index === 0 && !primaryColumn);
              const baseHeaderClass = isPrimary
                ? 'py-3.5 pr-3 pl-4 text-left text-sm font-semibold text-input-text sm:pl-0'
                : 'px-3 py-3.5 text-left text-sm font-semibold text-input-text';
              return (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    baseHeaderClass,
                    ALIGN_CLASS[column.align ?? 'left'],
                    hideClass(column.hideAt),
                    column.headerClassName
                  )}
                >
                  {column.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-default bg-surface-base">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                {emptyState ?? 'No results'}
              </td>
            </tr>
          ) : (
            paddedRows.map((row) => {
              const isClickable = Boolean(row.onClick) && !row.isPlaceholder;
              return (
                <tr
                  key={row.id}
                  className={cn(
                    'h-20',
                    isClickable && 'cursor-pointer hover:bg-surface-glass/50 dark:hover:bg-white/[0.04]',
                    row.className
                  )}
                >
                  {columns.map((column, index) => {
                    const isPrimary = column.id === primaryColumn?.id || (index === 0 && !primaryColumn);
                  const baseCellClass = isPrimary
                    ? 'w-full max-w-0 py-3 pr-3 pl-4 text-sm font-medium text-input-text sm:w-auto sm:max-w-none sm:pl-0'
                    : 'px-3 py-3 text-sm text-gray-500 dark:text-gray-400';
                    const cellContent = row.isPlaceholder
                      ? '\u00A0'
                      : (row.cells[column.id] ?? '—');

                    return (
                      <td
                        key={`${row.id}-${column.id}`}
                        className={cn(
                          baseCellClass,
                          ALIGN_CLASS[column.align ?? 'left'],
                          hideClass(column.hideAt),
                          column.cellClassName
                        )}
                      >
                        {isClickable && !column.isAction ? (
                          <button type="button" onClick={row.onClick} className={cn('w-full', ALIGN_CLASS[column.align ?? 'left'])}>
                            {cellContent}
                            {isPrimary && mobileColumns.length > 0 && (
                              <dl
                                className={cn(
                                  'font-normal',
                                  stackedHideAt ? MOBILE_HIDE_CLASSES[stackedHideAt] : ''
                                )}
                              >
                                {mobileColumns.map((mobileColumn) => (
                                  <div
                                    key={`${row.id}-${mobileColumn.id}-mobile`}
                                    className={mobileHideClass(mobileColumn.hideAt)}
                                  >
                                    <dt className="sr-only">{mobileColumn.label}</dt>
                                    <dd
                                      className={cn(
                                        'mt-1 truncate text-gray-700 dark:text-gray-300',
                                        mobileColumn.mobileClassName
                                      )}
                                    >
                                      {row.cells[mobileColumn.id] ?? '—'}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </button>
                        ) : (
                          <>
                            {cellContent}
                            {isPrimary && mobileColumns.length > 0 && !row.isPlaceholder && (
                              <dl
                                className={cn(
                                  'font-normal',
                                  stackedHideAt ? MOBILE_HIDE_CLASSES[stackedHideAt] : ''
                                )}
                              >
                                {mobileColumns.map((mobileColumn) => (
                                  <div
                                    key={`${row.id}-${mobileColumn.id}-mobile`}
                                    className={mobileHideClass(mobileColumn.hideAt)}
                                  >
                                    <dt className="sr-only">{mobileColumn.label}</dt>
                                    <dd
                                      className={cn(
                                        'mt-1 truncate text-gray-700 dark:text-gray-300',
                                        mobileColumn.mobileClassName
                                      )}
                                    >
                                      {row.cells[mobileColumn.id] ?? '—'}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            )}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};

import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { LoadingBlock } from '@/shared/ui/layout/LoadingBlock';

export type DataTableColumn = {
  id: string;
  label: ComponentChildren;
  align?: 'left' | 'center' | 'right';
  hideAt?: 'sm' | 'md' | 'lg';
  isPrimary?: boolean;
  isAction?: boolean;
  disableCellWrap?: boolean;
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
  errorState?: ComponentChildren;
  className?: string;
  minRows?: number;
  caption?: ComponentChildren;
  toolbar?: ComponentChildren;
  tableClassName?: string;
  bodyClassName?: string;
  rowClassName?: string;
  stickyHeader?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  density?: 'regular' | 'compact';
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

export const DataTable = ({
  columns,
  rows,
  emptyState,
  errorState,
  className = '',
  minRows,
  caption,
  toolbar,
  tableClassName = '',
  bodyClassName = '',
  rowClassName = '',
  stickyHeader = false,
  loading = false,
  loadingLabel,
  density = 'regular',
}: DataTableProps) => {
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

  const renderStackedDetails = (row: DataTableRow) => {
    if (mobileColumns.length === 0 || row.isPlaceholder) return null;

    return (
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
                'mt-1 truncate text-input-text',
                mobileColumn.mobileClassName
              )}
            >
              {row.cells[mobileColumn.id] ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
    );
  };

  const renderDesktopTable = (tableWrapperClassName: string) => (
    <div className={tableWrapperClassName}>
      <table className={cn('min-w-full', tableClassName)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className={cn(stickyHeader && 'sticky top-0 z-10 bg-surface-base')}>
            {columns.map((column, index) => {
              const isPrimary = column.id === primaryColumn?.id || (index === 0 && !primaryColumn);
              const baseHeaderClass = isPrimary
                ? cn(
                  'text-left text-sm font-semibold text-input-text sm:pl-0',
                  density === 'compact' ? 'py-2.5 pr-3 pl-4' : 'py-3.5 pr-3 pl-4'
                )
                : cn(
                  'text-left text-sm font-semibold text-input-text',
                  density === 'compact' ? 'px-3 py-2.5' : 'px-3 py-3.5'
                );

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
        <tbody className={cn('bg-surface-base', bodyClassName)}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-sm text-input-placeholder">
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
                    density === 'compact' ? 'h-14' : 'h-20',
                    isClickable && 'cursor-pointer hover:bg-surface-glass/50 dark:hover:bg-white/[0.04]',
                    rowClassName,
                    row.className
                  )}
                >
                  {columns.map((column, index) => {
                    const isPrimary = column.id === primaryColumn?.id || (index === 0 && !primaryColumn);
                    const baseCellClass = isPrimary
                      ? cn(
                        'w-full max-w-0 text-sm font-medium text-input-text sm:w-auto sm:max-w-none sm:pl-0',
                        density === 'compact' ? 'py-2.5 pr-3 pl-4' : 'py-3 pr-3 pl-4'
                      )
                      : cn(
                        'text-sm text-input-placeholder',
                        density === 'compact' ? 'px-3 py-2.5' : 'px-3 py-3'
                      );
                    const cellContent = row.isPlaceholder ? '\u00A0' : (row.cells[column.id] ?? '—');

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
                        {isClickable && !column.isAction && !column.disableCellWrap ? (
                          <button
                            type="button"
                            onClick={row.onClick}
                            className={cn('w-full', ALIGN_CLASS[column.align ?? 'left'])}
                          >
                            {cellContent}
                            {isPrimary ? renderStackedDetails(row) : null}
                          </button>
                        ) : (
                          <>
                            {cellContent}
                            {isPrimary ? renderStackedDetails(row) : null}
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

  return (
    <div className={cn('grid gap-3', className)}>
      {toolbar ? <div>{toolbar}</div> : null}
      {loading ? (
        <div className="glass-panel min-h-[16rem]">
          <LoadingBlock label={loadingLabel} showLabel className="p-6" />
        </div>
      ) : errorState ? (
        <div>{errorState}</div>
      ) : (
        renderDesktopTable('overflow-x-auto')
      )}
    </div>
  );
};

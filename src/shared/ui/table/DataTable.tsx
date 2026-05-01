import type { ComponentChildren } from 'preact';
import { cn } from '@/shared/utils/cn';
import { SkeletonLoader } from '@/shared/ui/layout/SkeletonLoader';

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
  /** @deprecated Loading state now renders skeleton rows; the label is no
   *  longer surfaced. Kept for prop-API back-compat at call sites. */
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
  loadingLabel: _loadingLabel,
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

  const renderDesktopTable = (tableWrapperClassName: string, rowsOverride?: DataTableRow[]) => (
    <div className={tableWrapperClassName}>
      <table className={cn('min-w-full', tableClassName)}>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className={cn(stickyHeader && 'sticky top-0 z-10 bg-surface-workspace')}>
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
        <tbody className={cn('bg-surface-workspace', bodyClassName)}>
          {(() => {
            const renderRows = rowsOverride ?? paddedRows;
            const sourceRows = rowsOverride ?? rows;
            if (sourceRows.length === 0) {
              return (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-6 text-sm text-input-placeholder">
                    {emptyState ?? 'No results'}
                  </td>
                </tr>
              );
            }
            return renderRows.map((row) => {
              const isClickable = Boolean(row.onClick) && !row.isPlaceholder;

              return (
                <tr
                  key={row.id}
                  className={cn(
                    density === 'compact' ? 'h-14' : 'h-20',
                    isClickable && 'cursor-pointer hover:bg-[rgb(var(--surface-utility))]/5 dark:hover:bg-[rgb(var(--surface-base))]/[0.04]',
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
            });
          })()}
        </tbody>
      </table>
    </div>
  );

  // Skeleton rows that mirror the eventual table shape: one bar per
  // column, sized to look like real text content. Keeps the table header
  // visible so the user sees "this is the invoices table, data soon"
  // instead of a centered spinner that erases structure.
  //
  // Widths are FIXED pixel sizes (w-32, w-44 …) rather than fractional
  // (w-1/2, w-3/4 …). In `<table>` cells with table-layout:auto, fractional
  // widths create a circular layout dependency (cell width depends on
  // child width depends on cell width) and collapse to zero — the cell
  // simply doesn't expand to accommodate them. Fixed pixel widths force
  // the cell to be at least that wide and render reliably. Widths cycle
  // per row so the placeholder reads as varied real content.
  const PRIMARY_WIDTHS = ['w-44', 'w-56', 'w-48', 'w-52', 'w-40', 'w-44'];
  const SECONDARY_WIDTHS = ['w-32', 'w-36', 'w-28', 'w-32', 'w-40', 'w-28'];
  const NUMERIC_WIDTHS = ['w-16', 'w-20', 'w-14', 'w-16', 'w-20', 'w-14'];

  const skeletonRows: DataTableRow[] = Array.from({ length: 6 }, (_, rowIndex) => ({
    id: `__skeleton-${rowIndex}`,
    cells: columns.reduce<Record<string, ComponentChildren>>((acc, column, colIndex) => {
      const isPrimary = column.id === primaryColumn?.id || (colIndex === 0 && !primaryColumn);
      const isNumeric = column.align === 'right';
      const widthCycle = isPrimary
        ? PRIMARY_WIDTHS
        : isNumeric
          ? NUMERIC_WIDTHS
          : SECONDARY_WIDTHS;
      // Flex wrapper respects column alignment (right-aligned numeric
      // columns push their bar to the cell's right edge; everything else
      // sits at the left). `w-full` ensures the wrapper spans the cell so
      // justify-end actually has somewhere to push the bar against.
      const justify = column.align === 'right'
        ? 'justify-end'
        : column.align === 'center'
          ? 'justify-center'
          : 'justify-start';
      acc[column.id] = (
        <div className={cn('flex w-full', justify)}>
          <SkeletonLoader
            variant="text"
            height="h-3.5"
            rounded="rounded-md"
            width={widthCycle[rowIndex % widthCycle.length]}
          />
        </div>
      );
      return acc;
    }, {}),
  }));

  return (
    <div className={cn('grid gap-3', className)}>
      {toolbar ? <div>{toolbar}</div> : null}
      {loading ? (
        // Render the table shell with skeleton rows so the header + column
        // structure stay visible. The originally-passed `rows` are
        // overridden with skeleton placeholders for this render.
        renderDesktopTable('overflow-x-auto', skeletonRows)
      ) : errorState ? (
        <div>{errorState}</div>
      ) : (
        renderDesktopTable('overflow-x-auto')
      )}
    </div>
  );
};

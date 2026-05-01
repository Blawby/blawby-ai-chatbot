import { SkeletonLoader } from '../SkeletonLoader';

type ListRowSkeletonProps = {
  /** Number of placeholder rows to render. Default 5 — matches the typical
   *  visible fold of a list panel without flooding the viewport. */
  rows?: number;
  /** Render an avatar circle on the left. Default true (most lists show a
   *  contact / matter / intake avatar). Set false for file-style rows. */
  avatar?: boolean;
  /** Render a status chip on the right. Default true. */
  trailingChip?: boolean;
  /** Outer container className — e.g. "divide-y divide-line-default" to
   *  match a feature panel's row separators. */
  className?: string;
};

/**
 * Skeleton placeholder shaped like a typical list row (avatar + title +
 * meta line + optional trailing chip). Drop in where a list panel would
 * eventually render its rows so the loading state matches the eventual
 * layout — avoids the "centered spinner → list of rows" jump.
 *
 * Use:
 *   {isLoading && data.length === 0 ? (
 *     <ListRowSkeleton rows={5} />
 *   ) : (
 *     <List items={data} />
 *   )}
 */
export const ListRowSkeleton = ({
  rows = 5,
  avatar = true,
  trailingChip = true,
  className = '',
}: ListRowSkeletonProps) => {
  // Vary the title / subtitle widths a little so the placeholder reads as
  // "real content shape" rather than a uniform pattern.
  const widthCycle = ['w-44', 'w-56', 'w-36', 'w-48', 'w-40', 'w-52'];
  const subWidthCycle = ['w-28', 'w-36', 'w-24', 'w-32', 'w-28', 'w-40'];
  return (
    <div className={className}>
      {Array.from({ length: Math.max(1, rows) }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-4"
          aria-hidden="true"
        >
          {avatar ? <SkeletonLoader variant="avatar" /> : null}
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <SkeletonLoader variant="text" height="h-3.5" width={widthCycle[index % widthCycle.length]} />
            <SkeletonLoader variant="text" height="h-3" width={subWidthCycle[index % subWidthCycle.length]} />
          </div>
          {trailingChip ? <SkeletonLoader variant="chip" /> : null}
        </div>
      ))}
    </div>
  );
};

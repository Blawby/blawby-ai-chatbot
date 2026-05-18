import { SkeletonLoader } from '@/shared/ui/layout';
import { SectionDivider } from '@/shared/ui/layout/SectionDivider';
import { cn } from '@/shared/utils/cn';

type Props = { className?: string };

/**
 * Settings AccountPage skeleton — matches the rendered layout's row pattern:
 * avatar + name → email → subscription plan → 3 generic SettingRow placeholders.
 *
 * Mirrors the spacing of `<SettingRow>` (`flex … py-3`) and `<SectionDivider>`
 * so the swap to real content reflows minimally.
 */
const RowSkeleton = ({ rightWidth = 'w-24', leading }: { rightWidth?: string; leading?: 'avatar' | null }) => (
  <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-1 items-center gap-3 min-w-0">
      {leading === 'avatar' ? <SkeletonLoader variant="avatar" /> : null}
      <div className="flex flex-col gap-1.5 min-w-0">
        <SkeletonLoader variant="text" width="w-32" height="h-3.5" />
        <SkeletonLoader variant="text" width="w-48" height="h-3" />
      </div>
    </div>
    <SkeletonLoader variant="button" width={rightWidth} />
  </div>
);

export const AccountPageSkeleton = ({ className }: Props) => (
  <div className={cn('space-y-6', className)}>
    <RowSkeleton leading="avatar" rightWidth="w-28" />
    <SectionDivider />
    <RowSkeleton rightWidth="w-40" />
    <SectionDivider />
    <RowSkeleton rightWidth="w-28" />
    <SectionDivider />
    <RowSkeleton rightWidth="w-20" />
    <RowSkeleton rightWidth="w-24" />
  </div>
);

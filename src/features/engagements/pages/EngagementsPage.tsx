import { FunctionComponent } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { BriefcaseIcon } from '@heroicons/react/24/outline';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { listEngagements } from '../api/engagementsApi';
import type { EngagementListItem } from '../types/engagement';
import EngagementDetailPage from './EngagementDetailPage';

const PAGE_SIZE = 20;

// EngagementListItem already has `id: string`, no need to re-declare it.
type PaginatedEngagement = EngagementListItem;

type EngagementsPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  activeStatusFilter?: string | null;
};

const ENGAGEMENT_STATUS_CHIP: Record<string, string> = {
  intake_accepted:    'bg-blue-500/10 text-blue-700 ring-blue-500/20 dark:text-blue-300',
  engagement_draft:   'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  engagement_sent:    'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300',
  engagement_accepted:'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  active:             'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
};
const NEUTRAL_CHIP = 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30';

function engagementStatusChip(status?: string) {
  return ENGAGEMENT_STATUS_CHIP[status ?? ''] ?? NEUTRAL_CHIP;
}

function engagementStatusLabel(status?: string) {
  if (status === 'intake_accepted') return 'Accepted';
  if (status === 'engagement_draft') return 'Draft';
  if (status === 'engagement_sent') return 'Sent to client';
  if (status === 'engagement_accepted') return 'Client accepted';
  if (status === 'active') return 'Active';
  return status?.replace(/_/g, ' ') ?? 'Unknown';
}

const EngagementListItemRow = ({
  engagement,
  isSelected,
}: {
  engagement: PaginatedEngagement;
  isSelected: boolean;
}) => {
  const name = engagement.client_name || 'Unknown Client';
  const email = engagement.client_email || '';
  const timeLabel = formatRelativeTime(engagement.created_at);
  const status = engagement.status;

  return (
    <div className={cn(
      'w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors duration-150',
      isSelected ? 'bg-white/10' : 'hover:bg-white/[0.03]'
    )}>
      <Avatar
        name={name}
        size="sm"
        className="bg-white/10 text-input-text ring-1 ring-white/20"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="min-w-0 truncate text-sm font-semibold leading-6 text-input-text">
              {name}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-input-placeholder">
              {email && <span className="truncate">{email}</span>}
              {email && <span>•</span>}
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${engagementStatusChip(status)}`}>
                {engagementStatusLabel(status)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-input-placeholder">{timeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const EngagementsPage: FunctionComponent<EngagementsPageProps> = ({
  practiceId,
  basePath = '/practice/engagements',
  conversationsBasePath,
  practiceName,
  practiceLogo,
  activeStatusFilter = null,
}) => {
  const location = useLocation();
  const [refreshCounter, setRefreshCounter] = useState(0);

  // ── Routing ──────────────────────────────────────────────────────────────
  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedEngagementId = pathSegments[0]
    ? decodeURIComponent(pathSegments[0])
    : null;

  const {
    items: engagements,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMoreRef,
  } = usePaginatedList<PaginatedEngagement>({
    fetchPage: async (page, signal) => {
      if (!practiceId) return { items: [], hasMore: false };
      const result = await listEngagements(
        practiceId,
        { page, limit: PAGE_SIZE },
        { signal }
      );
      return {
        items: result.items.map((item) => ({ ...item, id: item.id })),
        hasMore: result.items.length === PAGE_SIZE,
      };
    },
    deps: [practiceId, activeStatusFilter, refreshCounter],
  });

  const handleSelectEngagement = useCallback((engagement: PaginatedEngagement) => {
    location.route(`${basePath}/${encodeURIComponent(engagement.id)}`);
  }, [basePath, location]);

  const handleBack = useCallback(() => {
    location.route(basePath);
  }, [basePath, location]);

  const handleActionComplete = useCallback(() => {
    setRefreshCounter((c) => c + 1);
    handleBack();
  }, [handleBack]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (selectedEngagementId) {
    return (
      <EngagementDetailPage
        practiceId={practiceId}
        engagementId={selectedEngagementId}
        conversationsBasePath={conversationsBasePath}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onBack={handleBack}
        onActionComplete={handleActionComplete}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <EntityList
          items={engagements}
          renderItem={(engagement, isSelected) => (
            <EngagementListItemRow
              engagement={engagement}
              isSelected={isSelected}
            />
          )}
          onSelect={handleSelectEngagement}
          selectedId={selectedEngagementId ?? undefined}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          error={error}
          loadMoreRef={hasMore ? loadMoreRef : undefined}
          emptyState={
            <WorkspacePlaceholderState
              icon={BriefcaseIcon}
              title="No engagements yet"
              description="When you accept an intake and begin drafting an engagement letter, it will appear here."
              className="p-8"
            />
          }
        />
      </Panel>
    </div>
  );
};

export default EngagementsPage;

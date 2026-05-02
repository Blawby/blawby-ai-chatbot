import { FunctionComponent } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { BriefcaseIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Avatar } from '@/shared/ui/profile';
import { Button } from '@/shared/ui/Button';
import { Dialog, DialogBody, DialogFooter } from '@/shared/ui/dialog';
import { Combobox, type ComboboxOption } from '@/shared/ui/input';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { createEngagementContract, listEngagements } from '../api/engagementsApi';
import type { EngagementListItem } from '../types/engagement';
import EngagementDetailPage from './EngagementDetailPage';
import { SELECTED_ACCENT_SURFACE_CLASS } from '@/shared/ui/layout/selectionStyles';

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
  draft:    'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  sent:     'bg-violet-500/10 text-violet-700 ring-violet-500/20 dark:text-violet-300',
  accepted: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  declined: 'bg-rose-500/10 text-rose-700 ring-rose-500/20 dark:text-rose-300',
};
const NEUTRAL_CHIP = 'bg-surface-overlay/60 text-input-placeholder ring-line-glass/30';

function engagementStatusChip(status?: string) {
  return ENGAGEMENT_STATUS_CHIP[status ?? ''] ?? NEUTRAL_CHIP;
}

function engagementStatusLabel(status?: string) {
  if (status === 'draft') return 'Draft';
  if (status === 'sent') return 'Sent to client';
  if (status === 'accepted') return 'Client accepted';
  if (status === 'declined') return 'Declined';
  return status?.replace(/_/g, ' ') ?? 'Unknown';
}

function matterOptionLabel(matter: BackendMatter) {
  return matter.title?.trim() || matter.case_number?.trim() || matter.id;
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
      isSelected ? SELECTED_ACCENT_SURFACE_CLASS : 'hover:bg-surface-utility/40'
    )}>
      <Avatar
        name={name}
        size="sm"
        className="bg-surface-utility/40 text-input-text ring-1 ring-line-glass/20"
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
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [matterOptionsSource, setMatterOptionsSource] = useState<BackendMatter[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState('');
  const [isLoadingMatters, setIsLoadingMatters] = useState(false);
  const [loadMattersError, setLoadMattersError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const matterOptions = useMemo<ComboboxOption[]>(() => (
    matterOptionsSource.map((matter) => ({
      value: matter.id,
      label: matterOptionLabel(matter),
      meta: matter.status ?? undefined,
      description: matter.description ?? undefined,
    }))
  ), [matterOptionsSource]);

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
    loadMore,
  } = usePaginatedList<PaginatedEngagement>({
    fetchPage: async (page, signal) => {
      if (!practiceId) return { items: [], hasMore: false };
      const result = await listEngagements(
        practiceId,
        { page, limit: PAGE_SIZE, status: activeStatusFilter ? [activeStatusFilter] : undefined },
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

  const handleCreateEngagement = useCallback(() => {
    setIsCreateDialogOpen(true);
    setCreateError(null);
  }, []);

  const handleCloseCreateDialog = useCallback(() => {
    if (isCreating) return;
    setIsCreateDialogOpen(false);
    setSelectedMatterId('');
    setCreateError(null);
  }, [isCreating]);

  useEffect(() => {
    if (!isCreateDialogOpen || !practiceId) return;

    const controller = new AbortController();
    setIsLoadingMatters(true);
    setLoadMattersError(null);
    setMatterOptionsSource([]);

    listMatters(practiceId, { page: 1, limit: 100, signal: controller.signal })
      .then((matters) => {
        if (controller.signal.aborted) return;
        setMatterOptionsSource(matters);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadMattersError(error instanceof Error ? error.message : 'Failed to load matters');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMatters(false);
      });

    return () => controller.abort();
  }, [isCreateDialogOpen, practiceId]);

  const handleConfirmCreate = useCallback(async () => {
    if (!practiceId || !selectedMatterId || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const engagement = await createEngagementContract(practiceId, { matter_id: selectedMatterId });
      setRefreshCounter((c) => c + 1);
      setIsCreateDialogOpen(false);
      setSelectedMatterId('');
      location.route(`${basePath}/${encodeURIComponent(engagement.id)}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Failed to create engagement');
    } finally {
      setIsCreating(false);
    }
  }, [basePath, isCreating, location, practiceId, selectedMatterId]);

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
          onLoadMore={hasMore ? loadMore : undefined}
          minMountSkeletonMs={250}
          emptyState={
            <WorkspacePlaceholderState
              icon={BriefcaseIcon}
              title="No engagements yet"
              description="When you accept an intake and begin drafting an engagement letter, it will appear here."
              primaryAction={{
                label: 'New Engagement',
                onClick: handleCreateEngagement,
                disabled: !practiceId,
                icon: PlusIcon,
              }}
              className="p-8"
            />
          }
        />
      </Panel>
      <Dialog
        isOpen={isCreateDialogOpen}
        onClose={handleCloseCreateDialog}
        title="New Engagement"
        disableBackdropClick={isCreating}
      >
        <DialogBody className="space-y-4">
          {isLoadingMatters ? (
            <div className="flex min-h-24 items-center justify-center">
              <LoadingSpinner size="sm" ariaLabel="Loading matters" />
            </div>
          ) : (
            <Combobox
              label="Matter"
              placeholder="Select a matter"
              options={matterOptions}
              value={selectedMatterId}
              onChange={setSelectedMatterId}
              disabled={isCreating || matterOptions.length === 0}
              searchable
            />
          )}
          {loadMattersError && (
            <p className="text-sm text-rose-400">{loadMattersError}</p>
          )}
          {!isLoadingMatters && !loadMattersError && matterOptions.length === 0 && (
            <p className="text-sm text-input-placeholder">No matters available.</p>
          )}
          {createError && (
            <p className="text-sm text-rose-400">{createError}</p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={handleCloseCreateDialog} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirmCreate}
            disabled={isCreating || !selectedMatterId}
          >
            {isCreating ? 'Creating...' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
};

export default EngagementsPage;

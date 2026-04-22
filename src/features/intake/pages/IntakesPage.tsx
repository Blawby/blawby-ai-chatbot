import { FunctionComponent } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { InboxStackIcon } from '@heroicons/react/24/outline';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Avatar } from '@/shared/ui/profile';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { EntityList } from '@/shared/ui/list/EntityList';
import { usePaginatedList } from '@/shared/hooks/usePaginatedList';
import { listIntakes, type IntakeListItem } from '../api/intakesApi';
import IntakeDetailPage from './IntakeDetailPage';
import IntakeTemplatesPage from './IntakeTemplatesPage';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { DEFAULT_INTAKE_TEMPLATE } from '@/shared/constants/intakeTemplates';

const PAGE_SIZE = 20;

// Internal type that satisfies usePaginatedList's { id: string } constraint
interface PaginatedIntake extends IntakeListItem {
  id: string;
}

type IntakesPageProps = {
  practiceId: string | null;
  basePath?: string;
  conversationsBasePath?: string | null;
  practiceName: string;
  practiceLogo: string | null;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  activeTriageFilter?: string | null;
  prefetchedItems?: IntakeListItem[];
  prefetchedLoading?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
};

const IntakeListItemRow = ({
  intake,
  isSelected,
}: {
  intake: PaginatedIntake;
  isSelected: boolean;
}) => {
  const name = intake.metadata?.name || 'Anonymous Lead';
  const title = resolveIntakeTitle(intake.metadata, name);
  const email = intake.metadata?.email || 'No email';
  const timeLabel = formatRelativeTime(intake.created_at);
  const status = intake.triage_status?.replace(/_/g, ' ') || 'pending';

  return (
    <div className={cn(
      'w-full px-4 py-3.5 text-left flex items-center gap-3 transition-colors duration-150',
      isSelected ? 'bg-surface-utility/60' : 'hover:bg-surface-utility/40'
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
              {title}
            </h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-input-placeholder">
              <span className="truncate">{email}</span>
              <span>•</span>
              <span className="capitalize">{status}</span>
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

export const IntakesPage: FunctionComponent<IntakesPageProps> = ({
  practiceId,
  basePath = '/practice/intakes',
  conversationsBasePath,
  practiceName,
  practiceLogo,
  renderMode = 'full',
  activeTriageFilter = 'all',
  prefetchedItems = [],
  prefetchedLoading = false,
  prefetchedError = null,
  onRefetchList,
}) => {
  const location = useLocation();
  const [refreshCounter, setRefreshCounter] = useState(0);

  // ── Routing ──────────────────────────────────────────────────────────────
  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const isResponsesRoute = pathSegments[0] === 'responses';
  const isTemplateEditorRoute = !isResponsesRoute && (pathSegments[0] === 'new' || pathSegments[1] === 'edit');
  const routeTemplateSlug = !isResponsesRoute && pathSegments[0]
    ? decodeURIComponent(pathSegments[0])
    : null;
  const selectedIntakeId = isResponsesRoute && pathSegments[1]
    ? decodeURIComponent(pathSegments[1])
    : null;
  const templateFilter = typeof location.query?.template === 'string' && location.query.template.trim()
    ? decodeURIComponent(location.query.template)
    : null;
  // Template slugs now open the builder directly; there is no intermediate
  // template detail route between /intakes and /intakes/:slug/edit.
  const templateRouteMode = isTemplateEditorRoute || routeTemplateSlug ? 'editor' : 'list';

  const {
    items: intakes,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    loadMoreRef,
  } = usePaginatedList<PaginatedIntake>({
    fetchPage: async (page, signal) => {
      if (!practiceId || !isResponsesRoute) return { items: [], hasMore: false };

      const validTriageFilters = ['pending_review', 'accepted', 'declined'] as const;
      type ValidTriageFilter = typeof validTriageFilters[number];
      const triageFilter: ValidTriageFilter | undefined =
        validTriageFilters.includes(activeTriageFilter as ValidTriageFilter)
          ? (activeTriageFilter as ValidTriageFilter)
          : undefined;

      const result = await listIntakes(practiceId, {
        page,
        limit: PAGE_SIZE,
        triage_status: triageFilter,
      }, { signal });
      const filteredIntakes = templateFilter
        ? result.intakes.filter((item) => {
          const metadata = item.metadata as Record<string, unknown> | null | undefined;
          const directSlug = metadata?.intake_template_slug ?? metadata?.template_slug;
          if (typeof directSlug === 'string' && directSlug.trim()) {
            return directSlug.trim() === templateFilter;
          }

          const customFields = metadata?.custom_fields ?? metadata?.customFields;
          if (customFields && typeof customFields === 'object' && !Array.isArray(customFields)) {
            const storedSlug = (customFields as Record<string, unknown>)._intake_template_slug;
            if (typeof storedSlug === 'string' && storedSlug.trim()) {
              return storedSlug.trim() === templateFilter;
            }
          }

          return templateFilter === DEFAULT_INTAKE_TEMPLATE.slug;
        })
        : result.intakes;

      return {
        items: filteredIntakes.map(item => ({ ...item, id: item.uuid })),
        hasMore: !templateFilter && result.intakes.length === PAGE_SIZE,
      };
    },
    deps: [practiceId, activeTriageFilter, refreshCounter, isResponsesRoute, templateFilter],
  });

  const handleSelectIntake = useCallback((intake: PaginatedIntake) => {
    location.route(`${basePath}/responses/${encodeURIComponent(intake.uuid)}`);
  }, [basePath, location]);

  const handleBack = useCallback(() => {
    const target = templateFilter
      ? `${basePath}/responses?template=${encodeURIComponent(templateFilter)}`
      : `${basePath}/responses`;
    location.route(target);
  }, [basePath, location, templateFilter]);

  const handleTriageComplete = useCallback(() => {
    setRefreshCounter(c => c + 1);
    if (onRefetchList) void onRefetchList();
    handleBack();
  }, [handleBack, onRefetchList]);

  // ── Rendering ────────────────────────────────────────────────────────────

  if (!isResponsesRoute) {
    return (
      <IntakeTemplatesPage
        basePath={basePath}
        practiceId={practiceId}
        routeTemplateSlug={routeTemplateSlug}
        routeMode={templateRouteMode}
        onBack={routeTemplateSlug ? () => location.route(basePath) : undefined}
      />
    );
  }

  if (selectedIntakeId && renderMode !== 'listOnly') {
    return (
      <IntakeDetailPage
        practiceId={practiceId}
        intakeId={selectedIntakeId}
        conversationsBasePath={conversationsBasePath}
        practiceName={practiceName}
        practiceLogo={practiceLogo}
        onBack={handleBack}
        onTriageComplete={handleTriageComplete}
      />
    );
  }

  if (renderMode === 'detailOnly') return null;

  const displayLoading = isLoading || prefetchedLoading;
  const displayError = error || prefetchedError;
  const localLoaded = !isLoading;
  const displayItems = localLoaded ? intakes : prefetchedItems.map(item => ({ ...item, id: item.uuid }));

  if (renderMode === 'listOnly' && !displayLoading && !displayError && displayItems.length === 0) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <EntityList
          items={displayItems}
          renderItem={(intake, isSelected) => (
            <IntakeListItemRow
              intake={intake}
              isSelected={isSelected}
            />
          )}
          onSelect={handleSelectIntake}
          selectedId={selectedIntakeId ?? undefined}
          isLoading={displayLoading}
          isLoadingMore={isLoadingMore}
          error={displayError}
          loadMoreRef={hasMore ? loadMoreRef : undefined}
          emptyState={
            <WorkspacePlaceholderState
              icon={InboxStackIcon}
              title="No leads yet"
              description={templateFilter
                ? `No responses have been submitted for ?template=${templateFilter} yet.`
                : activeTriageFilter === 'pending_review'
                  ? "You've caught up on all pending reviews! New consultation inquiries will appear here."
                  : "No leads match this filter."
              }
              className="p-8"
            />
          }
        />
      </Panel>
    </div>
  );
};

export default IntakesPage;

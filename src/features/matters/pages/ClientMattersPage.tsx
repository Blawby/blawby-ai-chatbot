import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { EntityList } from '@/shared/ui/list/EntityList';
import { ActivityTimeline, type TimelineItem, type TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { type MatterDetail, type MatterSummary, type MatterTask } from '@/features/matters/data/matterTypes';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { MatterSummaryCards } from '@/features/matters/components/MatterSummaryCards';
import { MatterTasksPanel } from '@/features/matters/components/tasks/MatterTasksPanel';
import { MatterMessagesPanel } from '@/features/matters/components/messages/MatterMessagesPanel';
import {
  getMatter,
  getMatterActivity,
  listMatterNotes,
  listMatterTasks,
  listMatters,
  type BackendMatter,
  type BackendMatterActivity
} from '@/features/matters/services/mattersApi';
import {
  buildActivityTimelineItem,
  buildNoteTimelineItem,
  sortByTimestamp,
  toMatterDetail,
  toMatterSummary,
  toMatterTask
} from '@/features/matters/utils/matterUtils';

type DetailTabId = 'overview' | 'tasks' | 'messages';

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'messages', label: 'Messages' }
];

type ClientMattersPageProps = {
  basePath?: string;
  practiceId?: string | null;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  statusFilter?: string[];
  prefetchedItems?: BackendMatter[];
  prefetchedLoading?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
  listHeaderLeftControl?: ComponentChildren;
  detailHeaderRightControl?: ComponentChildren;
  showDetailBackButton?: boolean;
};

const LoadingState = ({ message }: { message: string }) => (
  <div className="flex h-full items-center justify-center p-8 text-sm text-input-placeholder">{message}</div>
);

const ErrorBanner = ({ children }: { children: ComponentChildren }) => (
  <div className="status-error rounded-2xl px-4 py-3 text-sm">{children}</div>
);

const buildFallbackDetail = (summary: MatterSummary): MatterDetail => ({
  ...summary,
  clientId: '',
  practiceAreaId: '',
  assigneeIds: [],
  description: '',
  billingType: 'hourly',
  milestones: [],
  tasks: [],
  timeEntries: [],
  expenses: [],
  notes: []
});

export const ClientMattersPage = ({
  basePath = '/client/matters',
  practiceId: routePracticeId = null,
  renderMode = 'full',
  statusFilter,
  prefetchedItems,
  prefetchedLoading,
  prefetchedError,
  onRefetchList: _onRefetchList,
  listHeaderLeftControl,
  detailHeaderRightControl,
  showDetailBackButton = true
}: ClientMattersPageProps) => {
  const location = useLocation();
  const { activePracticeId: sessionActivePracticeId, session } = useSessionContext();
  const activePracticeId = routePracticeId ?? sessionActivePracticeId;

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const firstSegment = pathSegments[0] ?? '';
  const selectedMatterIdFromPath = firstSegment && firstSegment !== 'activity'
    ? decodeURIComponent(firstSegment)
    : null;
  const selectedMatterId = renderMode === 'listOnly' ? null : selectedMatterIdFromPath;

  const navigate = (path: string) => location.route(path);
  const goToList = () => navigate(basePath);
  const goToDetail = (id: string) => navigate(`${basePath}/${encodeURIComponent(id)}`);
  const conversationBasePath = basePath.endsWith('/matters')
    ? basePath.replace(/\/matters$/, '/conversations')
    : '/client/conversations';

  const [internalMatters, setInternalMatters] = useState<BackendMatter[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');

  const [selectedMatterDetail, setSelectedMatterDetail] = useState<MatterDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [activityItems, setActivityItems] = useState<TimelineItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [tasks, setTasks] = useState<MatterTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  useEffect(() => {
    if (prefetchedItems) return;
    if (!activePracticeId) {
      setInternalMatters([]);
      setInternalError(null);
      setInternalLoading(false);
      return;
    }

    const controller = new AbortController();
    setInternalLoading(true);
    setInternalError(null);
    listMatters(activePracticeId, { signal: controller.signal })
      .then((items) => setInternalMatters(items))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setInternalError(error instanceof Error ? error.message : 'Failed to load matters');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setInternalLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, prefetchedItems]);

  const matters = prefetchedItems ?? internalMatters;
  const mattersLoading = prefetchedItems ? Boolean(prefetchedLoading) : internalLoading;
  const mattersError = prefetchedItems ? (prefetchedError ?? null) : internalError;
  const isTasksNotFound = Boolean(
    tasksError && (tasksError.includes('404') || tasksError.includes('Not Found'))
  );

  const matterSummaries = useMemo(() => {
    const summaries = matters.map((matter) => toMatterSummary(matter));
    const accepted = statusFilter && statusFilter.length > 0
      ? new Set(statusFilter.map((value) => value.trim().toLowerCase()))
      : null;
    const filtered = accepted
      ? summaries.filter((entry) => accepted.has(entry.status.toLowerCase()))
      : summaries;
    return [...filtered].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [matters, statusFilter]);

  const selectedMatterSummary = useMemo(
    () => selectedMatterId ? matterSummaries.find((matter) => matter.id === selectedMatterId) ?? null : null,
    [matterSummaries, selectedMatterId]
  );

  useEffect(() => {
    if (!activePracticeId || !selectedMatterId) {
      setSelectedMatterDetail(null);
      setDetailLoading(false);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);
    getMatter(activePracticeId, selectedMatterId, { signal: controller.signal })
      .then((matter) => setSelectedMatterDetail(matter ? toMatterDetail(matter) : null))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setDetailError(error instanceof Error ? error.message : 'Failed to load matter');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, selectedMatterId]);

  useEffect(() => {
    if (detailTab !== 'tasks' || !activePracticeId || !selectedMatterId) {
      setTasks([]);
      setTasksLoading(false);
      setTasksError(null);
      return;
    }

    const controller = new AbortController();
    setTasksLoading(true);
    setTasksError(null);
    listMatterTasks(activePracticeId, selectedMatterId, {}, { signal: controller.signal })
      .then((items) => setTasks(items.map(toMatterTask)))
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setTasksError(error instanceof Error ? error.message : 'Failed to load tasks');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setTasksLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, detailTab, selectedMatterId]);

  const resolvedMatter = selectedMatterDetail ?? (selectedMatterSummary ? buildFallbackDetail(selectedMatterSummary) : null);
  const resolvePerson = (userId?: string | null): TimelinePerson => {
    if (!userId) return { name: 'System' };
    if (session?.user?.id === userId) {
      return {
        name: session.user.name ?? session.user.email ?? 'You',
        imageUrl: session.user.image ?? null
      };
    }
    return { name: `User ${userId.slice(0, 6)}` };
  };

  useEffect(() => {
    if (detailTab !== 'overview' || !activePracticeId || !selectedMatterId) {
      setActivityItems([]);
      setActivityLoading(false);
      return;
    }

    const controller = new AbortController();
    setActivityLoading(true);
    Promise.all([
      getMatterActivity(activePracticeId, selectedMatterId, { signal: controller.signal }),
      listMatterNotes(activePracticeId, selectedMatterId, { signal: controller.signal })
    ])
      .then(([activities, notes]) => {
        const context = {
          matterContext: {
            title: resolvedMatter?.title ?? null,
            clientName: resolvedMatter?.clientName ?? null,
            practiceArea: resolvedMatter?.practiceArea ?? null
          },
          clientNameById: new Map<string, string>(),
          serviceNameById: new Map<string, string>(),
          assigneeNameById: new Map<string, string>(),
          resolvePerson
        };
        const filtered = (activities ?? []).filter((item) => !String(item.action ?? '').startsWith('note_'));
        const activityTimeline = sortByTimestamp(filtered).map((item: BackendMatterActivity) =>
          buildActivityTimelineItem(item, activities ?? [], context)
        );
        const noteTimeline = sortByTimestamp(notes ?? []).map((note) => buildNoteTimelineItem(note, resolvePerson));
        const mergedTimeline = [...activityTimeline, ...noteTimeline].sort((a, b) => {
          const at = a.dateTime ? new Date(a.dateTime).getTime() : 0;
          const bt = b.dateTime ? new Date(b.dateTime).getTime() : 0;
          return (Number.isNaN(at) ? 0 : at) - (Number.isNaN(bt) ? 0 : bt);
        });
        setActivityItems(mergedTimeline);
      })
      .catch((error: unknown) => {
        if ((error as DOMException).name === 'AbortError') return;
        setActivityItems([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setActivityLoading(false);
        }
      });

    return () => controller.abort();
  }, [activePracticeId, detailTab, resolvedMatter?.clientName, resolvedMatter?.practiceArea, resolvedMatter?.title, selectedMatterId, session?.user?.email, session?.user?.id, session?.user?.image, session?.user?.name]);

  if (renderMode === 'detailOnly' && !selectedMatterId) {
    return null;
  }

  if (selectedMatterId) {
    if (detailLoading && !resolvedMatter) {
      return <LoadingState message="Loading matter details..." />;
    }
    if (detailError && !resolvedMatter) {
      return (
        <div className="h-full min-h-0 overflow-hidden p-4 sm:p-6">
          <ErrorBanner>{detailError}</ErrorBanner>
        </div>
      );
    }
    if (!resolvedMatter) {
      return (
        <div className="h-full min-h-0 overflow-hidden p-4 sm:p-6">
          <ErrorBanner>This matter is unavailable.</ErrorBanner>
        </div>
      );
    }

    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col">
        <div className="relative z-20 overflow-visible">
          <DetailHeader
            title={resolvedMatter.title}
            subtitle={MATTER_STATUS_LABELS[resolvedMatter.status]}
            showBack={showDetailBackButton}
            onBack={goToList}
            actions={detailHeaderRightControl}
          />
          <nav
            className="relative z-10 flex items-end gap-0 border-b border-white/[0.06] px-4"
            aria-label="Matter sections"
          >
            {DETAIL_TABS.map((tab) => {
              const isActive = detailTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDetailTab(tab.id)}
                  aria-selected={isActive}
                  role="tab"
                  className={[
                    'relative px-3 py-3 text-sm font-medium whitespace-nowrap',
                    'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded-t-sm',
                    'after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:rounded-full after:transition-all after:duration-150',
                    isActive
                      ? 'text-input-text after:bg-accent-500'
                      : 'text-input-placeholder hover:text-input-text after:bg-transparent hover:after:bg-white/20'
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-6 p-4 sm:p-6">
            {detailTab === 'overview' ? (
              <>
                <MatterSummaryCards activeTab="overview" />
                <section className="glass-panel overflow-hidden">
                  <header className="border-b border-line-glass/30 px-6 py-4">
                    <h3 className="text-sm font-semibold text-input-text">Matter details</h3>
                  </header>
                  <div className="grid gap-4 px-6 py-5 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Status</p>
                      <p className="mt-1 text-input-text">{MATTER_STATUS_LABELS[resolvedMatter.status]}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Client</p>
                      <p className="mt-1 text-input-text">{resolvedMatter.clientName || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Practice area</p>
                      <p className="mt-1 text-input-text">{resolvedMatter.practiceArea || 'Not provided'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-input-placeholder">Opened</p>
                      <p className="mt-1 text-input-text">{resolvedMatter.createdAt || 'Not provided'}</p>
                    </div>
                  </div>
                </section>
                <section className="glass-panel overflow-hidden">
                  <header className="border-b border-line-glass/30 px-6 py-4">
                    <h3 className="text-sm font-semibold text-input-text">Matter description</h3>
                  </header>
                  <div className="px-6 py-5">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-input-placeholder">
                      {resolvedMatter.description?.trim() || 'No description available.'}
                    </p>
                  </div>
                </section>
                <section>
                  <h3 className="text-sm font-semibold text-input-text">Recent activity</h3>
                  <Panel className="mt-4 p-4">
                    {activityLoading && activityItems.length === 0 ? (
                      <LoadingState message="Loading activity..." />
                    ) : (
                      <ActivityTimeline items={activityItems} />
                    )}
                  </Panel>
                </section>
              </>
            ) : null}
            {detailTab === 'tasks' ? (
              isTasksNotFound ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] gap-3 text-center p-8">
                  <p className="text-sm font-medium text-muted-foreground">Tasks coming soon</p>
                  <p className="text-xs text-muted-foreground/70">Task management for this matter is not yet available.</p>
                </div>
              ) : (
                <MatterTasksPanel
                  tasks={tasks}
                  loading={tasksLoading}
                  error={tasksError}
                  readOnly
                />
              )
            ) : null}
            {detailTab === 'messages' ? (
              activePracticeId ? (
                <MatterMessagesPanel
                  key={`messages-${resolvedMatter.id}`}
                  matter={resolvedMatter}
                  practiceId={activePracticeId}
                  conversationBasePath={conversationBasePath}
                />
              ) : (
                <ErrorBanner>Missing practice context for conversations.</ErrorBanner>
              )
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const listContent = (
    <>
      {mattersError ? <ErrorBanner>{mattersError}</ErrorBanner> : null}
      {listHeaderLeftControl ? <div className="px-1 py-1">{listHeaderLeftControl}</div> : null}
      <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
        <EntityList
          items={matterSummaries}
          renderItem={(matter, isSelected) => (
            <MatterListItem
              matter={matter}
              isSelected={isSelected}
              onSelect={(selected) => goToDetail(selected.id)}
            />
          )}
          onSelect={(matter) => goToDetail(matter.id)}
          selectedId={selectedMatterId ?? undefined}
          isLoading={mattersLoading}
          isLoadingMore={false}
          error={mattersError}
          emptyState={<div className="p-4 text-sm text-input-placeholder">No matters found.</div>}
        />
      </Panel>
    </>
  );

  if (renderMode === 'listOnly') {
    return <div className="h-full min-h-0 flex flex-col gap-2">{listContent}</div>;
  }

  return (
    <Page className="min-h-full">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <PageHeader
          title="Matters"
          subtitle="Track your matter status, tasks, and related conversations."
        />
        {listContent}
      </div>
    </Page>
  );
};

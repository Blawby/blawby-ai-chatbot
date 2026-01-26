import { useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Tabs, type TabItem } from '@/shared/ui/tabs/Tabs';
import { Button } from '@/shared/ui/Button';
import { Breadcrumbs } from '@/shared/ui/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import { ActivityTimeline } from '@/shared/ui/activity/ActivityTimeline';
import { ChevronUpDownIcon, FolderIcon, PlusIcon } from '@heroicons/react/24/outline';
import type { MattersSidebarStatus } from '@/shared/hooks/useMattersSidebar';
import {
  mockAssignees,
  mockClients,
  mockMatterActivity,
  mockMatterDetails,
  mockMatters,
  mockPracticeAreas
} from '@/features/matters/data/mockMatters';
import { MatterCreateModal, MatterEditModal } from '@/features/matters/components/MatterCreateModal';
import { MatterListItem } from '@/features/matters/components/MatterListItem';
import { MatterStatusDot } from '@/features/matters/components/MatterStatusDot';
import { MatterStatusPill } from '@/features/matters/components/MatterStatusPill';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { TimeEntriesPanel } from '@/features/matters/components/time-entries/TimeEntriesPanel';
import { MatterExpensesPanel } from '@/features/matters/components/expenses/MatterExpensesPanel';
import { MatterNotesPanel } from '@/features/matters/components/notes/MatterNotesPanel';
import { getUtcStartOfToday, parseDateOnlyUtc } from '@/shared/utils/dateOnly';

const statusOrder: Record<MattersSidebarStatus, number> = {
  lead: 0,
  open: 1,
  in_progress: 2,
  completed: 3,
  archived: 4
};

type MatterTabId = 'all' | MattersSidebarStatus;
type DetailTabId = 'overview' | 'time' | 'notes' | 'edit' | 'invoice';

type SortOption = 'updated' | 'title' | 'status';

const SORT_LABELS: Record<SortOption, string> = {
  updated: 'Date updated',
  title: 'Title',
  status: 'Status'
};

const buildTabs = (counts: Record<MattersSidebarStatus, number>): TabItem[] => [
  { id: 'all', label: 'All', count: Object.values(counts).reduce((sum, value) => sum + value, 0) },
  { id: 'lead', label: 'Leads', count: counts.lead },
  { id: 'open', label: 'Open', count: counts.open },
  { id: 'in_progress', label: 'In Progress', count: counts.in_progress },
  { id: 'completed', label: 'Completed', count: counts.completed },
  { id: 'archived', label: 'Archived', count: counts.archived }
];

const TAB_HEADINGS: Record<MatterTabId, string> = {
  all: 'All',
  lead: 'Lead',
  open: 'Open',
  in_progress: 'In Progress',
  completed: 'Completed',
  archived: 'Archived'
};

const DETAIL_TABS: Array<{ id: DetailTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Time' },
  { id: 'notes', label: 'Notes' },
  { id: 'edit', label: 'Edit Matter' },
  { id: 'invoice', label: 'Generate Invoice' }
];

const DETAIL_TAB_DESCRIPTIONS: Record<DetailTabId, string> = {
  overview: 'Key details for the selected matter.',
  time: 'Track recorded hours and reimbursable expenses.',
  notes: 'Add internal notes and decisions tied to this matter.',
  edit: 'Adjust matter details, billing, and team assignments.',
  invoice: 'Generate invoices from time entries and expenses.'
};

const basePath = '/practice/matters';

const formatDuration = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, '0')} hrs`;
};

const EmptyState = () => (
  <div className="flex h-full items-center justify-center p-8">
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-light-hover dark:bg-dark-hover">
        <FolderIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">No matters yet</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        Create your first matter to start tracking progress and milestones.
      </p>
      <div className="mt-6 flex justify-center">
        <Button icon={<PlusIcon className="h-4 w-4" />} disabled>
          Add Matter
        </Button>
      </div>
    </div>
  </div>
);

export const PracticeMattersPage = () => {
  const location = useLocation();
  const pathSuffix = location.path.startsWith(basePath)
    ? location.path.slice(basePath.length)
    : '';
  const firstSegment = pathSuffix.replace(/^\/+/, '').split('/')[0] ?? '';
  const selectedMatterId = firstSegment && firstSegment !== 'activity'
    ? decodeURIComponent(firstSegment)
    : null;
  const selectedMatter = useMemo(
    () => (selectedMatterId ? mockMatters.find((matter) => matter.id === selectedMatterId) ?? null : null),
    [selectedMatterId]
  );
  const selectedMatterDetail = useMemo(
    () => (selectedMatterId ? mockMatterDetails[selectedMatterId] ?? null : null),
    [selectedMatterId]
  );

  const [activeTab, setActiveTab] = useState<MatterTabId>('all');
  const [sortOption, setSortOption] = useState<SortOption>('updated');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTabId>('overview');

  const counts = useMemo(() => {
    return mockMatters.reduce<Record<MattersSidebarStatus, number>>(
      (acc, matter) => {
        acc[matter.status] = (acc[matter.status] ?? 0) + 1;
        return acc;
      },
      {
        lead: 0,
        open: 0,
        in_progress: 0,
        completed: 0,
        archived: 0
      }
    );
  }, []);

  const tabs = useMemo(() => buildTabs(counts), [counts]);

  const filteredMatters = useMemo(() => {
    if (activeTab === 'all') return mockMatters;
    return mockMatters.filter((matter) => matter.status === activeTab);
  }, [activeTab]);

  const sortedMatters = useMemo(() => {
    const matters = [...filteredMatters];
    if (sortOption === 'title') {
      return matters.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortOption === 'status') {
      return matters.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    }
    return matters.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [filteredMatters, sortOption]);

  const activeTabLabel = TAB_HEADINGS[activeTab] ?? 'All';
  const totalTimeSeconds = useMemo(() => {
    const entries = selectedMatterDetail?.timeEntries ?? [];
    return entries.reduce((total, entry) => {
      const start = new Date(entry.startTime).getTime();
      const end = new Date(entry.endTime).getTime();
      return total + Math.max(0, Math.floor((end - start) / 1000));
    }, 0);
  }, [selectedMatterDetail]);
  const taskSummary = useMemo(() => {
    const tasks = selectedMatterDetail?.tasks ?? [];
    const openCount = tasks.filter((task) => task.status !== 'completed').length;
    const completedCount = tasks.filter((task) => task.status === 'completed').length;
    const todayUtc = getUtcStartOfToday();
    const overdueCount = tasks.filter((task) => {
      if (task.status === 'completed' || !task.dueDate) return false;
      const dueDateUtc = parseDateOnlyUtc(task.dueDate);
      return dueDateUtc.getTime() < todayUtc.getTime();
    }).length;
    const progress = tasks.length > 0
      ? Math.round((completedCount / tasks.length) * 100)
      : 0;
    return {
      openCount,
      overdueCount,
      progress
    };
  }, [selectedMatterDetail]);

  if (selectedMatterId) {
    if (!selectedMatter) {
      return (
        <div className="h-full p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <PageHeader
              title="Matter not found"
              subtitle="This matter may have been removed or is no longer available."
              actions={(
                <Button variant="secondary" onClick={() => location.route(basePath)}>
                  Back to matters
                </Button>
              )}
            />
            <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-6">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                We could not find a matter with the ID{' '}
                <span className="font-mono text-gray-700 dark:text-gray-300">{selectedMatterId}</span>
                {' '}in this workspace.
              </p>
            </section>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-full p-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="space-y-4">
            <Breadcrumbs
              items={[
                { label: 'Matters', href: basePath },
                { label: selectedMatter.title }
              ]}
              onNavigate={(href) => location.route(href)}
            />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <MatterStatusDot status={selectedMatter.status} className="mt-1" />
                <div>
                  <h1 className="flex flex-wrap items-center gap-x-2 text-base font-semibold leading-7 text-gray-900 dark:text-white">
                    <span>{selectedMatter.title}</span>
                    <span className="text-gray-400">/</span>
                    <span className="font-semibold text-gray-900 dark:text-white">{selectedMatter.clientName}</span>
                  </h1>
                  <div className="mt-2 flex items-center gap-x-2.5 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    <p className="truncate">Practice Area: {selectedMatter.practiceArea || 'Not Assigned'}</p>
                    <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 flex-none fill-gray-300 dark:fill-white/30">
                      <circle cx="1" cy="1" r="1" />
                    </svg>
                    <p className="whitespace-nowrap">Updated {formatRelativeTime(selectedMatter.updatedAt)}</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MatterStatusPill status={selectedMatter.status} />
                <Button
                  variant="secondary"
                  onClick={() => {
                    setModalKey((prev) => prev + 1);
                    setIsEditOpen(true);
                  }}
                >
                  Edit Matter
                </Button>
              </div>
            </div>
          </div>

          <div className="border-b border-gray-200 dark:border-white/10">
            <nav className="-mb-px flex flex-wrap items-center gap-6" aria-label="Tabs">
              {DETAIL_TABS.map((tab) => {
                const isActive = detailTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDetailTab(tab.id)}
                    className={[
                      'whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-gray-900 text-gray-900 dark:border-white dark:text-white'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    ].join(' ')}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Total time', value: formatDuration(totalTimeSeconds), helper: 'Estimated 18h' },
              { label: 'Billable amount', value: '$18,400', helper: 'Collected $9,200' },
              {
                label: 'Tasks',
                value: `${taskSummary.openCount} open`,
                helper: `${taskSummary.overdueCount} overdue`
              },
              { label: 'Progress', value: `${taskSummary.progress}%`, helper: 'In progress' }
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4"
              >
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{card.label}</p>
                <p className="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{card.value}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{card.helper}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg">
            <header className="border-b border-gray-200 dark:border-white/10 px-6 py-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                {DETAIL_TABS.find((tab) => tab.id === detailTab)?.label ?? 'Overview'}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {DETAIL_TAB_DESCRIPTIONS[detailTab] ?? 'Content coming soon for this tab.'}
              </p>
            </header>
            {detailTab === 'overview' ? (
              <div className="px-6 py-6">
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-6">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tasks</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Milestones and to-dos tied to this matter.
                    </p>
                    <div className="mt-5 rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Task items will appear here once the backend is ready.
                      </p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Recent activity</h3>
                    <div className="mt-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4">
                      <ActivityTimeline items={mockMatterActivity} showComposer composerDisabled />
                    </div>
                  </div>
                </div>
              </div>
            ) : detailTab === 'time' && selectedMatterDetail ? (
              <div className="px-6 py-6 space-y-6">
                <TimeEntriesPanel key={`time-${selectedMatterDetail.id}`} matter={selectedMatterDetail} />
                <MatterExpensesPanel key={`expenses-${selectedMatterDetail.id}`} matter={selectedMatterDetail} />
              </div>
            ) : detailTab === 'notes' && selectedMatterDetail ? (
              <div className="px-6 py-6">
                <MatterNotesPanel key={`notes-${selectedMatterDetail.id}`} matter={selectedMatterDetail} />
              </div>
            ) : (
              <div className="px-6 py-6 text-sm text-gray-500 dark:text-gray-400">
                We will add the {DETAIL_TABS.find((tab) => tab.id === detailTab)?.label ?? 'tab'} details next.
              </div>
            )}
          </section>
        </div>

        {isEditOpen && selectedMatterDetail && (
          <MatterEditModal
            key={modalKey}
            isOpen={isEditOpen}
            onClose={() => setIsEditOpen(false)}
            clients={mockClients}
            practiceAreas={mockPracticeAreas}
            assignees={mockAssignees}
            initialValues={{
              title: selectedMatterDetail.title,
              clientId: selectedMatterDetail.clientId,
              practiceAreaId: selectedMatterDetail.practiceAreaId,
              assigneeIds: selectedMatterDetail.assigneeIds,
              status: selectedMatterDetail.status,
              billingType: selectedMatterDetail.billingType,
              attorneyHourlyRate: selectedMatterDetail.attorneyHourlyRate,
              adminHourlyRate: selectedMatterDetail.adminHourlyRate,
              paymentFrequency: selectedMatterDetail.paymentFrequency,
              totalFixedPrice: selectedMatterDetail.totalFixedPrice,
              milestones: selectedMatterDetail.milestones ?? [],
              contingencyPercent: selectedMatterDetail.contingencyPercent,
              description: selectedMatterDetail.description
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-full p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <PageHeader
          title="Matters"
          subtitle="Track matter progress, client updates, and case milestones."
          actions={(
            <div className="flex items-center gap-2">
              <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => {
                setModalKey((prev) => prev + 1);
                setIsCreateOpen(true);
              }}>
                Create Matter
              </Button>
            </div>
          )}
        />

        <Tabs
          items={tabs}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as MatterTabId)}
          actions={(
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ChevronUpDownIcon className="h-4 w-4" />}
                  iconPosition="right"
                >
                  Sort by {SORT_LABELS[sortOption]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <div className="py-1">
                  {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                    <DropdownMenuItem
                      key={option}
                      onSelect={() => setSortOption(option)}
                      className={option === sortOption ? 'font-semibold text-gray-900 dark:text-white' : ''}
                    >
                      {SORT_LABELS[option]}
                    </DropdownMenuItem>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />

        <div className="flex flex-col gap-6">
          <section className="rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
            <header className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-4 py-4 sm:px-6 lg:px-8">
              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{activeTabLabel} Matters</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {sortedMatters.length} showing
                </p>
              </div>
            </header>
            {sortedMatters.length === 0 ? (
              <EmptyState />
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-white/10">
                {sortedMatters.map((matter) => (
                  <MatterListItem
                    key={matter.id}
                    matter={matter}
                    onSelect={(selected) => location.route(`${basePath}/${encodeURIComponent(selected.id)}`)}
                  />
                ))}
              </ul>
            )}
          </section>

        </div>
      </div>

      {isCreateOpen && (
        <MatterCreateModal
          key={modalKey}
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          clients={mockClients}
          practiceAreas={mockPracticeAreas}
          assignees={mockAssignees}
        />
      )}
    </div>
  );
};

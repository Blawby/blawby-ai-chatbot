import type { FunctionComponent } from 'preact';
import { Inbox } from 'lucide-preact';

import { EntityList } from '@/shared/ui/list/EntityList';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { useNavigation } from '@/shared/utils/navigation';
import { useReportDeliveries } from '@/features/reports/hooks/useReportDeliveries';
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
} from '@/features/reports/config/reportCollection';

interface DeliveriesListViewProps {
  practiceId: string;
  practiceSlug: string | null;
}

const DEFINITIONS_BY_ID = new Map<string, ReportDefinition>(REPORT_DEFINITIONS.map((d) => [d.id, d]));

const STATUS_BADGE: Record<string, string> = {
  pending: 'text-amber-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

export const DeliveriesListView: FunctionComponent<DeliveriesListViewProps> = ({ practiceId, practiceSlug }) => {
  const { items, loading, error, hasMore, loadMore, refetch } = useReportDeliveries(practiceId);
  const { navigate } = useNavigation();

  const handleSelect = (delivery: typeof items[number]) => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/deliveries/${encodeURIComponent(delivery.id)}`);
  };

  if (!loading && items.length === 0 && !error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <div>
          <h1 className="text-lg font-semibold text-ink">Deliveries</h1>
          <p className="mt-1 text-sm text-dim-2">Past report deliveries from scheduled jobs and one-off sends.</p>
        </div>
        <WorkspacePlaceholderState
          icon={Inbox}
          title="No deliveries yet"
          description="Schedule a report or use Send now to create your first delivery."
          className="h-full"
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">Deliveries</h1>
        <p className="mt-1 text-sm text-dim-2">Past report deliveries from scheduled jobs and one-off sends.</p>
      </div>
      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-400">
          {error} <button type="button" className="ml-2 underline" onClick={refetch}>Retry</button>
        </div>
      ) : null}
      <EntityList
        items={items}
        onSelect={handleSelect}
        isLoading={loading && items.length === 0}
        isLoadingMore={loading && items.length > 0}
        onLoadMore={hasMore ? loadMore : undefined}
        className="panel overflow-hidden"
        renderItem={(delivery) => (
          <div className="flex w-full items-center gap-4 px-4 py-3 hover:bg-paper-2/10">
            <span className="min-w-[160px] flex-1 truncate text-sm text-ink">
              {new Date(delivery.createdAt).toLocaleString()}
            </span>
            <span className="hidden min-w-[140px] truncate text-sm text-dim-2 sm:block">
              {DEFINITIONS_BY_ID.get(delivery.reportType)?.title ?? delivery.reportType}
            </span>
            <span className={`min-w-[80px] text-sm ${STATUS_BADGE[delivery.status] ?? 'text-dim-2'}`}>
              {delivery.status}
            </span>
            <span className="hidden min-w-[120px] text-right text-sm text-dim-2 md:block">
              {delivery.recipients.length > 0
                ? `${delivery.recipients.length} recipient${delivery.recipients.length === 1 ? '' : 's'}`
                : '—'}
            </span>
          </div>
        )}
      />
    </div>
  );
};

export default DeliveriesListView;

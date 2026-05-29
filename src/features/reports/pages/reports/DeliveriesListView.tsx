import type { FunctionComponent } from 'preact';
import { Inbox } from 'lucide-preact';

import { DataTable, type DataTableColumn, type DataTableRow } from '@/shared/ui/table/DataTable';
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

const COLUMNS: DataTableColumn[] = [
  { id: 'createdAt', label: 'Created', isPrimary: true },
  { id: 'reportType', label: 'Report' },
  { id: 'status', label: 'Status' },
  { id: 'recipients', label: 'Recipients' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'text-amber-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

export const DeliveriesListView: FunctionComponent<DeliveriesListViewProps> = ({ practiceId, practiceSlug }) => {
  const { items, loading, error, hasMore, loadMore, refetch } = useReportDeliveries(practiceId);
  const { navigate } = useNavigation();

  const rows: DataTableRow[] = items.map((d) => ({
    id: d.id,
    onClick: () => {
      if (!practiceSlug) return;
      navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/deliveries/${encodeURIComponent(d.id)}`);
    },
    cells: {
      createdAt: new Date(d.createdAt).toLocaleString(),
      reportType: DEFINITIONS_BY_ID.get(d.reportType)?.title ?? d.reportType,
      status: <span className={STATUS_BADGE[d.status] ?? ''}>{d.status}</span>,
      recipients: d.recipients.length > 0 ? `${d.recipients.length} recipient${d.recipients.length === 1 ? '' : 's'}` : '—',
    },
  }));

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
      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading && items.length === 0}
        density="compact"
        stickyHeader
        className="panel overflow-hidden"
        bodyClassName="bg-transparent"
        rowClassName="transition-colors duration-150 hover:!bg-paper-2"
        hasMore={hasMore}
        isLoadingMore={loading && items.length > 0}
        onLoadMore={loadMore}
      />
    </div>
  );
};

export default DeliveriesListView;

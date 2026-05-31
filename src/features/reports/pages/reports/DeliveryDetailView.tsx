import type { FunctionComponent } from 'preact';
import { ArrowLeft, Download, Inbox } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { useNavigation } from '@/shared/utils/navigation';
import { reportsApi } from '@/features/reports/services/reportsApi';
import { useReportDeliveryDetail } from '@/features/reports/hooks/useReportDeliveries';
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
} from '@/features/reports/config/reportCollection';

interface DeliveryDetailViewProps {
  practiceId: string;
  practiceSlug: string | null;
  deliveryId: string;
}

const DEFINITIONS_BY_ID = new Map<string, ReportDefinition>(REPORT_DEFINITIONS.map((d) => [d.id, d]));

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-amber-400',
  completed: 'text-emerald-400',
  failed: 'text-red-400',
};

export const DeliveryDetailView: FunctionComponent<DeliveryDetailViewProps> = ({ practiceId, practiceSlug, deliveryId }) => {
  const { delivery, loading, error } = useReportDeliveryDetail(practiceId, deliveryId);
  const { navigate } = useNavigation();

  const backToList = () => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/deliveries`);
  };

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
        <LoadingSpinner size="md" ariaLabel="Loading delivery" />
      </div>
    );
  }

  if (!delivery) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={backToList}>Back to deliveries</Button>
        <WorkspacePlaceholderState
          icon={Inbox}
          title="Delivery not found"
          description={error ?? "We couldn't find this delivery."}
          className="h-full"
        />
      </div>
    );
  }

  const reportTitle = DEFINITIONS_BY_ID.get(delivery.reportType)?.title ?? delivery.reportType;
  const downloadUrl = reportsApi.downloadDeliveryUrl(practiceId, deliveryId);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={backToList}>Back to deliveries</Button>
        {delivery.status === 'completed' ? (
          <a
            href={downloadUrl}
            download
            className="inline-flex items-center gap-2 rounded-md bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
          >
            <Download className="h-4 w-4" />
            Download CSV
          </a>
        ) : null}
      </div>
      <div>
        <h1 className="text-lg font-semibold text-ink">{reportTitle}</h1>
        <p className="mt-1 text-sm font-mono text-dim-2">{delivery.id}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line-subtle p-3">
          <p className="text-xs text-dim-2">Status</p>
          <p className={`text-sm font-medium ${STATUS_COLOR[delivery.status] ?? ''}`}>{delivery.status}</p>
        </div>
        <div className="rounded-2xl border border-line-subtle p-3">
          <p className="text-xs text-dim-2">Created</p>
          <p className="text-sm text-ink">{new Date(delivery.createdAt).toLocaleString()}</p>
        </div>
        {delivery.completedAt ? (
          <div className="rounded-2xl border border-line-subtle p-3">
            <p className="text-xs text-dim-2">Completed</p>
            <p className="text-sm text-ink">{new Date(delivery.completedAt).toLocaleString()}</p>
          </div>
        ) : null}
        {typeof delivery.byteSize === 'number' ? (
          <div className="rounded-2xl border border-line-subtle p-3">
            <p className="text-xs text-dim-2">File size</p>
            <p className="text-sm text-ink">{delivery.byteSize.toLocaleString()} bytes</p>
          </div>
        ) : null}
        <div className="rounded-2xl border border-line-subtle p-3 sm:col-span-2">
          <p className="text-xs text-dim-2">Recipients</p>
          <p className="text-sm text-ink">
            {delivery.recipients.length === 0 ? '—' : delivery.recipients.join(', ')}
          </p>
        </div>
        {delivery.errorMessage ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-3 sm:col-span-2">
            <p className="text-xs text-red-300">Error</p>
            <p className="text-sm text-red-400">{delivery.errorMessage}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default DeliveryDetailView;

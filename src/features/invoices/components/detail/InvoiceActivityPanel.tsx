import { useMemo } from 'preact/hooks';
import { Panel } from '@/shared/ui/layout/Panel';
import { ActivityTimeline } from '@/shared/ui/activity/ActivityTimeline';
import type { InvoiceDetail } from '@/features/invoices/types';
import { synthesizeInvoiceActivity } from '@/features/invoices/utils/synthesizeInvoiceActivity';

interface InvoiceActivityPanelProps {
  detail: InvoiceDetail;
}

export const InvoiceActivityPanel = ({ detail }: InvoiceActivityPanelProps) => {
  const items = useMemo(() => synthesizeInvoiceActivity(detail), [detail]);

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-input-text">Activity</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-input-placeholder">No activity yet.</p>
      ) : (
        <ActivityTimeline items={items} />
      )}
    </Panel>
  );
};

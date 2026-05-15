import type { FunctionComponent } from 'preact';
import { Inbox } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';

interface DeliveriesListViewProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const DeliveriesListView: FunctionComponent<DeliveriesListViewProps> = () => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
    <div>
      <h1 className="text-lg font-semibold text-input-text">Deliveries</h1>
      <p className="mt-1 text-sm text-input-placeholder">Past report deliveries from scheduled jobs and one-off sends.</p>
    </div>
    <WorkspacePlaceholderState
      icon={Inbox}
      title="No deliveries yet"
      description="Schedule a report or use Send now to create your first delivery."
      className="h-full"
    />
  </div>
);

export default DeliveriesListView;

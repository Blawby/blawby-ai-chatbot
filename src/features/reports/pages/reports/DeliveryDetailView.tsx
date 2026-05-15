import type { FunctionComponent } from 'preact';
import { Inbox } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';

interface DeliveryDetailViewProps {
  practiceId: string;
  practiceSlug: string | null;
  deliveryId: string;
}

export const DeliveryDetailView: FunctionComponent<DeliveryDetailViewProps> = ({ deliveryId }) => (
  <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
    <div>
      <h1 className="text-lg font-semibold text-input-text">Delivery</h1>
      <p className="mt-1 text-sm text-input-placeholder font-mono">{deliveryId}</p>
    </div>
    <WorkspacePlaceholderState
      icon={Inbox}
      title="Delivery details coming soon"
      description="Detail view ships with the deliveries milestone."
      className="h-full"
    />
  </div>
);

export default DeliveryDetailView;

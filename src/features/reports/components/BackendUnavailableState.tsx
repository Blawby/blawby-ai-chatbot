import type { FunctionComponent } from 'preact';
import { Construction } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import type { ReportDefinition } from '@/features/reports/config/reportCollection';

interface BackendUnavailableStateProps {
  definition: ReportDefinition;
}

export const BackendUnavailableState: FunctionComponent<BackendUnavailableStateProps> = ({ definition }) => (
  <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-6">
    <WorkspacePlaceholderState
      icon={Construction}
      title={`${definition.title} — coming soon`}
      description={definition.description}
      caption="This report depends on a backend endpoint that is not yet available. It will light up automatically once the backend ships."
      className="h-full"
    />
  </div>
);

export default BackendUnavailableState;

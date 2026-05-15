import type { FunctionComponent } from 'preact';
import { BarChart3 } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import type { ReportDefinition } from '@/features/reports/config/reportCollection';
import { BackendUnavailableState } from './BackendUnavailableState';

interface ReportPageShellProps {
  definition: ReportDefinition;
  practiceId: string;
  practiceSlug: string | null;
}

export const ReportPageShell: FunctionComponent<ReportPageShellProps> = ({ definition }) => {
  if (definition.phase === 3) {
    return <BackendUnavailableState definition={definition} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-input-text">{definition.title}</h1>
        <p className="mt-1 text-sm text-input-placeholder">{definition.description}</p>
      </div>
      <WorkspacePlaceholderState
        icon={BarChart3}
        title="Report data not yet wired"
        description="The data fetch for this report ships in the next milestone."
        className="h-full"
      />
    </div>
  );
};

export default ReportPageShell;

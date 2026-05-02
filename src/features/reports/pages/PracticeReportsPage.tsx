import type { FunctionComponent } from 'preact';
import { BarChart3 } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';

interface PracticeReportsPageProps {
  title: string;
}

export const PracticeReportsPage: FunctionComponent<PracticeReportsPageProps> = ({
  title,
}) => (
  <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-6">
    <WorkspacePlaceholderState
      icon={BarChart3}
      title={title}
      description="Report data and exports will appear here."
      className="h-full"
    />
  </div>
);

export default PracticeReportsPage;

import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface TaskProductivityReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const TaskProductivityReport: FunctionComponent<TaskProductivityReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('task-productivity')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default TaskProductivityReport;

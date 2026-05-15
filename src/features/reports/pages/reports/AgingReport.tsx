import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface AgingReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const AgingReport: FunctionComponent<AgingReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('aging')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default AgingReport;

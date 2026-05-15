import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface UtilizationReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const UtilizationReport: FunctionComponent<UtilizationReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('utilization')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default UtilizationReport;

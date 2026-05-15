import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface RevenueReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const RevenueReport: FunctionComponent<RevenueReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('revenue')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default RevenueReport;

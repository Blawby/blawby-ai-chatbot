import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface ProfitabilityReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const ProfitabilityReport: FunctionComponent<ProfitabilityReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('profitability')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default ProfitabilityReport;

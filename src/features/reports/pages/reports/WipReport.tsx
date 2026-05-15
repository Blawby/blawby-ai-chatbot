import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface WipReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const WipReport: FunctionComponent<WipReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('wip')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default WipReport;

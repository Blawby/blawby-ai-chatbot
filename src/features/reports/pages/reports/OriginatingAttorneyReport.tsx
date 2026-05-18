import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface OriginatingAttorneyReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const OriginatingAttorneyReport: FunctionComponent<OriginatingAttorneyReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('originating-attorney')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default OriginatingAttorneyReport;

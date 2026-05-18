import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface MattersByAttorneyReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const MattersByAttorneyReport: FunctionComponent<MattersByAttorneyReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('matters-by-attorney')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default MattersByAttorneyReport;

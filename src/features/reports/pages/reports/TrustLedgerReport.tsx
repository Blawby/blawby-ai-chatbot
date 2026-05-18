import type { FunctionComponent } from 'preact';
import { getReportDefinition } from '@/features/reports/config/reportCollection';
import { ReportPageShell } from '@/features/reports/components/ReportPageShell';

interface TrustLedgerReportProps {
  practiceId: string;
  practiceSlug: string | null;
}

export const TrustLedgerReport: FunctionComponent<TrustLedgerReportProps> = ({ practiceId, practiceSlug }) => (
  <ReportPageShell
    definition={getReportDefinition('trust-ledger')}
    practiceId={practiceId}
    practiceSlug={practiceSlug}
  />
);

export default TrustLedgerReport;

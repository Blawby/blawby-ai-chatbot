import type { FunctionComponent } from 'preact';
import { BarChart3 } from 'lucide-preact';

import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import {
  ALL_REPORTS_HUB_ID,
  DELIVERIES_SECTION_ID,
  tryGetReportDefinition,
} from '@/features/reports/config/reportCollection';
import { AllReportsHub } from './reports/AllReportsHub';
import { RevenueReport } from './reports/RevenueReport';
import { AgingReport } from './reports/AgingReport';
import { ProfitabilityReport } from './reports/ProfitabilityReport';
import { UtilizationReport } from './reports/UtilizationReport';
import { TrustLedgerReport } from './reports/TrustLedgerReport';
import { WipReport } from './reports/WipReport';
import { OriginatingAttorneyReport } from './reports/OriginatingAttorneyReport';
import { MattersByAttorneyReport } from './reports/MattersByAttorneyReport';
import { TaskProductivityReport } from './reports/TaskProductivityReport';
import { DeliveriesListView } from './reports/DeliveriesListView';
import { DeliveryDetailView } from './reports/DeliveryDetailView';

interface PracticeReportsPageProps {
  title: string;
  reportType: string;
  deliveryId: string | null;
  practiceId: string;
  practiceSlug: string | null;
}

export const PracticeReportsPage: FunctionComponent<PracticeReportsPageProps> = ({
  title,
  reportType,
  deliveryId,
  practiceId,
  practiceSlug,
}) => {
  if (reportType === ALL_REPORTS_HUB_ID) {
    return <AllReportsHub practiceId={practiceId} practiceSlug={practiceSlug} />;
  }
  if (reportType === DELIVERIES_SECTION_ID) {
    return deliveryId
      ? <DeliveryDetailView practiceId={practiceId} practiceSlug={practiceSlug} deliveryId={deliveryId} />
      : <DeliveriesListView practiceId={practiceId} practiceSlug={practiceSlug} />;
  }
  const definition = tryGetReportDefinition(reportType);
  if (!definition) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-6">
        <WorkspacePlaceholderState
          icon={BarChart3}
          title={title}
          description="This report does not exist."
          className="h-full"
        />
      </div>
    );
  }
  const sharedProps = { practiceId, practiceSlug };
  switch (definition.id) {
    case 'revenue': return <RevenueReport {...sharedProps} />;
    case 'aging': return <AgingReport {...sharedProps} />;
    case 'profitability': return <ProfitabilityReport {...sharedProps} />;
    case 'utilization': return <UtilizationReport {...sharedProps} />;
    case 'trust-ledger': return <TrustLedgerReport {...sharedProps} />;
    case 'wip': return <WipReport {...sharedProps} />;
    case 'originating-attorney': return <OriginatingAttorneyReport {...sharedProps} />;
    case 'matters-by-attorney': return <MattersByAttorneyReport {...sharedProps} />;
    case 'task-productivity': return <TaskProductivityReport {...sharedProps} />;
    default:
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-2 p-4 sm:p-6">
          <WorkspacePlaceholderState
            icon={BarChart3}
            title={title}
            description="Report not yet implemented."
            className="h-full"
          />
        </div>
      );
  }
};

export default PracticeReportsPage;

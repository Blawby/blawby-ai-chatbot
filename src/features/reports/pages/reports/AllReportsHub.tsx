import type { FunctionComponent } from 'preact';
import { useNavigation } from '@/shared/utils/navigation';
import {
  REPORT_DEFINITIONS,
  type ReportDefinition,
} from '@/features/reports/config/reportCollection';
import { ReportCard } from '@/features/reports/components/ReportCard';

interface AllReportsHubProps {
  practiceSlug: string | null;
}

export const AllReportsHub: FunctionComponent<AllReportsHubProps> = ({ practiceSlug }) => {
  const { navigate } = useNavigation();

  const handleSelect = (def: ReportDefinition) => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/reports/${def.id}`);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-lg font-semibold text-ink">All reports</h1>
        <p className="mt-1 text-sm text-dim-2">Browse the available reports for your practice.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {REPORT_DEFINITIONS.map((def) => (
          <ReportCard key={def.id} definition={def} onClick={() => handleSelect(def)} />
        ))}
      </div>
    </div>
  );
};

export default AllReportsHub;

import type { FunctionComponent } from 'preact';
import { StatCard } from '@/shared/ui/cards/StatCard';
import type {
  ColumnKind,
  SummaryCardSpec,
} from '@/features/reports/config/reportCollection';
import { formatReportValue } from '@/features/reports/utils/formatReportValue';

interface ReportListKpiRowProps {
  cards: SummaryCardSpec[];
  meta: Record<string, unknown>;
}

const formatMetaValue = (kind: ColumnKind, value: unknown): string => {
  return formatReportValue(kind, value, { checkEmptyString: false });
};

export const ReportListKpiRow: FunctionComponent<ReportListKpiRowProps> = ({ cards, meta }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {cards.map((card) => (
      <StatCard
        key={card.id}
        label={card.label}
        value={formatMetaValue(card.kind, meta[card.metaKey])}
      />
    ))}
  </div>
);

export default ReportListKpiRow;

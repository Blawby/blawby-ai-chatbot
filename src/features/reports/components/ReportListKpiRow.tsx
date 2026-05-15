import type { FunctionComponent } from 'preact';
import { StatCard } from '@/shared/ui/cards/StatCard';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type {
  ColumnKind,
  SummaryCardSpec,
} from '@/features/reports/config/reportCollection';

interface ReportListKpiRowProps {
  cards: SummaryCardSpec[];
  meta: Record<string, unknown>;
}

const formatMetaValue = (kind: ColumnKind, value: unknown): string => {
  if (value == null) return '—';
  switch (kind) {
    case 'money':
      return formatCurrency(typeof value === 'number' ? value / 100 : 0);
    case 'percent':
      return `${typeof value === 'number' ? value.toFixed(1) : value}%`;
    case 'hours':
      return `${typeof value === 'number' ? value.toFixed(2) : value}h`;
    case 'days':
      return String(value);
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'date':
    case 'text':
    default:
      return String(value);
  }
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

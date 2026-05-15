import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { ColumnKind } from '@/features/reports/config/reportCollection';

interface FormatReportValueOptions {
  checkEmptyString?: boolean;
}

export const formatReportValue = (
  kind: ColumnKind,
  value: unknown,
  options: FormatReportValueOptions = {}
): string => {
  const { checkEmptyString = true } = options;
  if (value == null || (checkEmptyString && value === '')) return '—';

  switch (kind) {
    case 'money':
      return formatCurrency(typeof value === 'number' ? value / 100 : 0);
    case 'percent':
      return `${typeof value === 'number' ? value.toFixed(1) : value}%`;
    case 'hours':
      return `${typeof value === 'number' ? value.toFixed(2) : value}h`;
    case 'days':
      return `${value}`;
    case 'date': {
      const d = typeof value === 'string' ? new Date(value) : value instanceof Date ? value : null;
      if (!d || Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleDateString();
    }
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'text':
    default:
      return String(value);
  }
};

export default formatReportValue;
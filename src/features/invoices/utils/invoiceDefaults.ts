import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import { buildTomorrowDateStringUtc } from '@/shared/utils/dateOnly';

export const buildDefaultDueDate = () => buildTomorrowDateStringUtc();

export const detectDefaultInvoiceType = (
  items: InvoiceLineItem[],
  context: 'default' | 'milestone' | 'retainer',
  billingType: MatterDetail['billingType'],
  fallback?: Invoice['invoice_type']
): Invoice['invoice_type'] => {
  if (fallback) return fallback;
  if (context === 'milestone') return 'phase_fee';
  if (context === 'retainer') return 'retainer_deposit';
  if (items.length === 0) return 'retainer_deposit';
  if (billingType === 'fixed') return 'flat_fee';
  if (billingType === 'hourly') return 'hourly';
  if (billingType === 'contingency') return 'contingency';
  return 'flat_fee';
};

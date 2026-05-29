import { Pill, type PillTone } from '@/design-system/primitives';
import type { InvoiceStatus } from '@/features/invoices/types';

const statusTone: Record<string, PillTone> = {
  draft: 'dim',
  pending: 'warn',
  sent: 'gold',
  open: 'warn',
  overdue: 'urgent',
  paid: 'live',
  void: 'dim',
  cancelled: 'dim',
};

export const InvoiceStatusBadge = ({ status }: { status: InvoiceStatus }) => {
  const normalized = status.toLowerCase();
  const tone = statusTone[normalized];

  if (!tone) {
    throw new Error(`Unknown invoice status: "${status}". Normalized: "${normalized}". Check statusTone in InvoiceStatusBadge.tsx.`);
  }

  return (
    <Pill tone={tone}>
      {normalized.replace(/_/g, ' ')}
    </Pill>
  );
};

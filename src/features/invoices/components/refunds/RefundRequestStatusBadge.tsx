import { Pill, type PillTone } from '@/design-system/primitives';

const STATUS_TONE: Record<string, PillTone> = {
  pending: 'warn',
  requested: 'warn',
  approved: 'gold',
  declined: 'urgent',
  executed: 'live',
  cancelled: 'dim',
};

interface RefundRequestStatusBadgeProps {
  status: string;
}

export const RefundRequestStatusBadge = ({ status }: RefundRequestStatusBadgeProps) => {
  const normalized = status.toLowerCase();
  const tone = STATUS_TONE[normalized] ?? 'dim';
  return <Pill tone={tone}>{normalized}</Pill>;
};

import type { TimelineItem, TimelinePerson } from '@/shared/ui/activity/ActivityTimeline';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import type { InvoiceDetail } from '@/features/invoices/types';

const SYSTEM_PERSON: TimelinePerson = { name: 'System', imageUrl: null };

const formatDate = (value: string | null): string =>
  value ? formatLongDate(value) : '';

const safeDateTime = (value: string | null): string | undefined =>
  value ?? undefined;

type SynthesizeOptions = {
  practitionerPerson?: TimelinePerson;
  clientPerson?: TimelinePerson;
};

export const synthesizeInvoiceActivity = (
  detail: InvoiceDetail,
  options: SynthesizeOptions = {}
): TimelineItem[] => {
  const items: TimelineItem[] = [];
  const practitioner = options.practitionerPerson ?? SYSTEM_PERSON;
  const client = options.clientPerson ?? {
    name: detail.clientName?.trim() || 'Client',
    imageUrl: null,
  };

  if (detail.createdAt) {
    items.push({
      id: `created-${detail.id}`,
      type: 'created',
      person: practitioner,
      date: formatDate(detail.createdAt),
      dateTime: safeDateTime(detail.createdAt),
      action: 'created the invoice.',
    });
  }

  if (detail.issueDate && detail.issueDate !== detail.createdAt) {
    items.push({
      id: `issued-${detail.id}`,
      type: 'edited',
      person: practitioner,
      date: formatDate(detail.issueDate),
      dateTime: safeDateTime(detail.issueDate),
      action: 'issued the invoice.',
    });
  }

  const status = detail.status.toLowerCase();
  if ((status === 'sent' || status === 'open' || status === 'overdue' || status === 'paid') && detail.issueDate) {
    items.push({
      id: `sent-${detail.id}`,
      type: 'sent',
      person: practitioner,
      date: formatDate(detail.issueDate),
      dateTime: safeDateTime(detail.issueDate),
      action: 'sent the invoice to the client.',
    });
  }

  detail.payments.forEach((payment) => {
    items.push({
      id: `payment-${payment.id}`,
      type: 'paid',
      person: client,
      date: formatDate(payment.paidAt),
      dateTime: safeDateTime(payment.paidAt),
      action: `paid ${formatCurrency(payment.amount)}.`,
    });
  });

  detail.refunds.forEach((refund) => {
    items.push({
      id: `refund-${refund.id}`,
      type: 'edited',
      person: practitioner,
      date: formatDate(refund.createdAt),
      dateTime: safeDateTime(refund.createdAt),
      action: `refunded ${formatCurrency(refund.amount)}${refund.reason ? ` — ${refund.reason}` : ''}.`,
    });
  });

  detail.refundRequests.forEach((request) => {
    const statusKey = request.status.toLowerCase();
    const amountLabel = request.amount != null ? formatCurrency(request.amount) : 'a refund';
    let action: string;
    switch (statusKey) {
      case 'approved':
        action = `approved the refund request for ${amountLabel}.`;
        break;
      case 'declined':
        action = `declined the refund request for ${amountLabel}.`;
        break;
      case 'executed':
        action = `executed the refund for ${amountLabel}.`;
        break;
      case 'cancelled':
        action = `cancelled the refund request for ${amountLabel}.`;
        break;
      default:
        action = `requested a refund of ${amountLabel}${request.reason ? ` — ${request.reason}` : ''}.`;
        break;
    }
    const eventDate = request.updatedAt ?? request.createdAt;
    items.push({
      id: `refund-request-${request.id}-${statusKey}`,
      type: statusKey === 'declined' || statusKey === 'cancelled' ? 'edited' : 'sent',
      person: statusKey === 'requested' || statusKey === 'pending' ? client : practitioner,
      date: formatDate(eventDate),
      dateTime: safeDateTime(eventDate),
      action,
    });
  });

  if (status === 'void' || status === 'cancelled') {
    items.push({
      id: `voided-${detail.id}`,
      type: 'edited',
      person: practitioner,
      date: formatDate(detail.updatedAt),
      dateTime: safeDateTime(detail.updatedAt),
      action: 'voided the invoice.',
    });
  }

  return items.sort((a, b) => {
    const aTime = a.dateTime ? new Date(a.dateTime).getTime() : 0;
    const bTime = b.dateTime ? new Date(b.dateTime).getTime() : 0;
    if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
    return aTime - bTime;
  });
};

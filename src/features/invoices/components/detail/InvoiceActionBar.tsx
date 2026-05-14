import { useCallback } from 'preact/hooks';
import { MoreHorizontal, ExternalLink } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { InvoiceDetail } from '@/features/invoices/types';
import {
  isActionableOpenStatus,
  isRefundableStatus,
  isVoidableStatus,
} from '@/features/invoices/utils/invoicePageConfig';

interface InvoiceActionBarProps {
  detail: InvoiceDetail;
  isMutating: boolean;
  onEditDraft: () => void;
  onSendInvoice: () => void;
  onSync: () => void;
  onVoid: () => void;
  onOpenHosted: () => void;
  onRequestRefund: () => void;
  onViewCustomer?: () => void;
}

export const InvoiceActionBar = ({
  detail,
  isMutating,
  onEditDraft,
  onSendInvoice,
  onSync,
  onVoid,
  onOpenHosted,
  onRequestRefund,
  onViewCustomer,
}: InvoiceActionBarProps) => {
  const { showSuccess, showError } = useToastContext();
  const status = detail.status.toLowerCase();
  const hasHostedUrl = Boolean(detail.stripeHostedInvoiceUrl);
  const canRefund = isRefundableStatus(status, detail.amountPaid);
  const canVoid = isVoidableStatus(status);

  const copyText = useCallback(
    async (label: string, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        showSuccess(`${label} copied`, value);
      } catch (err) {
        showError(`Could not copy ${label.toLowerCase()}`, err instanceof Error ? err.message : 'Unknown error');
      }
    },
    [showError, showSuccess]
  );

  let primaryAction: { label: string; onClick: () => void; disabled?: boolean } | null = null;
  if (status === 'draft') {
    primaryAction = { label: 'Edit draft', onClick: onEditDraft };
  } else if (status === 'pending') {
    primaryAction = { label: 'Send invoice', onClick: onSendInvoice, disabled: isMutating };
  } else if (isActionableOpenStatus(status)) {
    primaryAction = { label: 'Sync with Stripe', onClick: onSync, disabled: isMutating };
  } else if (status === 'paid') {
    primaryAction = {
      label: 'Open hosted invoice',
      onClick: onOpenHosted,
      disabled: !hasHostedUrl,
    };
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRefund ? (
        <Button variant="secondary" onClick={onRequestRefund} disabled={isMutating}>
          Refund
        </Button>
      ) : null}
      {primaryAction ? (
        <Button onClick={primaryAction.onClick} disabled={primaryAction.disabled}>
          {primaryAction.label}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More actions" icon={MoreHorizontal} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[220px]">
          {canVoid ? (
            <DropdownMenuItem onSelect={onVoid} disabled={isMutating}>
              Void invoice
            </DropdownMenuItem>
          ) : null}
          {hasHostedUrl ? (
            <DropdownMenuItem onSelect={onOpenHosted}>
              <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
              Open hosted invoice
            </DropdownMenuItem>
          ) : null}
          {detail.id ? (
            <DropdownMenuItem onSelect={() => void copyText('Invoice ID', detail.id)}>
              Copy invoice ID
            </DropdownMenuItem>
          ) : null}
          {detail.invoiceNumber ? (
            <DropdownMenuItem onSelect={() => void copyText('Invoice number', detail.invoiceNumber)}>
              Copy invoice number
            </DropdownMenuItem>
          ) : null}
          {onViewCustomer && detail.clientId ? (
            <DropdownMenuItem onSelect={onViewCustomer}>View customer</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

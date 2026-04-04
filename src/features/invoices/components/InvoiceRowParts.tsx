import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { ComponentChildren } from 'preact';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';

export type InvoiceActionState = {
  status: string;
  isPending?: boolean;
  syncDelayElapsed?: boolean;
  stripeInvoiceNumber?: string | null;
};

export type InvoiceActionCallbacks = {
  onPrimaryAction: () => void;
  primaryLabel: string;
  onSendInvoice?: () => void;
  onResendInvoice?: () => void;
  onVoidInvoice?: () => void;
  onSyncInvoice?: () => void;
};

export const normalizeInvoiceStatus = (status: string) => status.trim().toLowerCase();

export const InvoiceStatusActions = ({
  state,
  callbacks,
  extraMenuItems,
}: {
  state: InvoiceActionState;
  callbacks: InvoiceActionCallbacks;
  extraMenuItems?: ComponentChildren;
}) => {
  const normalizedStatus = normalizeInvoiceStatus(state.status);
  const canSendDraft = normalizedStatus === 'draft' && Boolean(callbacks.onSendInvoice);
  const canResend = normalizedStatus === 'sent' && Boolean(callbacks.onResendInvoice);
  const canVoid = Boolean(callbacks.onVoidInvoice)
    && (normalizedStatus === 'draft' || normalizedStatus === 'sent' || normalizedStatus === 'pending');
  const canSync = normalizedStatus === 'sent'
    && !state.stripeInvoiceNumber
    && state.syncDelayElapsed
    && Boolean(callbacks.onSyncInvoice);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-input-placeholder transition-colors hover:bg-white/[0.06] hover:text-input-text"
          aria-label="Invoice actions"
          disabled={state.isPending}
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={callbacks.onPrimaryAction}>
          {callbacks.primaryLabel}
        </DropdownMenuItem>
        {canSendDraft ? (
          <DropdownMenuItem onSelect={() => callbacks.onSendInvoice?.()}>
            {state.isPending ? 'Sending...' : 'Send invoice'}
          </DropdownMenuItem>
        ) : null}
        {canResend ? (
          <DropdownMenuItem onSelect={() => callbacks.onResendInvoice?.()}>
            {state.isPending ? 'Sending...' : 'Resend invoice'}
          </DropdownMenuItem>
        ) : null}
        {canSync ? (
          <DropdownMenuItem onSelect={() => callbacks.onSyncInvoice?.()}>
            {state.isPending ? 'Syncing...' : 'Sync with Stripe'}
          </DropdownMenuItem>
        ) : null}
        {canVoid ? (
          <DropdownMenuItem onSelect={() => callbacks.onVoidInvoice?.()}>
            {state.isPending ? 'Voiding...' : 'Void invoice'}
          </DropdownMenuItem>
        ) : null}
        {extraMenuItems}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

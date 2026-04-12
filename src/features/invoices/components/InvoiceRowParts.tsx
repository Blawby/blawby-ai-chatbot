import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import type { ComponentChildren } from 'preact';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';

export type InvoicePendingAction = 'send' | 'resend' | 'sync' | 'void';

export type InvoiceActionState = {
  status: string;
  pendingAction?: InvoicePendingAction | null;
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

const LoadingMenuLabel = ({
  label,
  isPending,
}: {
  label: string;
  isPending: boolean;
}) => {
  if (!isPending) return label;

  return (
    <span className="inline-flex items-center">
      <LoadingSpinner size="sm" className="mr-2" ariaLabel={label} />
      {label}
    </span>
  );
};

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
  const hasPendingAction = Boolean(state.pendingAction);
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
          className="rounded-md p-1 text-input-placeholder transition-colors hover:bg-surface-utility/40 hover:text-input-text"
          aria-label="Invoice actions"
          disabled={hasPendingAction}
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <DropdownMenuItem onSelect={callbacks.onPrimaryAction}>
          {callbacks.primaryLabel}
        </DropdownMenuItem>
        {canSendDraft ? (
          <DropdownMenuItem 
            onSelect={() => callbacks.onSendInvoice?.()}
            disabled={state.pendingAction === 'send'}
          >
            <LoadingMenuLabel label="Send invoice" isPending={state.pendingAction === 'send'} />
          </DropdownMenuItem>
        ) : null}
        {canResend ? (
          <DropdownMenuItem 
            onSelect={() => callbacks.onResendInvoice?.()}
            disabled={state.pendingAction === 'resend'}
          >
            <LoadingMenuLabel label="Resend invoice" isPending={state.pendingAction === 'resend'} />
          </DropdownMenuItem>
        ) : null}
        {canSync ? (
          <DropdownMenuItem 
            onSelect={() => callbacks.onSyncInvoice?.()}
            disabled={state.pendingAction === 'sync'}
          >
            <LoadingMenuLabel label="Sync with Stripe" isPending={state.pendingAction === 'sync'} />
          </DropdownMenuItem>
        ) : null}
        {canVoid ? (
          <DropdownMenuItem 
            onSelect={() => callbacks.onVoidInvoice?.()}
            disabled={state.pendingAction === 'void'}
          >
            <LoadingMenuLabel label="Void invoice" isPending={state.pendingAction === 'void'} />
          </DropdownMenuItem>
        ) : null}
        {extraMenuItems}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

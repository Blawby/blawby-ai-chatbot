import type { ComponentChildren } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { asMajor, safeAdd } from '@/shared/utils/money';
import {
  sendInvoice,
  syncInvoice,
  voidInvoice,
  createPracticeRefundRequest,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceDetail, InvoiceRefundRequestEvent } from '@/features/invoices/types';
import { InvoiceActionBar } from './InvoiceActionBar';
import { InvoiceActivityPanel } from './InvoiceActivityPanel';
import { InvoiceSummaryPanel } from './InvoiceSummaryPanel';
import { InvoiceLineItemsTable } from './InvoiceLineItemsTable';
import { InvoicePaymentsSection } from './InvoicePaymentsSection';
import { InvoiceRefundsSection } from './InvoiceRefundsSection';
import { InvoiceDetailsSidebar } from './InvoiceDetailsSidebar';
import { VoidInvoiceConfirmDialog } from '@/features/invoices/components/dialogs/VoidInvoiceConfirmDialog';
import { RefundRequestDialog } from '@/features/invoices/components/dialogs/RefundRequestDialog';
import { SendInvoiceDialog } from '@/features/invoices/components/SendInvoiceDialog';
import { RefundRequestReviewDialog } from '@/features/invoices/components/refunds/RefundRequestReviewDialog';

export interface PracticeMeta {
  name?: string | null;
  logo?: string | null;
  businessEmail?: string | null;
  billingIncrementMinutes?: number | null;
}

interface UsePracticeInvoiceDetailControllerArgs {
  practiceId: string;
  practiceSlug: string | null;
  detail: InvoiceDetail;
  currentPractice: PracticeMeta | null;
  loading: boolean;
  refetch: () => Promise<unknown>;
}

interface PracticeInvoiceDetailController {
  actionBar: ComponentChildren;
  mainContent: ComponentChildren;
}

export const usePracticeInvoiceDetailController = ({
  practiceId,
  practiceSlug,
  detail,
  currentPractice,
  loading,
  refetch,
}: UsePracticeInvoiceDetailControllerArgs): PracticeInvoiceDetailController => {
  const { navigate } = useNavigation();
  const { showError, showSuccess, showInfo } = useToastContext();
  const [isMutating, setIsMutating] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [voidLoading, setVoidLoading] = useState(false);
  const [refundLoading, setRefundLoading] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);
  const [reviewRequest, setReviewRequest] = useState<InvoiceRefundRequestEvent | null>(null);

  const totalAmount = useMemo(
    () => detail.lineItems.reduce((acc, item) => safeAdd(acc, item.line_total), asMajor(0)),
    [detail.lineItems]
  );

  const handleEditDraft = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(detail.id)}/edit`);
  }, [navigate, practiceSlug, detail.id]);

  const handleViewCustomer = useCallback(() => {
    if (!practiceSlug || !detail.clientId) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/contacts/${encodeURIComponent(detail.clientId)}`);
  }, [navigate, practiceSlug, detail.clientId]);

  const handleOpenHosted = useCallback(() => {
    if (!detail.stripeHostedInvoiceUrl) {
      showInfo('Invoice', 'Stripe hosted invoice URL is not available yet.');
      return;
    }
    window.open(detail.stripeHostedInvoiceUrl, '_blank', 'noopener,noreferrer');
  }, [detail.stripeHostedInvoiceUrl, showInfo]);

  const handleSync = useCallback(async () => {
    if (isMutating) return;
    setIsMutating(true);
    try {
      await syncInvoice(practiceId, detail.id);
      showSuccess('Invoice synced', 'Invoice status was refreshed from Stripe.');
      await refetch();
    } catch (err) {
      showError('Sync failed', err instanceof Error ? err.message : 'Failed to sync invoice');
    } finally {
      setIsMutating(false);
    }
  }, [isMutating, practiceId, detail.id, refetch, showError, showSuccess]);

  const handleVoidConfirm = useCallback(
    async (_reason: string) => {
      if (voidLoading) return;
      setVoidLoading(true);
      setIsMutating(true);
      try {
        await voidInvoice(practiceId, detail.id);
        showSuccess('Invoice voided', 'The invoice has been voided.');
        setVoidOpen(false);
        await refetch();
      } catch (err) {
        showError('Void failed', err instanceof Error ? err.message : 'Failed to void invoice');
      } finally {
        setVoidLoading(false);
        setIsMutating(false);
      }
    },
    [voidLoading, practiceId, detail.id, refetch, showError, showSuccess]
  );

  const handleRefundSubmit = useCallback(
    async ({ amount, reason }: { amount?: number; reason: string }) => {
      if (refundLoading) return;
      setRefundLoading(true);
      try {
        await createPracticeRefundRequest(practiceId, detail.id, { amount, reason });
        showSuccess('Refund requested', 'The refund request has been submitted for review.');
        setRefundOpen(false);
        await refetch();
      } catch (err) {
        showError('Refund request failed', err instanceof Error ? err.message : 'Failed to submit refund request');
      } finally {
        setRefundLoading(false);
      }
    },
    [refundLoading, practiceId, detail.id, refetch, showError, showSuccess]
  );

  const handleSendConfirm = useCallback(async () => {
    if (sendLoading) return;
    setSendLoading(true);
    try {
      await sendInvoice(practiceId, detail.id);
      showSuccess('Invoice sent', 'The invoice has been sent to the client.');
      setSendOpen(false);
      await refetch();
    } catch (err) {
      showError('Send failed', err instanceof Error ? err.message : 'Failed to send invoice');
    } finally {
      setSendLoading(false);
    }
  }, [sendLoading, practiceId, detail.id, refetch, showError, showSuccess]);

  const busy = isMutating || voidLoading || refundLoading || sendLoading || loading;

  const actionBar = (
    <InvoiceActionBar
      detail={detail}
      isMutating={busy}
      onEditDraft={handleEditDraft}
      onSendInvoice={() => setSendOpen(true)}
      onSync={() => void handleSync()}
      onVoid={() => setVoidOpen(true)}
      onOpenHosted={handleOpenHosted}
      onRequestRefund={() => setRefundOpen(true)}
      onViewCustomer={detail.clientId ? handleViewCustomer : undefined}
    />
  );

  const mainContent = (
    <div className="flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-4">
          <InvoiceActivityPanel detail={detail} />
          <InvoiceSummaryPanel detail={detail} />
          <InvoiceLineItemsTable detail={detail} />
          <InvoicePaymentsSection payments={detail.payments} />
          <InvoiceRefundsSection
            refunds={detail.refunds}
            refundRequests={detail.refundRequests}
            onReviewRequest={(request) => setReviewRequest(request)}
          />
        </div>
        <InvoiceDetailsSidebar detail={detail} />
      </div>

      <VoidInvoiceConfirmDialog
        isOpen={voidOpen}
        invoiceNumber={detail.invoiceNumber}
        loading={voidLoading}
        onConfirm={handleVoidConfirm}
        onCancel={() => setVoidOpen(false)}
      />

      <RefundRequestDialog
        isOpen={refundOpen}
        maxAmount={detail.amountPaid}
        loading={refundLoading}
        invoiceNumber={detail.invoiceNumber}
        onSubmit={handleRefundSubmit}
        onCancel={() => setRefundOpen(false)}
      />

      <SendInvoiceDialog
        isOpen={sendOpen}
        mode="detail"
        totalAmount={totalAmount}
        lineItems={detail.lineItems}
        dueDate={detail.dueDate ? detail.dueDate.slice(0, 10) : undefined}
        previewTitle={detail.matterTitle || detail.clientName || 'Invoice'}
        previewReferenceLabel={detail.matterId ? `Matter ID: ${detail.matterId}` : null}
        recipientEmail={detail.clientEmail}
        practiceName={currentPractice?.name ?? undefined}
        practiceLogoUrl={currentPractice?.logo ?? undefined}
        practiceEmail={currentPractice?.businessEmail ?? undefined}
        clientName={detail.clientName}
        clientEmail={detail.clientEmail}
        billingIncrementMinutes={currentPractice?.billingIncrementMinutes ?? undefined}
        previewNotes={detail.notes}
        onConfirm={handleSendConfirm}
        onCancel={() => setSendOpen(false)}
        loading={sendLoading}
      />

      <RefundRequestReviewDialog
        isOpen={reviewRequest !== null}
        practiceId={practiceId}
        request={reviewRequest}
        onClose={() => setReviewRequest(null)}
        onCompleted={async () => {
          await refetch();
        }}
      />
    </div>
  );

  return { actionBar, mainContent };
};

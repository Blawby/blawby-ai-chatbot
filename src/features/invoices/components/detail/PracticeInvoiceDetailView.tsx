import type { ComponentChildren } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { asMajor, getMajorAmountValue, safeAdd } from '@/shared/utils/money';
import {
  sendInvoice,
  syncInvoice,
  voidInvoice,
  createPracticeRefundRequest,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceDetail, InvoiceRefundRequestEvent } from '@/features/invoices/types';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { StagedAction } from '@/design-system/patterns/StagedAction';
import { Chip } from '@/design-system/primitives/Chip';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';
import { InvoiceActionBar } from './InvoiceActionBar';
import { InvoiceActivityPanel } from './InvoiceActivityPanel';
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

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Heuristic for "this draft was probably staged by the assistant".
 *
 * Real signal lives in TODO(backend): persist `invoice.staged_by_assistant`
 * so we don't have to guess. Until then we surface the StagedAction whenever
 * the invoice (a) is still a draft AND (b) was created in the last hour AND
 * (c) has at least one line item.
 *
 * False positives (a lawyer drafted manually in the last hour) just see an
 * extra "Staged by assistant" banner; the underlying actions are the same
 * existing send/edit/discard flow, so the worst case is mild visual noise.
 */
const deriveIsStagedByAssistant = (detail: InvoiceDetail): boolean => {
  if (detail.status.toLowerCase() !== 'draft') return false;
  const createdAt = detail.createdAt ? Date.parse(detail.createdAt) : NaN;
  if (Number.isNaN(createdAt)) return false;
  if (Date.now() - createdAt > ONE_HOUR_MS) return false;
  if (detail.lineItems.length === 0) return false;
  return true;
};

const sumLineItemTotals = (detail: InvoiceDetail): number =>
  detail.lineItems.reduce((acc, item) => acc + getMajorAmountValue(item.line_total), 0);

const sumLineItemHours = (detail: InvoiceDetail): number =>
  detail.lineItems.reduce((acc, item) => acc + Number(item.quantity ?? 0), 0);

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
    async () => {
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

  // ---- Staged-by-assistant banner (heuristic; see deriveIsStagedByAssistant) ----
  const isStaged = deriveIsStagedByAssistant(detail);
  const stagedHours = isStaged ? sumLineItemHours(detail) : 0;
  const stagedAmount = isStaged ? sumLineItemTotals(detail) : 0;

  const stagedBanner = isStaged ? (
    <div className="px-4 pt-4 sm:px-6">
      <div className="mx-auto w-full max-w-[720px]">
        <StagedAction
          label="Staged by assistant · awaits your approval"
          title={`AI drafted this invoice · ${formatCurrency(stagedAmount)}`}
          description={
            <>
              Aggregated from <strong>{detail.lineItems.length} unbilled line {detail.lineItems.length === 1 ? 'item' : 'items'}</strong>
              {stagedHours > 0 ? (
                <>
                  {' '}({stagedHours.toFixed(stagedHours % 1 === 0 ? 0 : 1)} {stagedHours === 1 ? 'hour' : 'hours'})
                </>
              ) : null}
              . Review the line items below before approving. Nothing is sent until you click <strong>Approve &amp; send</strong>.
            </>
          }
          actions={
            <>
              <Chip variant="primary" onClick={() => setSendOpen(true)}>
                Approve &amp; send
              </Chip>
              <Chip onClick={handleEditDraft}>Edit lines</Chip>
              <Chip variant="warn" onClick={() => setVoidOpen(true)}>
                Discard draft
              </Chip>
            </>
          }
        />
      </div>
    </div>
  ) : null;

  const letterPaperBody = (
    <div className="px-4 pb-2 pt-4 sm:px-6">
      <InvoicePreview
        title={detail.matterTitle || detail.clientName || 'Invoice'}
        referenceLabel={detail.matterId ? `Matter ID: ${detail.matterId}` : null}
        lineItems={detail.lineItems}
        issueDate={detail.issueDate}
        dueDate={detail.dueDate ? detail.dueDate.slice(0, 10) : undefined}
        invoiceNumber={detail.invoiceNumber}
        practiceName={currentPractice?.name ?? undefined}
        practiceLogoUrl={currentPractice?.logo ?? undefined}
        practiceEmail={currentPractice?.businessEmail ?? undefined}
        clientName={detail.clientName}
        clientEmail={detail.clientEmail}
        billingIncrementMinutes={currentPractice?.billingIncrementMinutes ?? undefined}
        notes={detail.notes}
      />
    </div>
  );

  const auditActivity = (
    <div className="px-4 pb-8 sm:px-6">
      <InvoiceActivityPanel detail={detail} variant="audit" />
    </div>
  );

  const mainContent = (
    <div className="flex-1 overflow-y-auto">
      {stagedBanner}
      {letterPaperBody}
      {auditActivity}

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
        key={reviewRequest?.id ?? 'closed'}
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

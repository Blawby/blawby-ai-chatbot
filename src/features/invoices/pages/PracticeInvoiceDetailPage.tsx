import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { XMarkIcon } from '@heroicons/react/24/outline';
import Modal from '@/shared/components/Modal';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { WorkspaceListHeader } from '@/shared/ui/layout/WorkspaceListHeader';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getUserDetail } from '@/shared/lib/apiClient';
import { useNavigation } from '@/shared/utils/navigation';
import { InvoiceForm } from '@/features/invoices/components/InvoiceForm';
import type { InvoiceFormHandle } from '@/features/invoices/components/InvoiceForm';
import {
  getInvoice,
  syncInvoice,
  voidInvoice,
} from '@/features/invoices/services/invoicesService';
import type { InvoiceDetail } from '@/features/invoices/types';
import { resolveInvoicePageMode } from '@/features/invoices/utils/invoicePageConfig';

const isActionableOpenStatus = (status: string): boolean => {
  return ['sent', 'pending', 'open', 'overdue'].includes(status);
};

const isRefundEligibleStatus = (status: string): boolean => {
  return !['draft', 'void', 'cancelled'].includes(status);
};

const renderEventDate = (value: string | null): string => {
  return value ? formatLongDate(value) : '—';
};

export function PracticeInvoiceDetailPage({
  practiceId,
  practiceSlug,
  invoiceId,
  leadingAction,
  onInspector,
  inspectorOpen = false,
  showBack = true,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  invoiceId: string | null;
  leadingAction?: ComponentChildren;
  onInspector?: () => void;
  inspectorOpen?: boolean;
  showBack?: boolean;
}) {
  const { navigate } = useNavigation();
  const { showError, showInfo, showSuccess } = useToastContext();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedClientLabel, setResolvedClientLabel] = useState<string | null>(null);

  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [submittingMockRefund, setSubmittingMockRefund] = useState(false);
  const formRef = useRef<InvoiceFormHandle | null>(null);

  const loadDetail = useCallback((signal?: AbortSignal) => {
    if (!practiceId || !invoiceId) return Promise.resolve();
    setLoading(true);
    setError(null);

    return getInvoice(practiceId, invoiceId, { signal })
      .then((result) => {
        if (!result) {
          setDetail(null);
          setError('Invoice not found.');
          return;
        }
        setDetail(result);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Failed to load invoice';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [invoiceId, practiceId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  useEffect(() => {
    if (!practiceId || !detail?.sourceInvoice.client_id) {
      setResolvedClientLabel(null);
      return;
    }

    const embeddedLabel = detail.clientName?.trim();
    if (embeddedLabel) {
      setResolvedClientLabel(embeddedLabel);
      return;
    }

    const controller = new AbortController();
    setResolvedClientLabel(null);

    void getUserDetail(practiceId, detail.sourceInvoice.client_id, { signal: controller.signal })
      .then((clientDetail) => {
        if (controller.signal.aborted) return;
        const hydratedLabel =
          clientDetail?.user?.name?.trim() ||
          clientDetail?.user?.email?.trim() ||
          null;
        setResolvedClientLabel(hydratedLabel);
      })
      .catch((err) => {
        if (controller.signal.aborted || err.name === 'AbortError') return;
        console.error('[PracticeInvoiceDetailPage] Failed to hydrate invoice client label', err);
      });

    return () => controller.abort();
  }, [detail?.clientName, detail?.sourceInvoice.client_id, practiceId]);

  const status = useMemo(() => (detail?.status ?? 'draft').toLowerCase(), [detail?.status]);
  const mode = useMemo(() => resolveInvoicePageMode(status), [status]);
  const isDraft = mode === 'edit';
  const hasHostedUrl = Boolean(detail?.stripeHostedInvoiceUrl);
  const canMockRefund = Boolean(detail && isRefundEligibleStatus(status) && detail.amountPaid > 0);

  const builderClientOptions = useMemo(() => {
    if (!detail) return [];
    const label = resolvedClientLabel?.trim() || detail.clientName?.trim() || 'Person';
    return [{ value: detail.sourceInvoice.client_id, label }];
  }, [detail, resolvedClientLabel]);

  const builderMatterOptions = useMemo(() => {
    if (!detail?.sourceInvoice.matter_id) return [];
    const label = detail.matterTitle?.trim() || 'Matter';
    return [{ value: detail.sourceInvoice.matter_id, label, meta: detail.sourceInvoice.client_id }];
  }, [detail]);

  const handleOpenHostedInvoice = useCallback(() => {
    if (!detail?.stripeHostedInvoiceUrl) {
      showInfo('Invoice', 'Stripe hosted invoice URL is not available yet.');
      return;
    }
    window.open(detail.stripeHostedInvoiceUrl, '_blank', 'noopener,noreferrer');
  }, [detail?.stripeHostedInvoiceUrl, showInfo]);

  const handleBackToList = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices`);
  }, [navigate, practiceSlug]);

  const handleBuilderSuccess = useCallback(async (updatedInvoiceId?: string | null) => {
    const safeInvoiceId = updatedInvoiceId?.trim();
    if (safeInvoiceId && safeInvoiceId !== detail?.id && practiceSlug) {
      navigate(`/practice/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(safeInvoiceId)}`);
      return;
    }
    await loadDetail();
  }, [detail?.id, loadDetail, navigate, practiceSlug]);

  const handleSync = useCallback(async () => {
    if (!practiceId || !invoiceId) return;
    try {
      await syncInvoice(practiceId, invoiceId);
      showSuccess('Invoice synced', 'Invoice status was refreshed from Stripe.');
      await loadDetail();
    } catch (err) {
      showError('Invoice sync failed', err instanceof Error ? err.message : 'Failed to sync invoice');
    }
  }, [invoiceId, loadDetail, practiceId, showError, showSuccess]);

  const handleVoid = useCallback(async () => {
    if (!practiceId || !invoiceId) return;
    const confirmed = window.confirm('Void this invoice? This cannot be undone.');
    if (!confirmed) return;

    try {
      await voidInvoice(practiceId, invoiceId);
      showSuccess('Invoice voided', 'The invoice has been voided.');
      await loadDetail();
    } catch (err) {
      showError('Invoice void failed', err instanceof Error ? err.message : 'Failed to void invoice');
    }
  }, [invoiceId, loadDetail, practiceId, showError, showSuccess]);

  const handleSubmitMockRefund = useCallback(async () => {
    if (!detail) return;
    if (!refundReason.trim()) {
      showError('Refund request', 'Please provide a reason.');
      return;
    }

    const parsedAmount = refundAmount.trim().length > 0 ? Number(refundAmount) : undefined;
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      showError('Refund request', 'Amount must be a positive number.');
      return;
    }

    if (parsedAmount !== undefined && parsedAmount > detail.amountPaid) {
      showError('Refund request', 'Amount cannot be greater than the amount paid.');
      return;
    }

    setSubmittingMockRefund(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      showSuccess('Refund request queued', 'Mock refund flow: request captured locally while backend endpoints are in progress.');
      setRefundReason('');
      setRefundAmount('');
      setRefundModalOpen(false);
    } finally {
      setSubmittingMockRefund(false);
    }
  }, [detail, refundAmount, refundReason, showError, showSuccess]);

  if (loading) {
    return <div className="p-6 text-sm text-input-placeholder">Loading invoice...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-300">{error}</div>;
  }

  if (!detail) {
    return <div className="p-6 text-sm text-input-placeholder">Invoice not found.</div>;
  }

  if (!practiceId) {
    return <div className="p-6 text-sm text-red-300">Practice context is missing from this route.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      {isDraft ? (
        <WorkspaceListHeader
          leftControls={(
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="icon"
                size="icon-sm"
                aria-label="Close invoice composer"
                onClick={handleBackToList}
                icon={XMarkIcon}
                iconClassName="h-5 w-5"
              />
              <div className="h-5 w-px bg-line-glass/30" aria-hidden="true" />
            </div>
          )}
          title={<h1 className="workspace-header__title">Edit Invoice</h1>}
          controls={(
            <Button type="button" size="sm" onClick={() => formRef.current?.requestSend()}>
              Send Invoice
            </Button>
          )}
          className="px-0 py-0"
        />
      ) : (
        <DetailHeader
          title={detail.invoiceNumber}
          subtitle={`Issued ${renderEventDate(detail.issueDate)} • Due ${renderEventDate(detail.dueDate)} • Paid ${renderEventDate(detail.paidAt)}`}
          showBack={showBack}
          onBack={handleBackToList}
          leadingAction={leadingAction}
          onInspector={onInspector}
          inspectorOpen={inspectorOpen}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              {isActionableOpenStatus(status) ? (
                <>
                  <Button variant="secondary" onClick={handleOpenHostedInvoice} disabled={!hasHostedUrl}>Open Stripe hosted invoice</Button>
                  <Button variant="secondary" onClick={() => void handleSync()}>Sync</Button>
                  <Button variant="danger-ghost" onClick={() => void handleVoid()}>Void</Button>
                </>
              ) : null}
              {status === 'paid' ? (
                <Button variant="secondary" onClick={handleOpenHostedInvoice} disabled={!hasHostedUrl}>Open Stripe hosted invoice</Button>
              ) : null}
              {canMockRefund ? (
                <Button variant="secondary" onClick={() => setRefundModalOpen(true)}>Issue refund (Mock)</Button>
              ) : null}
            </div>
          )}
        />
      )}

      <InvoiceForm
        ref={formRef}
        mode={mode}
        practiceId={practiceId}
        connectedAccountId={detail.sourceInvoice.connected_account_id}
        clientOptions={builderClientOptions}
        matterOptions={builderMatterOptions}
        initialClientId={detail.sourceInvoice.client_id}
        initialMatterId={detail.sourceInvoice.matter_id ?? undefined}
        initialLineItems={detail.lineItems}
        initialDueDate={detail.dueDate ? detail.dueDate.slice(0, 10) : undefined}
        initialNotes={detail.notes ?? undefined}
        initialMemo={detail.memo ?? undefined}
        initialInvoiceType={detail.sourceInvoice.invoice_type}
        existingInvoiceId={detail.id}
        closeAfterSuccess={false}
        hideFooterActions
        onClose={handleBackToList}
        onSuccess={handleBuilderSuccess}
      />

      <Modal
        isOpen={refundModalOpen}
        onClose={() => setRefundModalOpen(false)}
        title="Issue refund (Mock)"
        contentClassName="max-w-xl"
        disableBackdropClick={submittingMockRefund}
      >
        <div className="space-y-4">
          <p className="text-sm text-input-placeholder">
            This flow is currently mocked and does not execute a real backend refund.
          </p>
          <Input
            type="number"
            label="Amount"
            value={refundAmount}
            onChange={setRefundAmount}
            min={0}
            step={0.01}
            placeholder={`Up to ${detail.amountPaid}`}
            disabled={submittingMockRefund}
          />
          <Textarea
            label="Reason"
            value={refundReason}
            onChange={setRefundReason}
            rows={3}
            disabled={submittingMockRefund}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRefundModalOpen(false)} disabled={submittingMockRefund}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmitMockRefund()} disabled={submittingMockRefund}>
              {submittingMockRefund ? 'Submitting...' : 'Queue refund request'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

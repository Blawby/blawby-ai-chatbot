import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { DetailHeader } from '@/shared/ui/layout';
import { InvoiceDetailSkeleton } from '@/features/invoices/components/InvoiceDetailSkeleton';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';
import { InvoiceActivityPanel } from '@/features/invoices/components/detail/InvoiceActivityPanel';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import {
  createRefundRequest,
} from '@/features/invoices/services/invoicesService';
import { useClientInvoiceDetail } from '@/features/invoices/hooks/useInvoiceDetail';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import { Panel } from '@/shared/ui/layout/Panel';
import type { InvoiceDetail, InvoiceStatus } from '@/features/invoices/types';

const renderEventDate = (value: string | null): string => {
  return value ? formatLongDate(value) : '—';
};

const isUnpaidStatus = (status: string): boolean => {
  return !['paid', 'void', 'cancelled'].includes(status.toLowerCase());
};

const VALID_STATUSES: ReadonlyArray<InvoiceStatus> = [
  'staged', 'draft', 'pending', 'sent', 'open', 'overdue', 'paid', 'void', 'cancelled',
];

const isValidStatus = (value: string): value is InvoiceStatus =>
  (VALID_STATUSES as readonly string[]).includes(value);

export function ClientInvoiceDetailPage({
  practiceId,
  practiceSlug,
  invoiceId,
  onInspector,
  inspectorOpen = false,
  showBack = true,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  invoiceId: string | null;
  onInspector?: () => void;
  inspectorOpen?: boolean;
  showBack?: boolean;
}) {
  const { navigate } = useNavigation();
  const { showError, showSuccess, showInfo } = useToastContext();
  const {
    data: detailData,
    isLoading: loading,
    error,
    refetch: refetchDetail,
  } = useClientInvoiceDetail(practiceId, invoiceId);
  const detail: InvoiceDetail | null = detailData ?? null;
  const [requestReason, setRequestReason] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requesting, setRequesting] = useState(false);
  // Refund support flags can shift after a 405/501/404 response from a refund
  // attempt, so they live as local state seeded from detail.
  const [refundRequestSupported, setRefundRequestSupported] = useState(true);
  const [refundRequestError, setRefundRequestError] = useState<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    setRefundRequestSupported(detail.refundRequestSupported);
    setRefundRequestError(detail.refundRequestError);
  }, [detail]);

  const status = useMemo(() => (detail?.status ?? '').toLowerCase(), [detail?.status]);
  const canPay = Boolean(detail && isUnpaidStatus(status) && detail.stripeHostedInvoiceUrl);
  const effectiveShowBack = showBack && Boolean(practiceSlug);

  const handleBackToList = useCallback(() => {
    if (!practiceSlug) return;
    navigate(`/client/${encodeURIComponent(practiceSlug)}/invoices`);
  }, [navigate, practiceSlug]);

  const handleOpenPay = useCallback(() => {
    if (!detail?.stripeHostedInvoiceUrl) {
      showInfo('Invoice', 'Payment link is unavailable for this invoice.');
      return;
    }
    window.open(detail.stripeHostedInvoiceUrl, '_blank', 'noopener,noreferrer');
  }, [detail?.stripeHostedInvoiceUrl, showInfo]);

  const handleRequestRefund = useCallback(async () => {
    if (!practiceId || !invoiceId) return;
    if (!requestReason.trim()) {
      showError('Refund request', 'Please provide a reason.');
      return;
    }

    const parsedAmount = requestAmount.trim().length > 0 ? Number(requestAmount) : undefined;
    if (parsedAmount !== undefined && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      showError('Refund request', 'Amount must be a positive number.');
      return;
    }

    setRequesting(true);
    setRefundRequestError(null);
    try {
      await createRefundRequest(practiceId, invoiceId, {
        reason: requestReason.trim(),
        amount: parsedAmount,
      });
      showSuccess('Refund requested', 'Your refund request has been submitted.');
      setRequestReason('');
      setRequestAmount('');
      await refetchDetail();
    } catch (err) {
      const respStatus = err && typeof err === 'object' ? (err as { status?: number }).status : undefined;
      if (respStatus === 405 || respStatus === 501) {
        setRefundRequestSupported(false);
        showInfo('Refund request unavailable', 'Refund requests are not supported by the backend for this workspace yet.');
        return;
      }
      if (respStatus === 404) {
        const message = err instanceof Error ? err.message : 'Refund request route mismatch (404).';
        setRefundRequestError(message);
        showError('Refund request failed', message);
        return;
      }
      showError('Refund request failed', err instanceof Error ? err.message : 'Unable to request refund');
    } finally {
      setRequesting(false);
    }
  }, [invoiceId, refetchDetail, practiceId, requestAmount, requestReason, showError, showInfo, showSuccess]);

  if (loading && !detail) {
    return <InvoiceDetailSkeleton />;
  }

  if (error && !detail) {
    return <div className="p-6 text-sm text-neg">{error}</div>;
  }

  if (!detail) {
    return <div className="p-6 text-sm text-dim-2">Invoice not found.</div>;
  }

  const statusLabel = typeof detail.status === 'string' ? detail.status : '';
  const headerStatusBadge = isValidStatus(statusLabel) ? (
    <InvoiceStatusBadge status={statusLabel} />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DetailHeader
        title={detail.invoiceNumber}
        subtitle={`Issued ${renderEventDate(detail.issueDate)} • Due ${renderEventDate(detail.dueDate)}`}
        showBack={effectiveShowBack}
        onBack={handleBackToList}
        onInspector={onInspector}
        inspectorOpen={inspectorOpen}
        titleBadge={headerStatusBadge}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canPay ? <Button onClick={handleOpenPay}>Pay</Button> : null}
          </div>
        )}
      />
      <div className="flex-1 overflow-y-auto">
        {/* Main LetterPaper body — replaces the previous summary/line-items panels. */}
        <div className="px-4 pb-2 pt-4 sm:px-6">
          <InvoicePreview
            title={detail.matterTitle || detail.clientName || 'Invoice'}
            referenceLabel={detail.matterId ? `Matter ID: ${detail.matterId}` : null}
            lineItems={detail.lineItems}
            issueDate={detail.issueDate}
            dueDate={detail.dueDate ? detail.dueDate.slice(0, 10) : undefined}
            invoiceNumber={detail.invoiceNumber}
            clientName={detail.clientName}
            clientEmail={detail.clientEmail}
            notes={detail.notes}
          />
        </div>

        {/* Refund request form — constrained to the letter width.
            Payment + refund history live in the inspector slot
            (InvoiceInspector → InvoiceDetailsSidebar). */}
        {refundRequestSupported || refundRequestError ? (
          <div className="mx-auto w-full max-w-[720px] px-4 pb-6 pt-2 sm:px-6">
            <Panel className="rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-ink">Request refund</h3>
              <div className="mt-3 space-y-3">
                <Input
                  type="number"
                  label="Amount (optional)"
                  value={requestAmount}
                  onChange={setRequestAmount}
                  min={0}
                  step={0.01}
                />
                <Textarea
                  label="Reason"
                  value={requestReason}
                  onChange={setRequestReason}
                  rows={3}
                />
                <Button onClick={() => void handleRequestRefund()} disabled={requesting || !refundRequestSupported}>
                  {requesting ? 'Submitting...' : 'Request refund'}
                </Button>
              </div>
              {!refundRequestSupported ? (
                <p className="mt-2 text-xs text-dim-2">
                  Refund requests are currently unavailable for this workspace.
                </p>
              ) : null}
              {refundRequestError ? (
                <p className="mt-2 text-xs text-neg">{refundRequestError}</p>
              ) : null}

              {detail.refundRequests.length > 0 ? (
                <>
                  <h4 className="mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-dim-2">Refund request timeline</h4>
                  <ol className="mt-2 space-y-2 text-sm">
                    {detail.refundRequests.map((request) => (
                      <li key={request.id} className="rounded-r-md border border-line-subtle px-3 py-2">
                        <p className="font-medium text-ink">{request.status}</p>
                        <p className="text-xs text-dim-2">{renderEventDate(request.createdAt)}</p>
                        {request.reason ? <p className="mt-1 text-xs text-dim-2">{request.reason}</p> : null}
                      </li>
                    ))}
                  </ol>
                </>
              ) : null}
            </Panel>
          </div>
        ) : null}

        {/* Audit-side activity below the letter. */}
        <div className="px-4 pb-8 sm:px-6">
          <InvoiceActivityPanel detail={detail} variant="audit" />
        </div>
      </div>
    </div>
  );
}

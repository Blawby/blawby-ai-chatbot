import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatLongDate } from '@/shared/utils/dateFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useNavigation } from '@/shared/utils/navigation';
import { getMajorAmountValue } from '@/shared/utils/money';
import {
  getClientInvoice,
  createRefundRequest,
} from '@/features/invoices/services/invoicesService';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceDetail } from '@/features/invoices/types';

const renderEventDate = (value: string | null): string => {
  return value ? formatLongDate(value) : '—';
};

const isUnpaidStatus = (status: string): boolean => {
  return !['paid', 'void', 'cancelled'].includes(status.toLowerCase());
};

export function ClientInvoiceDetailPage({
  practiceId,
  practiceSlug,
  invoiceId,
  headerActions,
  showBack = true,
}: {
  practiceId: string | null;
  practiceSlug: string | null;
  invoiceId: string | null;
  headerActions?: ComponentChildren;
  showBack?: boolean;
}) {
  const { navigate } = useNavigation();
  const { showError, showSuccess, showInfo } = useToastContext();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [refundRequestSupported, setRefundRequestSupported] = useState(true);
  const [refundRequestError, setRefundRequestError] = useState<string | null>(null);

  const loadDetail = useCallback((signal?: AbortSignal) => {
    if (!practiceId || !invoiceId) return Promise.resolve();
    setLoading(true);
    setError(null);

    return getClientInvoice(practiceId, invoiceId, { signal })
      .then((result) => {
        if (!result) {
          setDetail(null);
          setError('Invoice not found.');
          return;
        }
        setDetail(result);
        setRefundRequestSupported(result.refundRequestSupported);
        setRefundRequestError(result.refundRequestError);
        if (result.refundRequestError) {
          showError('Invoices', result.refundRequestError);
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'Failed to load invoice';
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [invoiceId, practiceId, showError]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  const status = useMemo(() => (detail?.status ?? '').toLowerCase(), [detail?.status]);
  const canPay = Boolean(detail && isUnpaidStatus(status) && detail.stripeHostedInvoiceUrl);


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
      await loadDetail();
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
  }, [invoiceId, loadDetail, practiceId, requestAmount, requestReason, showError, showInfo, showSuccess]);

  if (loading) {
    return <div className="p-6 text-sm text-input-placeholder">Loading invoice...</div>;
  }

  if (error) {
    return <div className="p-6 text-sm text-red-300">{error}</div>;
  }

  if (!detail) {
    return <div className="p-6 text-sm text-input-placeholder">Invoice not found.</div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <DetailHeader
        title={detail.invoiceNumber}
        subtitle={`Issued ${renderEventDate(detail.issueDate)} • Due ${renderEventDate(detail.dueDate)}`}
        showBack={showBack}
        onBack={handleBackToList}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {canPay ? <Button onClick={handleOpenPay}>Pay</Button> : null}
            {detail.downloadUrl ? (
              <Button variant="secondary" onClick={() => window.open(detail.downloadUrl as string, '_blank', 'noopener,noreferrer')}>
                Download
              </Button>
            ) : null}
            {detail.receiptUrl ? (
              <Button variant="secondary" onClick={() => window.open(detail.receiptUrl as string, '_blank', 'noopener,noreferrer')}>
                Receipt
              </Button>
            ) : null}
            {headerActions}
          </div>
        )}
      />
      <div className="mt-1">
        <InvoiceStatusBadge status={detail.status} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-input-placeholder">Total</p>
          <p className="mt-1 text-lg font-semibold text-input-text">{formatCurrency(detail.total)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-input-placeholder">Amount paid</p>
          <p className="mt-1 text-lg font-semibold text-input-text">{formatCurrency(detail.amountPaid)}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="text-xs uppercase tracking-[0.08em] text-input-placeholder">Amount due</p>
          <p className="mt-1 text-lg font-semibold text-input-text">{formatCurrency(detail.amountDue)}</p>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="border-b border-line-glass/30 px-4 py-3">
          <h2 className="text-base font-semibold text-input-text">Line items</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-line-glass/30 text-xs uppercase tracking-[0.08em] text-input-placeholder">
              <tr>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.lineItems.map((item) => (
                <tr key={item.id} className="border-b border-line-glass/20 last:border-b-0">
                  <td className="px-4 py-3 text-input-text">{item.description || '—'}</td>
                  <td className="px-4 py-3 text-input-text">{item.type}</td>
                  <td className="px-4 py-3 text-right text-input-text">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-input-text">{formatCurrency(getMajorAmountValue(item.unit_price))}</td>
                  <td className="px-4 py-3 text-right font-semibold text-input-text">{formatCurrency(getMajorAmountValue(item.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass-panel p-4">
          <h3 className="text-sm font-semibold text-input-text">Payment history</h3>
          {detail.payments.length === 0 ? (
            <p className="mt-2 text-sm text-input-placeholder">No payment history available.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {detail.payments.map((payment) => (
                <li key={payment.id} className="rounded-lg border border-line-glass/20 px-3 py-2">
                  <p className="font-medium text-input-text">{formatCurrency(payment.amount)} • {payment.status}</p>
                  <p className="text-xs text-input-placeholder">{renderEventDate(payment.paidAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-panel p-4">
          <h3 className="text-sm font-semibold text-input-text">Refund history</h3>
          {detail.refunds.length === 0 ? (
            <p className="mt-2 text-sm text-input-placeholder">No refunds for this invoice.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {detail.refunds.map((refund) => (
                <li key={refund.id} className="rounded-lg border border-line-glass/20 px-3 py-2">
                  <p className="font-medium text-input-text">{formatCurrency(refund.amount)} • {refund.status}</p>
                  <p className="text-xs text-input-placeholder">{renderEventDate(refund.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-panel p-4">
          <h3 className="text-sm font-semibold text-input-text">Request refund</h3>
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
            <p className="mt-2 text-xs text-input-placeholder">
              Refund requests are currently unavailable for this workspace.
            </p>
          ) : null}
          {refundRequestError ? (
            <p className="mt-2 text-xs text-red-300">{refundRequestError}</p>
          ) : null}

          <h4 className="mt-5 text-xs font-semibold uppercase tracking-[0.08em] text-input-placeholder">Refund request timeline</h4>
          {detail.refundRequests.length === 0 ? (
            <p className="mt-2 text-sm text-input-placeholder">No refund requests yet.</p>
          ) : (
            <ol className="mt-2 space-y-2 text-sm">
              {detail.refundRequests.map((request) => (
                <li key={request.id} className="rounded-lg border border-line-glass/20 px-3 py-2">
                  <p className="font-medium text-input-text">{request.status}</p>
                  <p className="text-xs text-input-placeholder">{renderEventDate(request.createdAt)}</p>
                  {request.reason ? <p className="mt-1 text-xs text-input-placeholder">{request.reason}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

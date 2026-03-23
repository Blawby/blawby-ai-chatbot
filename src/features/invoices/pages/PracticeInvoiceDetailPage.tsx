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
import { LineItemsBuilder } from '@/features/invoices/components/LineItemsBuilder';
import {
  deleteInvoice,
  getInvoice,
  sendInvoice,
  syncInvoice,
  updateInvoice,
  voidInvoice,
} from '@/features/invoices/services/invoicesService';
import { InvoiceStatusBadge } from '@/features/invoices/components/InvoiceStatusBadge';
import type { InvoiceDetail } from '@/features/invoices/types';
import type { InvoiceLineItem } from '@/features/matters/types/billing.types';

const isActionableOpenStatus = (status: string): boolean => {
  return ['sent', 'pending', 'open', 'overdue'].includes(status);
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
  const { showError, showSuccess, showInfo } = useToastContext();
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [memo, setMemo] = useState('');
  const [dueDate, setDueDate] = useState('');

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
        setLineItems(result.lineItems);
        setNotes(result.notes ?? '');
        setMemo(result.memo ?? '');
        setDueDate(result.dueDate ? result.dueDate.slice(0, 10) : '');
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

  const status = useMemo(() => (detail?.status ?? 'draft').toLowerCase(), [detail?.status]);

  const hasHostedUrl = Boolean(detail?.stripeHostedInvoiceUrl);

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

  const handleSend = useCallback(async () => {
    if (!practiceId || !invoiceId) return;
    try {
      await sendInvoice(practiceId, invoiceId);
      showSuccess('Invoice sent', 'The invoice was sent successfully.');
      await loadDetail();
    } catch (err) {
      showError('Invoice send failed', err instanceof Error ? err.message : 'Failed to send invoice');
    }
  }, [invoiceId, loadDetail, practiceId, showError, showSuccess]);

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

  const handleDelete = useCallback(async () => {
    if (!practiceId || !invoiceId) return;
    const confirmed = window.confirm('Delete this draft invoice?');
    if (!confirmed) return;

    try {
      await deleteInvoice(practiceId, invoiceId);
      showSuccess('Invoice deleted', 'Draft invoice deleted.');
      handleBackToList();
    } catch (err) {
      showError('Invoice delete failed', err instanceof Error ? err.message : 'Failed to delete invoice');
    }
  }, [handleBackToList, invoiceId, practiceId, showError, showSuccess]);
  const handleCancelEdit = useCallback(() => {
    if (detail) {
      setLineItems(detail.lineItems);
      setNotes(detail.notes ?? '');
      setMemo(detail.memo ?? '');
      setDueDate(detail.dueDate ? detail.dueDate.slice(0, 10) : '');
    }
    setEditing(false);
  }, [detail]);

  const handleSaveEdit = useCallback(async () => {
    if (!practiceId || !invoiceId || !detail) return;
    setSavingEdit(true);
    try {
      let localDueDate: string | undefined;
      const dueDateTrimmed = dueDate.trim();
      if (dueDateTrimmed) {
        const parts = dueDateTrimmed.split('-').map(Number);
        if (parts.length === 3 && parts.every((p) => !Number.isNaN(p))) {
          const [year, month, day] = parts;
          localDueDate = new Date(year, month - 1, day).toISOString();
        }
      }

      await updateInvoice(practiceId, invoiceId, {
        line_items: lineItems,
        notes: notes.trim() || undefined,
        memo: memo.trim() || undefined,
        due_date: localDueDate,
        invoice_type: detail.sourceInvoice.invoice_type,
      });
      showSuccess('Invoice updated', 'Draft invoice has been updated.');
      setEditing(false);
      await loadDetail();
    } catch (err) {
      showError('Invoice update failed', err instanceof Error ? err.message : 'Failed to update invoice');
    } finally {
      setSavingEdit(false);
    }
  }, [detail, dueDate, invoiceId, lineItems, loadDetail, memo, notes, practiceId, showError, showSuccess]);

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
        subtitle={`Issued ${renderEventDate(detail.issueDate)} • Due ${renderEventDate(detail.dueDate)} • Paid ${renderEventDate(detail.paidAt)}`}
        showBack={showBack}
        onBack={handleBackToList}
        leadingAction={leadingAction}
        onInspector={onInspector}
        inspectorOpen={inspectorOpen}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            {status === 'draft' ? (
              <>
                <Button variant="secondary" onClick={() => setEditing((prev) => !prev)}>{editing ? 'Close edit' : 'Edit'}</Button>
                <Button onClick={() => void handleSend()}>Send</Button>
                <Button variant="danger-ghost" onClick={() => void handleDelete()}>Delete</Button>
              </>
            ) : null}
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

      {editing ? (
        <div className="glass-panel p-4">
          <h2 className="text-base font-semibold text-input-text">Edit draft invoice</h2>
          <p className="mt-1 text-sm text-input-placeholder">Inline editing for draft invoices.</p>
          <div className="mt-4 space-y-4">
            <LineItemsBuilder lineItems={lineItems} onChange={setLineItems} />
            <Input type="date" label="Due date" value={dueDate} onChange={setDueDate} />
            <Textarea label="Notes" value={notes} onChange={setNotes} rows={3} />
            <Textarea label="Memo" value={memo} onChange={setMemo} rows={2} />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={handleCancelEdit}>Cancel</Button>
              <Button onClick={() => void handleSaveEdit()} disabled={savingEdit}>{savingEdit ? 'Saving...' : 'Save changes'}</Button>
            </div>
          </div>
        </div>
      ) : null}

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
          <h3 className="text-sm font-semibold text-input-text">Activity & payments</h3>
          {detail.payments.length === 0 ? (
            <p className="mt-2 text-sm text-input-placeholder">No payment history.</p>
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
            <p className="mt-2 text-sm text-input-placeholder">No refunds on this invoice.</p>
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
          <h3 className="text-sm font-semibold text-input-text">Refund tooling</h3>
          <p className="mt-2 text-sm text-input-placeholder">
            Direct refund actions are disabled until backend refund execution endpoints are available.
          </p>
          <Button variant="secondary" size="sm" className="mt-3" disabled>
            Issue refund (Unavailable)
          </Button>
          {detail.refundRequests.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {detail.refundRequests.map((request) => (
                <li key={request.id} className="rounded-lg border border-line-glass/20 px-3 py-2">
                  <p className="font-medium text-input-text">{request.status}</p>
                  <p className="text-xs text-input-placeholder">{renderEventDate(request.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

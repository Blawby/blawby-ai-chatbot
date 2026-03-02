import { useEffect, useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Input, Textarea } from '@/shared/ui/input';
import { asMajor, getMajorAmountValue, safeAdd } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { createInvoice, sendInvoice, updateInvoice } from '@/features/matters/services/invoicesApi';
import { LineItemsBuilder } from '@/features/matters/components/billing/LineItemsBuilder';
import { InvoicePreview } from '@/features/matters/components/billing/InvoicePreview';
import { SendInvoiceDialog } from '@/features/matters/components/billing/SendInvoiceDialog';

type InvoiceBuilderProps = {
  practiceId: string;
  matter: MatterDetail;
  connectedAccountId?: string | null;
  initialLineItems?: InvoiceLineItem[];
  initialDueDate?: string;
  initialNotes?: string;
  initialMemo?: string;
  initialInvoiceType?: Invoice['invoice_type'];
  editMode?: boolean;
  invoiceContext?: 'default' | 'milestone' | 'retainer';
  existingInvoiceId?: string;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildDefaultDueDate = () => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 30);
  return next.toISOString().slice(0, 10);
};

const detectDefaultInvoiceType = (
  items: InvoiceLineItem[],
  context: 'default' | 'milestone' | 'retainer',
  billingType: MatterDetail['billingType'],
  fallback?: Invoice['invoice_type']
): Invoice['invoice_type'] => {
  if (fallback) return fallback;
  if (context === 'milestone') return 'phase_fee';
  if (context === 'retainer') return 'retainer_deposit';
  if (items.length === 0) return 'retainer_deposit';
  if (items.some((item) => typeof item.description === 'string' && /retainer/i.test(item.description))) {
    return 'retainer_deposit';
  }
  if (billingType === 'fixed') return 'flat_fee';
  if (billingType === 'hourly') return 'hourly';
  if (billingType === 'contingency') return 'contingency';
  return 'flat_fee';
};

export const InvoiceBuilder = ({
  practiceId,
  matter,
  connectedAccountId = null,
  initialLineItems = [],
  initialDueDate,
  initialNotes,
  initialMemo,
  initialInvoiceType,
  editMode = false,
  invoiceContext = 'default',
  existingInvoiceId,
  onClose,
  onSuccess
}: InvoiceBuilderProps) => {
  const { showError } = useToastContext();
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>(initialLineItems);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [memo, setMemo] = useState(initialMemo ?? '');
  const [dueDate, setDueDate] = useState(initialDueDate ?? buildDefaultDueDate());
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(
    editMode ? existingInvoiceId ?? null : null
  );
  const [sendError, setSendError] = useState<string | null>(null);
  const [invoiceType, setInvoiceType] = useState<Invoice['invoice_type']>(
    detectDefaultInvoiceType(initialLineItems, invoiceContext, matter.billingType, initialInvoiceType)
  );
  const invoiceTypeFieldId = useMemo(() => `invoice-type-${matter.id}`, [matter.id]);



  const total = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      return safeAdd(acc, item.line_total);
    }, asMajor(0));
  }, [lineItems]);

  const isValidConnectedAccount = useMemo(
    () => Boolean(connectedAccountId && UUID_REGEX.test(connectedAccountId)),
    [connectedAccountId]
  );
  const disableActions = isSaving || isSending || !isValidConnectedAccount || lineItems.length === 0;

  const logInvoiceAction = (action: string, details: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.info('[Billing][InvoiceBuilder]', action, details);
    }
  };

  const buildCreatePayload = (accountId: string) => ({
    client_id: matter.clientId,
    matter_id: matter.id,
    connected_account_id: accountId,
    invoice_type: invoiceType,
    due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
    notes: notes.trim() || undefined,
    memo: memo.trim() || undefined,
    line_items: lineItems
  });

  const buildUpdatePayload = () => ({
    due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
    notes: notes.trim() || undefined,
    memo: memo.trim() || undefined,
    invoice_type: invoiceType,
    line_items: lineItems
  });

  const handleSaveDraft = async () => {
    if (disableActions || !connectedAccountId) return;
    setIsSaving(true);
    setSendError(null);
    try {
      if (editMode && existingInvoiceId) {
        const payload = buildUpdatePayload();
        logInvoiceAction('update-draft', {
          invoiceId: existingInvoiceId,
          invoiceType: payload.invoice_type
        });
        await updateInvoice(practiceId, existingInvoiceId, payload);
        setCreatedInvoiceId(existingInvoiceId);
      } else {
        const payload = buildCreatePayload(connectedAccountId);
        logInvoiceAction('create-draft', {
          connectedAccountId: payload.connected_account_id,
          invoiceType: payload.invoice_type,
          lineItemCount: payload.line_items.length
        });
        const created = await createInvoice(practiceId, payload);
        setCreatedInvoiceId(created?.id ?? null);
      }
      await onSuccess();
      onClose();
    } catch (error) {
      showError('Could not save invoice', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvoice = async () => {
    if (disableActions || !connectedAccountId) return;
    setIsSending(true);
    setSendError(null);
    let invoiceId = createdInvoiceId;
    try {
      if (editMode && existingInvoiceId) {
        const payload = buildUpdatePayload();
        logInvoiceAction('update-before-send', {
          invoiceId: existingInvoiceId,
          invoiceType: payload.invoice_type
        });
        await updateInvoice(practiceId, existingInvoiceId, payload);
        invoiceId = existingInvoiceId;
        setCreatedInvoiceId(existingInvoiceId);
      } else if (!invoiceId) {
        const payload = buildCreatePayload(connectedAccountId);
        logInvoiceAction('create-before-send', {
          connectedAccountId: payload.connected_account_id,
          invoiceType: payload.invoice_type,
          lineItemCount: payload.line_items.length
        });
        const created = await createInvoice(practiceId, payload);
        invoiceId = created?.id ?? null;
        if (!invoiceId) throw new Error('Invoice ID missing in create response.');
        setCreatedInvoiceId(invoiceId);
      }

      if (!invoiceId) {
        throw new Error('Invoice ID missing in create response.');
      }

      logInvoiceAction('send', { invoiceId, invoiceType });
      await sendInvoice(practiceId, invoiceId);
      await onSuccess();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send invoice';
      setSendError(
        invoiceId ? `${message}. Invoice draft saved - click Send again to retry.` : message
      );
    } finally {
      setIsSending(false);
      setShowSendDialog(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoiceDialogTitle"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isSaving && !isSending) onClose();
      }}
    >
      <div className="flex h-[90vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-2xl border border-line-glass/30 bg-surface">
        <header className="flex items-center justify-between border-b border-line-glass/30 px-6 py-4">
          <div>
            <h2 id="invoiceDialogTitle" className="text-base font-semibold text-input-text">Create Invoice</h2>
            <p className="text-xs text-input-placeholder">{matter.title}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_520px]">
          <div className="min-h-0 overflow-y-auto p-6">
            <div className="space-y-5">
              {!isValidConnectedAccount ? (
                <div className="status-warning rounded-xl px-4 py-3 text-sm">
                  Complete Stripe onboarding to enable invoicing.
                </div>
              ) : null}
              <LineItemsBuilder lineItems={lineItems} onChange={setLineItems} />
              <div>
                <label className="block text-sm font-semibold text-input-text" htmlFor={invoiceTypeFieldId}>
                  Invoice type
                </label>
                <select
                  id={invoiceTypeFieldId}
                  className="mt-2 w-full rounded-xl border border-line-glass/40 bg-transparent px-3 py-2 text-sm text-input-text focus:border-accent-500 focus:outline-none"
                  value={invoiceType}
                  onChange={(event) => setInvoiceType(event.currentTarget.value as Invoice['invoice_type'])}
                >
                  <option value="flat_fee">Flat fee</option>
                  <option value="hourly">Hourly</option>
                  <option value="phase_fee">Milestone / phase fee</option>
                  <option value="retainer_deposit">Retainer deposit</option>
                  <option value="contingency">Contingency fee</option>
                </select>
                <p className="mt-1 text-xs text-input-placeholder">
                  Choose how this invoice should be categorized for billing.
                </p>
              </div>
              <Input
                label="Due date"
                type="date"
                value={dueDate}
                onChange={setDueDate}
              />
              <Textarea label="Notes to client" value={notes} onChange={setNotes} rows={3} />
              <Textarea label="Internal memo" value={memo} onChange={setMemo} rows={2} />
              {sendError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  <p>{sendError}</p>
                  {createdInvoiceId ? (
                    <div className="mt-2">
                      <Button size="sm" onClick={handleSendInvoice} disabled={isSending}>
                        Retry send
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto border-l border-line-glass/30 bg-surface/50 p-6">
            <h3 className="mb-3 text-sm font-semibold text-input-text">Preview</h3>
            <InvoicePreview matter={matter} lineItems={lineItems} dueDate={dueDate} />
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-line-glass/30 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm font-semibold text-input-text">
            Total: {formatCurrency(total)}
          </p>
          {!isValidConnectedAccount ? (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              <strong className="block font-semibold">Payment account not connected.</strong>
              Finish Stripe onboarding to save or send invoices.
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => void handleSaveDraft()} disabled={disableActions}>
              {isSaving ? 'Saving...' : 'Save draft'}
            </Button>
            <Button onClick={() => setShowSendDialog(true)} disabled={disableActions}>
              Send invoice
            </Button>
          </div>
        </footer>
      </div>

      <SendInvoiceDialog
        isOpen={showSendDialog}
        totalAmount={total}
        onConfirm={handleSendInvoice}
        onCancel={() => setShowSendDialog(false)}
        loading={isSending}
      />
    </div>
  );
};

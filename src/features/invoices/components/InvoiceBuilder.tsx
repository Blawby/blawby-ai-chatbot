import { useMemo, useState } from 'preact/hooks';
import { Button } from '@/shared/ui/Button';
import { Combobox, Input, Textarea } from '@/shared/ui/input';
import { asMajor, safeAdd } from '@/shared/utils/money';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { createInvoice, sendInvoice, updateInvoice } from '@/features/invoices/services/invoicesService';
import { LineItemsBuilder } from '@/features/invoices/components/LineItemsBuilder';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';
import { SendInvoiceDialog } from '@/features/invoices/components/SendInvoiceDialog';

type InvoiceBuilderProps = {
  practiceId: string;
  matter?: MatterDetail | null;
  connectedAccountId?: string | null;
  clientOptions?: Array<{ value: string; label: string; meta?: string }>;
  matterOptions?: Array<{ value: string; label: string; meta?: string }>;
  initialClientId?: string;
  initialMatterId?: string;
  initialLineItems?: InvoiceLineItem[];
  initialDueDate?: string;
  initialNotes?: string;
  initialMemo?: string;
  initialInvoiceType?: Invoice['invoice_type'];
  editMode?: boolean;
  invoiceContext?: 'default' | 'milestone' | 'retainer';
  existingInvoiceId?: string;
  closeAfterSuccess?: boolean;
  onClose: () => void;
  onSuccess: (invoiceId?: string | null) => Promise<void> | void;
};

type InvoiceUpdatePayload = {
  due_date?: string;
  notes?: string;
  memo?: string;
  invoice_type: Invoice['invoice_type'];
  line_items: InvoiceLineItem[];
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildDefaultDueDate = () => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 30);
  return next.toISOString().slice(0, 10);
};

const INVOICE_TYPE_OPTIONS = [
  { value: 'flat_fee', label: 'Flat fee' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'phase_fee', label: 'Milestone / phase fee' },
  { value: 'retainer_deposit', label: 'Retainer deposit' },
  { value: 'contingency', label: 'Contingency fee' },
] satisfies Array<{ value: Invoice['invoice_type']; label: string }>;

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

const buildInvoiceUpdatePayload = ({
  dueDate,
  notes,
  memo,
  invoiceType,
  lineItems
}: {
  dueDate: string;
  notes: string;
  memo: string;
  invoiceType: Invoice['invoice_type'];
  lineItems: InvoiceLineItem[];
}): InvoiceUpdatePayload => ({
  due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
  notes: notes.trim() || undefined,
  memo: memo.trim() || undefined,
  invoice_type: invoiceType,
  line_items: lineItems
});

const serializeInvoiceUpdatePayload = (payload: InvoiceUpdatePayload) => JSON.stringify(payload);

export const InvoiceBuilder = ({
  practiceId,
  matter = null,
  connectedAccountId = null,
  clientOptions = [],
  matterOptions = [],
  initialClientId,
  initialMatterId,
  initialLineItems = [],
  initialDueDate,
  initialNotes,
  initialMemo,
  initialInvoiceType,
  editMode = false,
  invoiceContext = 'default',
  existingInvoiceId,
  closeAfterSuccess = true,
  onClose,
  onSuccess
}: InvoiceBuilderProps) => {
  const { showError } = useToastContext();
  const defaultInvoiceType = detectDefaultInvoiceType(
    initialLineItems,
    invoiceContext,
    matter?.billingType ?? 'fixed',
    initialInvoiceType
  );
  const [clientId, setClientId] = useState(initialClientId ?? matter?.clientId ?? '');
  const [matterId, setMatterId] = useState(initialMatterId ?? matter?.id ?? '');
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
  const [lastPersistedSnapshot, setLastPersistedSnapshot] = useState<string | null>(() => (
    editMode && existingInvoiceId
      ? serializeInvoiceUpdatePayload(
          buildInvoiceUpdatePayload({
            dueDate: initialDueDate ?? buildDefaultDueDate(),
            notes: initialNotes ?? '',
            memo: initialMemo ?? '',
            invoiceType: defaultInvoiceType,
            lineItems: initialLineItems
          })
        )
      : null
  ));
  const [sendError, setSendError] = useState<string | null>(null);
  const [invoiceType, setInvoiceType] = useState<Invoice['invoice_type']>(defaultInvoiceType);
  const isMatterScoped = Boolean(matter);
  const resolvedMatterId = isMatterScoped ? matter?.id ?? '' : matterId;
  const resolvedClientId = isMatterScoped ? matter?.clientId ?? '' : clientId;
  const resolvedMatterLabel = isMatterScoped
    ? (matter?.title ?? 'Matter invoice')
    : (matterOptions.find((option) => option.value === matterId)?.label ?? '');
  const resolvedClientLabel = isMatterScoped
    ? matter?.clientName ?? ''
    : (clientOptions.find((option) => option.value === clientId)?.label ?? '');
  const previewTitle = resolvedMatterLabel || resolvedClientLabel || 'Draft invoice';
  const previewReferenceLabel = resolvedMatterId
    ? `Matter ID: ${resolvedMatterId}`
    : resolvedClientLabel
      ? `Person: ${resolvedClientLabel}`
      : null;
  const handleClientChange = (nextClientId: string) => {
    setClientId(nextClientId);
    setMatterId((currentMatterId) => {
      if (!currentMatterId) return currentMatterId;
      const selectedMatter = matterOptions.find((option) => option.value === currentMatterId);
      const matterClientId = typeof selectedMatter?.meta === 'string' ? selectedMatter.meta : null;
      return !matterClientId || matterClientId === nextClientId ? currentMatterId : '';
    });
  };

  const total = useMemo(() => {
    return lineItems.reduce((acc, item) => {
      return safeAdd(acc, item.line_total);
    }, asMajor(0));
  }, [lineItems]);
  const currentUpdatePayload = useMemo(
    () => buildInvoiceUpdatePayload({ dueDate, notes, memo, invoiceType, lineItems }),
    [dueDate, notes, memo, invoiceType, lineItems]
  );
  const currentUpdateSnapshot = useMemo(
    () => serializeInvoiceUpdatePayload(currentUpdatePayload),
    [currentUpdatePayload]
  );
  const previewIssueDate = useMemo(() => {
    if (!currentUpdatePayload.due_date) return null;
    const issueDate = new Date(currentUpdatePayload.due_date);
    issueDate.setUTCDate(issueDate.getUTCDate() - 30);
    return issueDate.toISOString();
  }, [currentUpdatePayload.due_date]);

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
    client_id: resolvedClientId,
    matter_id: resolvedMatterId || undefined,
    connected_account_id: accountId,
    invoice_type: invoiceType,
    due_date: dueDate ? new Date(`${dueDate}T00:00:00.000Z`).toISOString() : undefined,
    notes: notes.trim() || undefined,
    memo: memo.trim() || undefined,
    line_items: lineItems
  });

  const finalizeSuccess = async (invoiceId: string | null) => {
    await onSuccess(invoiceId);
    if (closeAfterSuccess) {
      onClose();
    }
  };

  const handleSaveDraft = async () => {
    if (!resolvedClientId) {
      showError('Could not save invoice', 'Choose a person before creating the invoice.');
      return;
    }
    if (disableActions || !connectedAccountId) return;
    setIsSaving(true);
    setSendError(null);
    try {
      const targetInvoiceId = existingInvoiceId ?? createdInvoiceId;
      let nextInvoiceId: string | null = targetInvoiceId;
      if (targetInvoiceId) {
        const payload = currentUpdatePayload;
        logInvoiceAction('update-draft', {
          invoiceId: targetInvoiceId,
          invoiceType: payload.invoice_type
        });
        const updated = await updateInvoice(practiceId, targetInvoiceId, payload);
        nextInvoiceId = updated?.id ?? targetInvoiceId;
        setCreatedInvoiceId(nextInvoiceId);
        setLastPersistedSnapshot(currentUpdateSnapshot);
      } else {
        const payload = buildCreatePayload(connectedAccountId);
        logInvoiceAction('create-draft', {
          connectedAccountId: payload.connected_account_id,
          invoiceType: payload.invoice_type,
          lineItemCount: payload.line_items.length
        });
        const created = await createInvoice(practiceId, payload);
        nextInvoiceId = created?.id ?? null;
        setCreatedInvoiceId(nextInvoiceId);
        setLastPersistedSnapshot(currentUpdateSnapshot);
      }
      await finalizeSuccess(nextInvoiceId);
    } catch (error) {
      showError('Could not save invoice', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvoice = async () => {
    if (!resolvedClientId) {
      showError('Could not send invoice', 'Choose a person before creating the invoice.');
      return;
    }
    if (disableActions || !connectedAccountId) return;
    setIsSending(true);
    setSendError(null);
    let invoiceId = createdInvoiceId;
    try {
      if (editMode && existingInvoiceId) {
        const payload = currentUpdatePayload;
        logInvoiceAction('update-before-send', {
          invoiceId: existingInvoiceId,
          invoiceType: payload.invoice_type
        });
        const updated = await updateInvoice(practiceId, existingInvoiceId, payload);
        invoiceId = updated?.id ?? existingInvoiceId;
        setCreatedInvoiceId(invoiceId);
        setLastPersistedSnapshot(currentUpdateSnapshot);
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
        setLastPersistedSnapshot(currentUpdateSnapshot);
      } else if (lastPersistedSnapshot !== currentUpdateSnapshot) {
        const payload = currentUpdatePayload;
        logInvoiceAction('update-retry-before-send', {
          invoiceId,
          invoiceType: payload.invoice_type
        });
        const updated = await updateInvoice(practiceId, invoiceId, payload);
        invoiceId = updated?.id ?? invoiceId;
        setCreatedInvoiceId(invoiceId);
        setLastPersistedSnapshot(currentUpdateSnapshot);
      }

      if (!invoiceId) {
        throw new Error('Invoice ID missing in create response.');
      }

      logInvoiceAction('send', { invoiceId, invoiceType });
      await sendInvoice(practiceId, invoiceId);
      await finalizeSuccess(invoiceId);
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
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
        <div className="grid min-h-0 flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:gap-10">
          <div className="min-h-0 overflow-y-auto">
            <div className="space-y-5">
              {!isValidConnectedAccount ? (
                <div className="status-warning rounded-xl px-4 py-3 text-sm">
                  Complete Stripe onboarding to enable invoicing.
                </div>
              ) : null}
              {!isMatterScoped ? (
                <div className="space-y-4">
                  <Combobox
                    label="Person"
                    value={clientId}
                    onChange={handleClientChange}
                    options={clientOptions}
                    placeholder="Choose a person"
                  />
                  <Combobox
                    label="Matter (optional)"
                    value={matterId}
                    onChange={setMatterId}
                    options={matterOptions.filter((option) => {
                      if (!clientId) return true;
                      const clientMatch = typeof option.meta === 'string' ? option.meta : null;
                      return !clientMatch || clientMatch === clientId;
                    }).map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                    placeholder={clientId ? 'Link a matter' : 'Choose a person first'}
                    disabled={!clientId}
                    clearable
                  />
                  <Combobox
                    label="Invoice type"
                    value={invoiceType}
                    onChange={(nextValue) => setInvoiceType(nextValue as Invoice['invoice_type'])}
                    options={INVOICE_TYPE_OPTIONS}
                    searchable={false}
                    clearable={false}
                  />
                </div>
              ) : (
                <Combobox
                  label="Invoice type"
                  value={invoiceType}
                  onChange={(nextValue) => setInvoiceType(nextValue as Invoice['invoice_type'])}
                  options={INVOICE_TYPE_OPTIONS}
                  searchable={false}
                  clearable={false}
                />
              )}
              <LineItemsBuilder lineItems={lineItems} onChange={setLineItems} />
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

          <div className="min-h-0 overflow-y-auto">
            <h3 className="mb-3 text-sm font-semibold text-input-text">Preview</h3>
            <InvoicePreview
              title={previewTitle}
              referenceLabel={previewReferenceLabel}
              lineItems={lineItems}
              issueDate={previewIssueDate}
              dueDate={dueDate}
            />
          </div>
        </div>

        <footer className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
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
            <Button variant="secondary" onClick={onClose} disabled={isSaving || isSending}>
              Cancel
            </Button>
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

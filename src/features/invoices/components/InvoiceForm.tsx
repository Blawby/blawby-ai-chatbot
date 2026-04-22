import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { forwardRef, useImperativeHandle } from 'preact/compat';
import { Button } from '@/shared/ui/Button';
import { Combobox, Input, Textarea } from '@/shared/ui/input';
import { asMajor, safeAdd } from '@/shared/utils/money';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import type { Invoice, InvoiceLineItem } from '@/features/matters/types/billing.types';
import { createInvoice, sendInvoice, updateInvoice } from '@/features/invoices/services/invoicesService';
import { InvoiceLineItemsForm } from '@/features/invoices/components/InvoiceLineItemsForm';
import { InvoicePreview } from '@/features/invoices/components/InvoicePreview';
import { SendInvoiceDialog } from '@/features/invoices/components/SendInvoiceDialog';
import type { InvoicePageMode } from '@/features/invoices/utils/invoicePageConfig';
import { ContentWithPreview } from '@/shared/ui/layout';
import { Tabs } from '@/shared/ui/tabs';

type InvoiceFormProps = {
  mode?: InvoicePageMode;
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
  readOnly?: boolean;
  invoiceContext?: 'default' | 'milestone' | 'retainer';
  existingInvoiceId?: string;
  closeAfterSuccess?: boolean;
  onClose: () => void;
  onSuccess: (invoiceId?: string | null) => Promise<void> | void;
  /** Practice name shown in the invoice preview and send dialog */
  practiceName?: string | null;
  /** Absolute URL for the practice logo (already resolved via R2 proxy) */
  practiceLogoUrl?: string | null;
  /** Practice e-mail used in the "From" block of the preview */
  practiceEmail?: string | null;
  /** Practice billing increment in minutes (e.g. 6 for 0.1h steps) */
  billingIncrementMinutes?: number | null;
};

export type InvoiceFormHandle = {
  requestSend: () => void;
};

type InvoiceUpdatePayload = {
  due_date?: string;
  notes?: string;
  memo?: string;
  invoice_type: Invoice['invoice_type'];
  line_items: InvoiceLineItem[];
};

type InvoicePreviewTab = 'pdf' | 'email';

const INVOICE_PREVIEW_TABS = [
  { id: 'pdf', label: 'PDF' },
  { id: 'email', label: 'Email' },
];

const InvoiceEmailPlaceholder = () => (
  <div className="rounded-xl border border-line-glass/40 bg-surface-card p-5 text-sm shadow-glass">
    <p className="font-semibold text-input-text">Email preview</p>
    <p className="mt-2 text-input-placeholder">
      Coming soon. This will preview the message your client receives with the invoice payment call to action.
    </p>
  </div>
);

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const buildDefaultDueDate = () => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, '0');
  const day = String(next.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const _INVOICE_TYPE_OPTIONS = [
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

export const InvoiceForm = forwardRef<InvoiceFormHandle, InvoiceFormProps>(({
  mode,
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
  readOnly = false,
  invoiceContext = 'default',
  existingInvoiceId,
  closeAfterSuccess = true,
  onClose,
  onSuccess,
  practiceName = null,
  practiceLogoUrl = null,
  practiceEmail = null,
  billingIncrementMinutes = null,
}, ref) => {
  const { showError } = useToastContext();
  const resolvedMode: InvoicePageMode = useMemo(() => {
    if (mode) return mode;
    if (readOnly) return 'readOnly';
    if (editMode) return 'edit';
    return 'create';
  }, [editMode, mode, readOnly]);
  const resolvedReadOnly = resolvedMode === 'readOnly' || readOnly;
  const resolvedEditMode = resolvedMode === 'edit' || resolvedMode === 'readOnly' || editMode;

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
  const defaultDueDate = useMemo(() => buildDefaultDueDate(), []);
  const [dueDate, setDueDate] = useState(initialDueDate ?? defaultDueDate);
  const [dueDateMode, setDueDateMode] = useState<'tomorrow' | 'custom'>(() => {
    const initial = initialDueDate ?? defaultDueDate;
    return initial === defaultDueDate ? 'tomorrow' : 'custom';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [createdInvoiceId, setCreatedInvoiceId] = useState<string | null>(
    resolvedEditMode ? existingInvoiceId ?? null : null
  );
  const [lastPersistedSnapshot, setLastPersistedSnapshot] = useState<string | null>(() => (
    resolvedEditMode && existingInvoiceId
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
  const [invoiceType, _setInvoiceType] = useState<Invoice['invoice_type']>(defaultInvoiceType);
  const [activePreviewTab, setActivePreviewTab] = useState<InvoicePreviewTab>('pdf');
  const isMatterScoped = Boolean(matter);
  const resolvedMatterId = isMatterScoped ? matter?.id ?? '' : matterId;
  const resolvedClientId = isMatterScoped ? matter?.clientId ?? '' : clientId;
  const resolvedMatterLabel = isMatterScoped
    ? (matter?.title ?? 'Matter invoice')
    : (matterOptions.find((option) => option.value === matterId)?.label ?? '');
  const resolvedClientLabel = isMatterScoped
    ? matter?.clientName ?? ''
    : (clientOptions.find((option) => option.value === clientId)?.label ?? '');
  // Client e-mail is stored as `meta` on standalone (non-matter-scoped) options
  const resolvedClientEmail = isMatterScoped
    ? null
    : (clientOptions.find((option) => option.value === clientId)?.meta ?? null);
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
  const previewIssueDate = useMemo(() => new Date(), []);

  // Preview toggle and last-saved timestamp
  const [showPreview, setShowPreview] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const isValidConnectedAccount = useMemo(
    () => Boolean(connectedAccountId && UUID_REGEX.test(connectedAccountId)),
    [connectedAccountId]
  );
  const disableActions = isSaving || isSending || resolvedReadOnly || !isValidConnectedAccount || lineItems.length === 0;

  const openSendDialog = useCallback(() => {
    if (resolvedReadOnly) return;
    if (!isValidConnectedAccount) {
      showError('Cannot send invoice', 'Complete Stripe onboarding before sending invoices.');
      return;
    }
    if (!resolvedClientId) {
      showError('Cannot send invoice', 'Choose a person first.');
      return;
    }
    if (lineItems.length === 0) {
      showError('Cannot send invoice', 'Add at least one line item.');
      return;
    }
    if (isSaving || isSending) return;
    setShowSendDialog(true);
  }, [isSaving, isSending, isValidConnectedAccount, lineItems.length, resolvedClientId, resolvedReadOnly, showError]);

  const logInvoiceAction = (action: string, details: Record<string, unknown>) => {
    if (import.meta.env.DEV) {
      console.info('[Billing][InvoiceForm]', action, details);
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

  const handleSendInvoice = async () => {
    if (!resolvedClientId) {
      showError('Could not send invoice', 'Choose a person before creating the invoice.');
      return;
    }
    if (disableActions || !connectedAccountId) return;
    setIsSaving(true);
    setIsSending(true);
    setSendError(null);
    let invoiceId = createdInvoiceId;
    try {
      if (resolvedEditMode && existingInvoiceId) {
        const payload = currentUpdatePayload;
        logInvoiceAction('update-before-send', {
          invoiceId: existingInvoiceId,
          invoiceType: payload.invoice_type
        });
        const updated = await updateInvoice(practiceId, existingInvoiceId, payload);
        invoiceId = updated?.id ?? existingInvoiceId;
        setCreatedInvoiceId(invoiceId);
        setLastPersistedSnapshot(currentUpdateSnapshot);
        setLastSavedAt(new Date());
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
        setLastSavedAt(new Date());
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
        setLastSavedAt(new Date());
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
      setIsSaving(false);
      setShowSendDialog(false);
    }
  };

  useImperativeHandle(ref, () => ({
    requestSend: openSendDialog,
  }), [openSendDialog]);

  // lastSavedAt is now set at the exact save call-sites (create/update/send)

  // Notify global shell about draft saves so the global header can show the timestamp
  useEffect(() => {
    if (!lastSavedAt) return;
    try {
      const detail = { timestamp: lastSavedAt.toISOString() };
      window.dispatchEvent(new CustomEvent('invoice:draft-saved', { detail }));
    } catch (err) {
      // ignore (server-side rendering or unavailable window)
    }
  }, [lastSavedAt]);

  // Listen for global hide-preview events so the header button can toggle the preview
  useEffect(() => {
    const handler = (ev: Event) => {
      const ce = ev as CustomEvent;
      // If detail.force === 'show' we show it; if 'hide' we hide; otherwise toggle
      const force = ce?.detail?.force as string | undefined;
      if (force === 'show') setShowPreview(true);
      else if (force === 'hide') setShowPreview(false);
      else setShowPreview((v) => !v);
    };
    window.addEventListener('invoice:hide-preview', handler as EventListener);
    return () => window.removeEventListener('invoice:hide-preview', handler as EventListener);
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <ContentWithPreview
        className="flex-1"
        contentClassName="space-y-5"
        /* Let the parent shell/header render the page-level header. */
        preview={ showPreview ? (
          <>
            <div className="mb-3">
              <Tabs
                items={INVOICE_PREVIEW_TABS}
                activeId={activePreviewTab}
                onChange={(id) => setActivePreviewTab(id as InvoicePreviewTab)}
              />
            </div>
            {activePreviewTab === 'pdf' ? (
              <InvoicePreview
                title={previewTitle}
                referenceLabel={previewReferenceLabel}
                lineItems={lineItems}
                issueDate={previewIssueDate}
                dueDate={dueDate}
                practiceName={practiceName}
                practiceLogoUrl={practiceLogoUrl}
                practiceEmail={practiceEmail}
                clientName={resolvedClientLabel || null}
                clientEmail={resolvedClientEmail}
                billingIncrementMinutes={billingIncrementMinutes}
                notes={notes || null}
              />
            ) : (
              <InvoiceEmailPlaceholder />
            )}
          </>
        ) : null }
      >
        {activePreviewTab === 'email' ? (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-input-text">Email delivery</h3>
            <p className="text-sm text-input-placeholder">
              Email copy controls will live here. For now, use the PDF tab to edit invoice details.
            </p>
          </section>
        ) : (
          <>
            {!resolvedReadOnly && !isValidConnectedAccount ? (
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
                  disabled={resolvedReadOnly}
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
                  disabled={resolvedReadOnly || !clientId}
                  clearable
                />
              </div>
            ) : null}
            <InvoiceLineItemsForm
              lineItems={lineItems}
              onChange={setLineItems}
              billingIncrementMinutes={billingIncrementMinutes}
              readOnly={resolvedReadOnly}
            />
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-input-text">Request payment</h3>
              <p className="text-xs text-input-placeholder">
                Choose when this invoice should be due.
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-input-text">
                  <input
                    type="radio"
                    name="due-date-mode"
                    checked={dueDateMode === 'tomorrow'}
                    onChange={() => {
                      setDueDateMode('tomorrow');
                      setDueDate(defaultDueDate);
                    }}
                    disabled={resolvedReadOnly}
                  />
                  <span>Due tomorrow ({defaultDueDate})</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-input-text">
                  <input
                    type="radio"
                    name="due-date-mode"
                    checked={dueDateMode === 'custom'}
                    onChange={() => setDueDateMode('custom')}
                    disabled={resolvedReadOnly}
                  />
                  <span>Custom due date</span>
                </label>
              </div>
              {dueDateMode === 'custom' ? (
                <Input
                  label="Due date"
                  type="date"
                  value={dueDate}
                  onChange={setDueDate}
                  disabled={resolvedReadOnly}
                  min={defaultDueDate}
                />
              ) : null}
            </section>
            <Textarea label="Notes to client" value={notes} onChange={setNotes} rows={3} disabled={resolvedReadOnly} />
            <Textarea label="Internal memo" value={memo} onChange={setMemo} rows={2} disabled={resolvedReadOnly} />
            {sendError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
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
          </>
        )}
      </ContentWithPreview>

      {!resolvedReadOnly ? (
        <SendInvoiceDialog
          isOpen={showSendDialog}
          totalAmount={total}
          onConfirm={handleSendInvoice}
          onCancel={() => setShowSendDialog(false)}
          loading={isSending}
          lineItems={lineItems}
          dueDate={dueDate}
          previewTitle={previewTitle}
          previewReferenceLabel={previewReferenceLabel}
          previewIssueDate={previewIssueDate}
          practiceName={practiceName}
          practiceLogoUrl={practiceLogoUrl}
          practiceEmail={practiceEmail}
          clientName={resolvedClientLabel || null}
          clientEmail={resolvedClientEmail}
          billingIncrementMinutes={billingIncrementMinutes}
          previewNotes={notes || null}
        />
      ) : null}
    </div>
  );
});
